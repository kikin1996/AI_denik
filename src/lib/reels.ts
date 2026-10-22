import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";

import type { JournalEntryRow } from "@/lib/supabase/types";

interface TranscriptMessage {
  role: string;
  message: string;
  time: number;
}

export interface ReelSoundbite {
  text: string;
  /** Seconds from the start of the original call recording, when known. */
  approxStartSeconds: number | null;
  approxEndSeconds: number | null;
}

export interface ReelPlan {
  introTitle: string;
  soundbites: ReelSoundbite[];
  mediaUrls: string[];
  notes: string;
}

const soundbiteSelectionSchema = z.object({
  introTitle: z.string(),
  selectedIndexes: z.array(z.number().int()).min(1).max(6),
  notes: z.string(),
});

const SYSTEM_PROMPT = `Jsi střihač, který z přepisu večerního hlasového deníku vybírá nejlepší věty \
pro voiceover krátkého Reels videa (9:16, cca 20-45s). Dostaneš očíslovaný seznam vět, které řekl \
POUZE uživatel (ne AI agent).

Vyber 3-5 vět (podle indexu), které:
- fungují samostatně mimo kontext (bez otázky agenta dávají smysl)
- jsou konkrétní, úderné, emotivní nebo zajímavé — ne obecné fráze jako "bylo to fajn"
- dohromady vyprávějí krátký oblouk (začátek -> co se dělo -> pointa/pocit)
- zachovej jejich PŮVODNÍ pořadí tak, jak šly za sebou v hovoru

Navrhni taky krátký český úvodní nápis na titulní kartu videa (2-5 slov, např. "Můj podnikatelský \
deníček", "Den, kdy se to zlomilo" — podle obsahu dne) a stručnou poznámku (1 věta) k celkovému \
vyznění pro člověka, co bude video stříhat.

Vrať VÝHRADNĚ JSON (žádný text okolo):
{
  "introTitle": string,
  "selectedIndexes": number[],
  "notes": string
}`;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in AI response");
  return JSON.parse(text.slice(start, end + 1));
}

async function selectWithAnthropic(prompt: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text block in AI response");
  return extractJson(textBlock.text);
}

async function selectWithOpenAI(prompt: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("No content in AI response");
  return extractJson(content);
}

/**
 * Picks 3-5 quotable user-only soundbites from a journal entry's transcript
 * for a Reels voiceover, and matches them back to real timestamps in the
 * original call recording when `transcript_messages` was captured (entries
 * recorded before that column existed won't have exact times).
 *
 * This only SELECTS text and proposes a title — it never invents content.
 * No video/audio is cut here; that's a separate, human-triggered step.
 */
export async function planReel(entry: JournalEntryRow): Promise<ReelPlan> {
  const timedMessages = (entry.transcript_messages as unknown as TranscriptMessage[] | null) ?? null;

  const userLines: { text: string; time: number | null }[] = timedMessages
    ? timedMessages
        .filter((m) => m.role === "user" && m.message?.trim())
        .map((m) => ({ text: m.message.trim(), time: m.time }))
    : (entry.raw_transcript ?? "")
        .split("\n")
        .filter((line) => /^(Uživatel|User):/i.test(line.trim()))
        .map((line) => ({ text: line.replace(/^(Uživatel|User):\s*/i, "").trim(), time: null }));

  if (userLines.length === 0) {
    throw new Error("No user-spoken lines found in transcript for this entry");
  }

  const numberedLines = userLines.map((l, i) => `${i}: ${l.text}`).join("\n");
  const prompt = `Přepis dnešního zápisu (${entry.date}):\n\n${numberedLines}`;

  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const raw = provider === "openai" ? await selectWithOpenAI(prompt) : await selectWithAnthropic(prompt);
  const parsed = soundbiteSelectionSchema.parse(raw);

  const validIndexes = parsed.selectedIndexes.filter((i) => i >= 0 && i < userLines.length);

  const soundbites: ReelSoundbite[] = validIndexes.map((i, position) => {
    const line = userLines[i];
    const nextTime =
      position + 1 < validIndexes.length ? userLines[validIndexes[position + 1]].time : null;
    return {
      text: line.text,
      approxStartSeconds: line.time,
      // Best-effort: assume the soundbite runs until the next selected
      // line's start, or ~6s if we're at the end / have no timing at all.
      approxEndSeconds: line.time !== null ? (nextTime ?? line.time + 6) : null,
    };
  });

  return {
    introTitle: parsed.introTitle,
    soundbites,
    mediaUrls: entry.media_urls ?? [],
    notes: parsed.notes,
  };
}

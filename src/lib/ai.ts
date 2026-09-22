import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";

const journalAnalysisSchema = z.object({
  summary: z.string(),
  mood_rating: z.number().min(1).max(10),
  key_events: z.array(z.string()),
  tags: z.array(z.string()),
});

export type JournalAnalysis = z.infer<typeof journalAnalysisSchema>;

const ANALYSIS_SYSTEM_PROMPT = `Jsi asistent, který zpracovává přepis večerního hlasového deníkového hovoru \
a proměňuje ho ve strukturovaný deníkový zápis. Piš v češtině, v empatickém, ale věcném tónu.

Vrať VÝHRADNĚ platný JSON (žádný text okolo) s tímto tvarem:
{
  "summary": string,       // 2-3 odstavce shrnující den, psáno v 1. osobě jako deníkový zápis uživatele
  "mood_rating": number,   // celé číslo 1-10, kde 1 = velmi špatný den, 10 = vynikající den
  "key_events": string[],  // 2-5 stručných bodů s klíčovými událostmi dne
  "tags": string[]         // 2-6 krátkých tagů/témat (např. "práce", "rodina", "sport", "stres", "vděčnost")
}`;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in AI response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function analyzeWithAnthropic(transcript: string): Promise<JournalAnalysis> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Přepis dnešního hovoru:\n\n"""\n${transcript}\n"""`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic response contained no text block");
  }

  return journalAnalysisSchema.parse(extractJson(textBlock.text));
}

async function analyzeWithOpenAI(transcript: string): Promise<JournalAnalysis> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: `Přepis dnešního hovoru:\n\n"""\n${transcript}\n"""` },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response contained no content");
  }

  return journalAnalysisSchema.parse(extractJson(content));
}

/**
 * Analyzes a raw call transcript and produces a structured journal entry:
 * summary, mood rating, key events, and topical tags.
 * Provider is chosen via AI_PROVIDER env var ("anthropic" | "openai"), defaulting to Anthropic.
 */
export async function analyzeJournalTranscript(transcript: string): Promise<JournalAnalysis> {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();

  if (!transcript || transcript.trim().length === 0) {
    throw new Error("Cannot analyze an empty transcript");
  }

  if (provider === "openai") {
    return analyzeWithOpenAI(transcript);
  }
  return analyzeWithAnthropic(transcript);
}

import { NextResponse, type NextRequest } from "next/server";

import { analyzeJournalTranscript } from "@/lib/ai";
import { getMobileUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TranscriptTurn {
  speaker: "agent" | "user";
  text: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map((turn) => `${turn.speaker === "agent" ? "DayStory" : "Uživatel"}: ${turn.text}`)
    .join("\n");
}

/**
 * Called by the mobile app right after an in-app VoIP call ends. Mirrors
 * /api/webhooks/vapi's end-of-call-report handling, but the transcript
 * comes from the OpenAI Realtime session (collected client-side turn by
 * turn) instead of Vapi's webhook payload.
 */
export async function POST(request: NextRequest) {
  const auth = await getMobileUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { turns } = (await request.json()) as { turns: TranscriptTurn[] };

  if (!Array.isArray(turns) || turns.length === 0) {
    return NextResponse.json({ error: "Empty transcript" }, { status: 400 });
  }

  const transcript = formatTranscript(turns);

  let analysis;
  try {
    analysis = await analyzeJournalTranscript(transcript);
  } catch (err) {
    console.error("AI analysis failed for mobile call", err);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }

  const { error } = await auth.supabase.from("journal_entries").upsert(
    {
      user_id: auth.profile.id,
      date: todayIsoDate(),
      raw_transcript: transcript,
      summary: analysis.summary,
      mood_rating: analysis.mood_rating,
      key_events: analysis.key_events,
      tags: analysis.tags,
    },
    { onConflict: "user_id,date" }
  );

  if (error) {
    console.error("Failed to save journal entry from mobile call", error);
    return NextResponse.json({ error: "Failed to save journal entry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

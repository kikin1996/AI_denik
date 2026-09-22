import { NextResponse, type NextRequest } from "next/server";

import { analyzeJournalTranscript } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/server";
import type { CallStatus } from "@/lib/supabase/types";
import { verifyVapiWebhookSecret } from "@/lib/vapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VapiMessagePayload {
  message: {
    type: string;
    call?: {
      id?: string;
      customer?: { number?: string };
      metadata?: Record<string, unknown>;
    };
    transcript?: string;
    artifact?: {
      transcript?: string;
      recordingUrl?: string;
    };
    recordingUrl?: string;
    durationSeconds?: number;
    endedReason?: string;
    status?: string;
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const secretHeader = request.headers.get("x-vapi-secret");
  if (!verifyVapiWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const payload = (await request.json()) as VapiMessagePayload;
  const message = payload.message;

  if (!message) {
    return NextResponse.json({ error: "Missing message payload" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Track intermediate status updates (queued/ringing/in-progress) for observability.
  if (message.type === "status-update" && message.call?.id) {
    await supabase
      .from("call_logs")
      .update({ status: mapVapiStatus(message.status) })
      .eq("vapi_call_id", message.call.id);
    return NextResponse.json({ ok: true });
  }

  if (message.type !== "end-of-call-report") {
    // Ignore other event types (e.g. transcript partials, hang notifications).
    return NextResponse.json({ ok: true, ignored: message.type });
  }

  const callId = message.call?.id;
  const customerNumber = message.call?.customer?.number;
  const transcript = message.transcript || message.artifact?.transcript || "";
  const recordingUrl = message.recordingUrl || message.artifact?.recordingUrl || null;
  const durationSeconds = message.durationSeconds ?? null;

  if (!customerNumber) {
    return NextResponse.json({ error: "Missing customer phone number" }, { status: 400 });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("phone_number", customerNumber)
    .maybeSingle();

  if (userError || !user) {
    console.error("Vapi webhook: unknown user for phone number", customerNumber, userError);
    return NextResponse.json({ error: "User not found for phone number" }, { status: 404 });
  }

  // Update (or create) the call log for this call.
  if (callId) {
    await supabase
      .from("call_logs")
      .upsert(
        {
          user_id: user.id,
          vapi_call_id: callId,
          status: message.endedReason === "error" ? "failed" : "completed",
          duration_seconds: durationSeconds,
        },
        { onConflict: "vapi_call_id" }
      );
  }

  if (!transcript.trim()) {
    console.warn("Vapi webhook: empty transcript for call", callId);
    return NextResponse.json({ ok: true, warning: "empty transcript" });
  }

  let analysis;
  try {
    analysis = await analyzeJournalTranscript(transcript);
  } catch (err) {
    console.error("AI analysis failed for call", callId, err);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }

  const date = todayIsoDate();

  const { error: upsertError } = await supabase
    .from("journal_entries")
    .upsert(
      {
        user_id: user.id,
        date,
        raw_transcript: transcript,
        summary: analysis.summary,
        mood_rating: analysis.mood_rating,
        key_events: analysis.key_events,
        tags: analysis.tags,
        audio_url: recordingUrl,
      },
      { onConflict: "user_id,date" }
    );

  if (upsertError) {
    console.error("Failed to save journal entry", upsertError);
    return NextResponse.json({ error: "Failed to save journal entry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function mapVapiStatus(status?: string): CallStatus {
  switch (status) {
    case "queued":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in-progress";
    case "forwarding":
      return "in-progress";
    case "ended":
      return "completed";
    default:
      return "initiated";
  }
}

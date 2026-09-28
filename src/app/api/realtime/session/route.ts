import { NextResponse, type NextRequest } from "next/server";

import { getMobileUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REALTIME_MODEL = "gpt-realtime-2.1";

/**
 * Mints a short-lived OpenAI Realtime API client secret for the mobile app.
 * The app never sees OPENAI_API_KEY directly — only this single-use
 * ephemeral token, which it uses to open one WebRTC session.
 * https://developers.openai.com/api/docs/guides/realtime-webrtc
 */
export async function POST(request: NextRequest) {
  const auth = await getMobileUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        audio: {
          output: { voice: "marin" },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to mint OpenAI Realtime client secret", errorText);
    return NextResponse.json({ error: "Failed to mint realtime session" }, { status: 502 });
  }

  const json = await response.json();
  const clientSecret = json.value ?? json.client_secret?.value ?? json.client_secret;

  if (!clientSecret) {
    console.error("Unexpected OpenAI Realtime response shape", json);
    return NextResponse.json({ error: "Unexpected response from OpenAI" }, { status: 502 });
  }

  return NextResponse.json({ client_secret: clientSecret });
}

import { NextResponse, type NextRequest } from "next/server";

import { getMobileUser } from "@/lib/supabase/server";
import type { PushPlatform } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegisterPushTokenBody {
  platform: PushPlatform;
  voipToken?: string;
  devicePushToken?: string;
}

export async function POST(request: NextRequest) {
  const auth = await getMobileUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as RegisterPushTokenBody;
  if (body.platform !== "ios" && body.platform !== "android") {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  if (!body.voipToken && !body.devicePushToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const { error } = await auth.supabase.from("push_tokens").upsert(
    {
      user_id: auth.profile.id,
      platform: body.platform,
      voip_token: body.voipToken ?? null,
      device_push_token: body.devicePushToken ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,platform" }
  );

  if (error) {
    console.error("Failed to save push token", error);
    return NextResponse.json({ error: "Failed to save push token" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

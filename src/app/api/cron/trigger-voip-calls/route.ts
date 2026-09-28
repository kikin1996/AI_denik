import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendVoipPush } from "@/lib/apns";
import type { UserRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mobile-app counterpart to /api/cron/trigger-calls: instead of placing a
 * real Vapi phone call, wakes each due user's iOS app via an APNs VoIP push
 * so it can show the native CallKit incoming-call screen. Schedule this
 * hourly alongside (or instead of) trigger-calls, same CRON_SECRET.
 *
 * Android devices are intentionally skipped here — FCM high-priority
 * messages need a separate Firebase service-account credential this project
 * doesn't have configured yet (see mobile/README.md for what's missing).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .eq("call_enabled", true);

  if (error) {
    console.error("Failed to load users for VoIP cron trigger", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }

  const usersDueNow = (users ?? []).filter(isUserDueForCallThisHour);

  const results = await Promise.allSettled(
    usersDueNow.map(async (user) => {
      const { data: pushToken } = await supabase
        .from("push_tokens")
        .select("*")
        .eq("user_id", user.id)
        .eq("platform", "ios")
        .maybeSingle();

      if (!pushToken?.voip_token) {
        throw new Error(`No iOS VoIP token registered for user ${user.id}`);
      }

      const uuid = randomUUID();
      await sendVoipPush(pushToken.voip_token, { uuid, callerName: "DayStory" });
      return { userId: user.id, uuid };
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected");

  if (failed.length > 0) {
    console.error(
      "Some VoIP pushes failed to send",
      failed.map((f) => (f as PromiseRejectedResult).reason?.message)
    );
  }

  return NextResponse.json({
    checked: users?.length ?? 0,
    triggered: usersDueNow.length,
    succeeded,
    failed: failed.length,
  });
}

function isUserDueForCallThisHour(user: UserRow): boolean {
  const [preferredHour] = user.preferred_call_time.split(":").map(Number);
  const nowInUserTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: user.timezone || "UTC" })
  );
  return nowInUserTz.getHours() === preferredHour;
}

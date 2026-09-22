import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";
import { startDiaryCall } from "@/lib/vapi";
import type { UserRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs hourly (see vercel.json cron schedule). For every user whose local
 * time currently matches their preferred_call_time (same hour), triggers an
 * outbound Vapi call. Intended to be invoked by a trusted scheduler only.
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
    console.error("Failed to load users for cron trigger", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }

  const usersWithPhone = (users ?? []).filter(
    (user): user is UserRow & { phone_number: string } => Boolean(user.phone_number)
  );
  const usersDueNow = usersWithPhone.filter(isUserDueForCallThisHour);

  const results = await Promise.allSettled(
    usersDueNow.map(async (user) => {
      const call = await startDiaryCall({
        phoneNumber: user.phone_number!,
        metadata: { userId: user.id },
      });

      await supabase.from("call_logs").insert({
        user_id: user.id,
        vapi_call_id: call.id,
        status: "initiated",
      });

      return { userId: user.id, callId: call.id };
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected");

  if (failed.length > 0) {
    console.error(
      "Some diary calls failed to start",
      failed.map((f) => (f as PromiseRejectedResult).reason)
    );
  }

  return NextResponse.json({
    checked: users?.length ?? 0,
    triggered: usersDueNow.length,
    succeeded,
    failed: failed.length,
  });
}

/**
 * Returns true if "now" in the user's timezone falls within the same hour
 * as their preferred_call_time. Since this cron runs hourly, matching on the
 * hour (rather than the exact minute) guarantees each user gets called once.
 */
function isUserDueForCallThisHour(user: UserRow): boolean {
  const [preferredHour] = user.preferred_call_time.split(":").map(Number);

  const nowInUserTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: user.timezone || "UTC" })
  );

  return nowInUserTz.getHours() === preferredHour;
}

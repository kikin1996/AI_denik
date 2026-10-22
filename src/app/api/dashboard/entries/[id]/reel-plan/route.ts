import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { planReel } from "@/lib/reels";
import type { JournalEntryRow, Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generates (or regenerates) the Reel cut plan for one journal entry:
 * AI-selected soundbites from the user's own words + a proposed title.
 * Does not touch any audio/video/image files — see src/lib/reels.ts.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: entry, error: fetchError } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  let plan;
  try {
    plan = await planReel(entry as JournalEntryRow);
  } catch (err) {
    console.error("Failed to plan reel for entry", id, err);
    const message = err instanceof Error ? err.message : "Failed to plan reel";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const { error: updateError } = await supabase
    .from("journal_entries")
    .update({ reel_plan: plan as unknown as Json })
    .eq("id", id);

  if (updateError) {
    console.error("Failed to save reel plan", updateError);
    return NextResponse.json({ error: "Failed to save reel plan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plan });
}

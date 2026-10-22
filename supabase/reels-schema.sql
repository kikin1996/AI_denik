-- DayStory Reels — schema addition for cutting daily entries into Reels videos.
-- Run this in the Supabase SQL editor after schema.sql.

alter table public.journal_entries
  -- Timestamped transcript from Vapi's artifact.transcript ({role, message,
  -- time}[], time = seconds from call start). Captured going forward only —
  -- entries recorded before this column existed will have it null, so exact
  -- audio trimming for a Reel needs the time to be looked up from the raw
  -- recording manually for those older days.
  add column if not exists transcript_messages jsonb,
  -- AI-proposed cut plan for a Reel (intro title, selected user soundbites
  -- with their approximate time range, suggested media order). Generated
  -- on demand by POST /api/dashboard/entries/[id]/reel-plan, edited by
  -- re-generating; the actual video cut still happens as a separate,
  -- human-triggered step (see README.md).
  add column if not exists reel_plan jsonb;

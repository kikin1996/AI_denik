-- DayStory mobile — schema addition for VoIP/push call delivery.
-- Run this in the Supabase SQL editor AFTER supabase/schema.sql.
-- Adds one table; the mobile app otherwise reads/writes the existing
-- `users` and `journal_entries` tables directly (same Supabase project).

create table if not exists public.push_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  voip_token text,
  device_push_token text,
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Users can upsert/read their own device tokens from the mobile app.
create policy "Users can view own push tokens"
  on public.push_tokens for select
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

create policy "Users can insert own push tokens"
  on public.push_tokens for insert
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

create policy "Users can update own push tokens"
  on public.push_tokens for update
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

-- Note: the trigger-voip-calls cron job reads this table via the service-role
-- admin client (see src/lib/supabase/server.ts -> createAdminClient), which
-- bypasses RLS, so no additional policy is needed for that job.

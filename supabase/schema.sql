-- AI Deník — database schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "uuid-ossp";

-- ==========================================================================
-- users: app-level profile, linked 1:1 with auth.users
-- ==========================================================================
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  email text,
  phone_number text unique,
  timezone text not null default 'Europe/Prague',
  preferred_call_time time not null default '20:00:00',
  call_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists users_phone_number_idx on public.users (phone_number);

-- ==========================================================================
-- journal_entries: one structured entry per user per day
-- ==========================================================================
create table if not exists public.journal_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null default current_date,
  raw_transcript text,
  summary text,
  mood_rating smallint check (mood_rating between 1 and 10),
  key_events jsonb default '[]'::jsonb,
  tags text[] default '{}',
  media_urls text[] default '{}',
  audio_url text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists journal_entries_user_id_date_idx
  on public.journal_entries (user_id, date desc);

-- ==========================================================================
-- call_logs: history of outbound Vapi calls
-- ==========================================================================
create table if not exists public.call_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  vapi_call_id text unique,
  status text not null default 'initiated'
    check (status in ('initiated', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer')),
  duration_seconds integer,
  timestamp timestamptz not null default now()
);

create index if not exists call_logs_user_id_idx on public.call_logs (user_id);

-- ==========================================================================
-- Row Level Security
-- ==========================================================================
alter table public.users enable row level security;
alter table public.journal_entries enable row level security;
alter table public.call_logs enable row level security;

-- users: a person can only see/update their own profile row.
create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = auth_user_id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = auth_user_id);

create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = auth_user_id);

-- journal_entries: only accessible to the owning user.
create policy "Users can view own journal entries"
  on public.journal_entries for select
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

create policy "Users can insert own journal entries"
  on public.journal_entries for insert
  with check (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

create policy "Users can update own journal entries"
  on public.journal_entries for update
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

-- call_logs: read-only for the owning user; writes happen via service role only.
create policy "Users can view own call logs"
  on public.call_logs for select
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
  );

-- Note: webhooks and the cron job use the Supabase service-role key
-- (see src/lib/supabase/server.ts -> createAdminClient), which bypasses RLS
-- entirely, so no additional INSERT/UPDATE policies are needed for them.

-- ==========================================================================
-- Storage bucket for WhatsApp media (photos) and call recordings
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('journal-media', 'journal-media', true)
on conflict (id) do nothing;

create policy "Public read access to journal media"
  on storage.objects for select
  using (bucket_id = 'journal-media');

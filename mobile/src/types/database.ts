/**
 * Mirrors the shared Supabase schema (see /supabase/schema.sql in the web
 * app repo, plus /supabase/mobile-schema.sql for the push_tokens addition).
 * Kept as a hand-written subset rather than full generated types to avoid
 * pulling in the Supabase CLI codegen toolchain for the mobile app.
 */

export interface UserRow {
  id: string;
  auth_user_id: string;
  email: string | null;
  phone_number: string | null;
  timezone: string;
  preferred_call_time: string;
  call_enabled: boolean;
  created_at: string;
}

export interface JournalEntryRow {
  id: string;
  user_id: string;
  date: string;
  raw_transcript: string | null;
  summary: string | null;
  mood_rating: number | null;
  key_events: string[] | null;
  tags: string[] | null;
  media_urls: string[] | null;
  audio_url: string | null;
  created_at: string;
}

export type PushPlatform = "ios" | "android";

export interface PushTokenRow {
  id: string;
  user_id: string;
  platform: PushPlatform;
  voip_token: string | null;
  device_push_token: string | null;
  updated_at: string;
}

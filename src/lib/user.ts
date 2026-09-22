import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/supabase/types";

/**
 * Returns the logged-in Supabase Auth user's corresponding row in public.users,
 * creating it on first login (e.g. right after a magic-link sign-in) so the
 * rest of the app always has a profile to read/update.
 */
export async function getOrCreateUserProfile(): Promise<UserRow | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: existingProfile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (existingProfile) return existingProfile;

  const { data: newProfile, error } = await supabase
    .from("users")
    .insert({
      auth_user_id: authUser.id,
      email: authUser.email,
      timezone: "Europe/Prague",
      preferred_call_time: "20:00:00",
      call_enabled: false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Failed to create user profile", error);
    return null;
  }

  return newProfile;
}

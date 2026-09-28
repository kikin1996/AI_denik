/**
 * Expo only exposes env vars prefixed EXPO_PUBLIC_ to app code (inlined at
 * build time, same idea as Next.js's NEXT_PUBLIC_ prefix on the web app).
 * Set these in mobile/.env — see mobile/.env.example.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy mobile/.env.example to mobile/.env.`);
  }
  return value;
}

export const env = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ),
  /** Base URL of the DayStory web app's backend (Next.js API routes). */
  apiBaseUrl: required("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL),
};

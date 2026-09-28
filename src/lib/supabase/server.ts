import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";

/**
 * Server client scoped to the logged-in user's session (respects RLS).
 * Use inside Server Components, Route Handlers, and Server Actions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no request context; safe to ignore
            // because middleware refreshes the session on every request.
          }
        },
      },
    }
  );
}

/**
 * Stateless client for the mobile app's bearer-token requests (no cookies —
 * the Expo app sends `Authorization: Bearer <supabase_access_token>`
 * instead). Respects RLS as that user, same as the cookie-based client.
 */
export function createClientForToken(accessToken: string) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op: stateless bearer-token requests have no cookie jar
        },
      },
    }
  );
}

/**
 * Verifies a Supabase access token from an `Authorization: Bearer` header
 * (used by the mobile app's API routes) and returns the matching row in
 * public.users, or null if the token is missing/invalid or has no profile.
 */
export async function getMobileUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClientForToken(token);
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !authUser) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (!profile) return null;

  return { supabase, profile };
}

/**
 * Service-role client that bypasses RLS. Only for trusted server contexts:
 * webhooks (Vapi/WhatsApp) and cron jobs that act on behalf of many users.
 * NEVER expose this client or the service role key to the browser.
 */
export function createAdminClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op: the admin client is not tied to a browser session
        },
      },
    }
  );
}

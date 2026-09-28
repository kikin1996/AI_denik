import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase";
import type { UserRow } from "@/types/database";

interface AuthContextValue {
  session: Session | null;
  profile: UserRow | null;
  loading: boolean;
  requestCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Ensures the logged-in Supabase Auth user has a row in public.users,
 * mirroring getOrCreateUserProfile() in the web app's src/lib/user.ts so a
 * first login from the phone works just as well as one from the browser.
 */
async function getOrCreateProfile(authUserId: string, email: string | null): Promise<UserRow | null> {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existing) return existing as UserRow;

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      auth_user_id: authUserId,
      email,
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
  return created as UserRow;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(currentSession: Session | null) {
    if (!currentSession) {
      setProfile(null);
      return;
    }
    const p = await getOrCreateProfile(currentSession.user.id, currentSession.user.email ?? null);
    setProfile(p);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      await loadProfile(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      // Sends a 6-digit code by email rather than a magic link — a link would
      // need a deep-link scheme to route back into the app; a typed code
      // keeps sign-in inside the app with no extra native config.
      requestCode: async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
      },
      verifyCode: async (email: string, code: string) => {
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        await loadProfile(session);
      },
    }),
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

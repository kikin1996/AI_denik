"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import type { UserRow } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const TIMEZONES = [
  "Europe/Prague",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
];

export function SettingsForm({ profile }: { profile: UserRow }) {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState(profile.phone_number ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [callTime, setCallTime] = useState(profile.preferred_call_time.slice(0, 5));
  const [callEnabled, setCallEnabled] = useState(profile.call_enabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({
        phone_number: phoneNumber || null,
        timezone,
        preferred_call_time: `${callTime}:00`,
        call_enabled: callEnabled,
      })
      .eq("id", profile.id);

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("saved");
    router.refresh();
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl font-normal">
            Nastavení večerního hovoru
          </CardTitle>
          <CardDescription>
            Agent ti zavolá na toto číslo v nastavený čas a projde s tebou uplynulý den.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="phone">Telefonní číslo</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+420123456789"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Ve formátu E.164, např. +420123456789. Použije se i pro WhatsApp zprávy.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="callTime">Čas hovoru</Label>
              <Input
                id="callTime"
                type="time"
                value={callTime}
                onChange={(e) => setCallTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Časové pásmo</Label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Denní hovory zapnuty</p>
              <p className="text-xs text-muted-foreground">
                Když je vypnuto, agent ti nebude volat automaticky.
              </p>
            </div>
            <input
              type="checkbox"
              checked={callEnabled}
              onChange={(e) => setCallEnabled(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </div>

          {status === "error" && errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
          {status === "saved" && (
            <p className="text-sm text-emerald-600">Nastavení uloženo.</p>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Odhlásit se
          </Button>
          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Uložit nastavení
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

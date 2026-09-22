import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserProfile } from "@/lib/user";
import { JournalCard } from "@/components/journal-card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const profile = await getOrCreateUserProfile();
  if (!profile) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", profile.id)
    .order("date", { ascending: false });

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-5">
          <span className="font-display text-lg">AI Deník</span>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/settings">
              <Settings className="mr-2 h-4 w-4" />
              Nastavení
            </Link>
          </Button>
        </div>
      </header>

      <div className="container max-w-2xl py-10">
        {!profile.phone_number && (
          <div className="mb-8 flex items-center justify-between rounded-md border border-border bg-secondary/60 px-5 py-4">
            <p className="text-sm">Ještě jsi nenastavil/a telefonní číslo pro večerní hovory.</p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/settings">Nastavit</Link>
            </Button>
          </div>
        )}

        {!entries || entries.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Zatím tu nemáš žádné zápisy. Jakmile ti agent zavolá nebo pošleš fotky přes WhatsApp,
            objeví se tady tvůj první zápis.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <JournalCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

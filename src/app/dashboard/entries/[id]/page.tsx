import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateUserProfile } from "@/lib/user";
import { moodColor, moodLabel } from "@/lib/mood";
import { Button } from "@/components/ui/button";

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getOrCreateUserProfile();
  if (!profile) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("id", id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!entry) {
    notFound();
  }

  const weekday = new Date(entry.date).toLocaleDateString("cs-CZ", { weekday: "long" });
  const rest = new Date(entry.date).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex items-center gap-3 py-5">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="font-display text-lg">AI Deník</span>
        </div>
      </header>

      <div className="container max-w-2xl py-12">
        <div className="flex gap-5">
          <div
            className="w-1 shrink-0 self-stretch rounded-full"
            style={{ backgroundColor: moodColor(entry.mood_rating) }}
            aria-hidden
          />

          <div className="min-w-0 flex-1 space-y-10 pb-12">
            <div>
              <p className="font-display text-3xl leading-tight">
                <span className="capitalize">{weekday}</span>{" "}
                <span className="text-muted-foreground">{rest}</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {moodLabel(entry.mood_rating)}
                {entry.mood_rating !== null && ` · ${entry.mood_rating}/10`}
              </p>
            </div>

            <div className="space-y-5">
              <p className="max-w-xl whitespace-pre-line leading-relaxed text-foreground/90">
                {entry.summary ?? "Zápis se ještě zpracovává."}
              </p>

              {entry.tags && entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  {entry.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {entry.key_events && entry.key_events.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm text-muted-foreground">Klíčové události</h2>
                <ul className="space-y-2 text-sm leading-relaxed">
                  {entry.key_events.map((event, i) => (
                    <li key={i} className="border-l border-border pl-3">
                      {event}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {entry.audio_url && (
              <div>
                <h2 className="mb-3 text-sm text-muted-foreground">Nahrávka hovoru</h2>
                <audio controls className="w-full" src={entry.audio_url} />
              </div>
            )}

            {entry.media_urls && entry.media_urls.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm text-muted-foreground">Fotky</h2>
                <div className="grid grid-cols-3 gap-2">
                  {entry.media_urls.map((url) => (
                    <div key={url} className="relative aspect-square overflow-hidden rounded-sm">
                      <Image src={url} alt="Fotka ze dne" fill className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {entry.raw_transcript && (
              <div className="border-t border-border pt-8">
                <h2 className="mb-3 text-sm text-muted-foreground">Celý přepis</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {entry.raw_transcript}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

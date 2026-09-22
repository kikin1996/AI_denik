import Link from "next/link";
import Image from "next/image";

import type { JournalEntryRow } from "@/lib/supabase/types";
import { moodColor, moodLabel } from "@/lib/mood";

function formatDate(dateStr: string): { weekday: string; rest: string } {
  const date = new Date(dateStr);
  const weekday = date.toLocaleDateString("cs-CZ", { weekday: "long" });
  const rest = date.toLocaleDateString("cs-CZ", { day: "numeric", month: "long" });
  return { weekday, rest };
}

export function JournalCard({ entry }: { entry: JournalEntryRow }) {
  const { weekday, rest } = formatDate(entry.date);
  const previewImages = (entry.media_urls ?? []).slice(0, 4);
  const color = moodColor(entry.mood_rating);

  return (
    <Link
      href={`/dashboard/entries/${entry.id}`}
      className="group flex gap-4 rounded-md border border-border bg-card py-5 pl-4 pr-5 transition-colors hover:border-foreground/20"
    >
      <div
        className="w-1 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />

      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-lg leading-none">
            <span className="capitalize">{weekday}</span>{" "}
            <span className="text-muted-foreground">{rest}</span>
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {moodLabel(entry.mood_rating)}
          </span>
        </div>

        <p className="line-clamp-2 text-[0.95rem] leading-relaxed text-foreground/85">
          {entry.summary ?? "Zápis se zpracovává…"}
        </p>

        {(entry.tags?.length || previewImages.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            {entry.tags?.map((tag) => (
              <span key={tag} className="text-xs text-muted-foreground">
                {tag}
              </span>
            ))}

            {previewImages.length > 0 && (
              <div className="flex -space-x-2">
                {previewImages.map((url) => (
                  <div
                    key={url}
                    className="relative h-7 w-7 overflow-hidden rounded-sm border border-background"
                  >
                    <Image src={url} alt="Fotka ze dne" fill className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

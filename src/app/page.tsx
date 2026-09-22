import Link from "next/link";

import { Button } from "@/components/ui/button";
import { moodColor } from "@/lib/mood";

const CALL_PREVIEW = [
  { speaker: "agent" as const, line: "Jaký byl dnešně tvůj den?" },
  { speaker: "user" as const, line: "Docela náročný, ale večer jsem konečně doběhl ven." },
  { speaker: "agent" as const, line: "To zní jako dobrý závěr dne. Co ti běh dal?" },
];

const STEPS = [
  {
    n: "01",
    title: "Večer ti zavolá",
    body: "V čas, který si sám nastavíš, agent vytočí tvoje číslo — žádná appka, žádné psaní.",
  },
  {
    n: "02",
    title: "Chvíli si popovídáte",
    body: "Dvě až čtyři minuty o tom, jaký byl den. Fotky můžeš doplnit přes WhatsApp.",
  },
  {
    n: "03",
    title: "Ráno máš hotový zápis",
    body: "Přepis, shrnutí a nálada dne se samy uloží do tvého deníku.",
  },
];

const SAMPLE_ENTRY = {
  weekday: "Úterý",
  date: "16. září",
  mood: 8,
  summary:
    "Dopoledne se táhla porada, ale odpoledne se povedlo dodělat prezentaci dřív, než jsem čekal. Večer běh podél řeky — první delší trasa po měsíci, nohy to ještě cítí. Petr psal, že se v sobotu stavíme na kafe.",
  tags: ["práce", "sport", "přátelé"],
};

export default function HomePage() {
  return (
    <main className="bg-background">
      {/* Hero: dusk gradient, the call itself is the hero moment */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 20% 0%, hsl(38 68% 58% / 0.18), transparent 60%)",
          }}
          aria-hidden
        />

        <div className="container relative max-w-3xl py-20 sm:py-28">
          <p className="mb-5 text-sm text-primary-foreground/70">AI Deník</p>

          <h1 className="max-w-xl font-display text-4xl leading-[1.1] sm:text-5xl">
            Jaký byl dnešně tvůj den?
          </h1>

          <p className="mt-6 max-w-md text-primary-foreground/75">
            Každý večer ti zavolá AI agent a popovídá si s tebou o dni. Hovor se sám promění ve
            zápis do deníku — s náladou, tématy i fotkami, které pošleš přes WhatsApp.
          </p>

          <div className="mt-9">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/login">Začít</Link>
            </Button>
          </div>

          {/* Literal call preview — the product's actual artifact, not a decorative icon */}
          <div className="mt-14 max-w-md rounded-md border border-primary-foreground/15 bg-primary-foreground/5 p-5 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2 text-xs text-primary-foreground/60">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              20:03 · dnešní hovor
            </div>
            <div className="space-y-3 text-sm">
              {CALL_PREVIEW.map((turn, i) => (
                <p
                  key={i}
                  className={
                    turn.speaker === "agent"
                      ? "text-primary-foreground/70"
                      : "font-medium text-primary-foreground"
                  }
                >
                  {turn.line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works — a real 3-step sequence, numbered because it is one */}
      <section className="border-b border-border">
        <div className="container max-w-3xl py-16">
          <ol className="grid gap-10 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="font-display text-2xl text-muted-foreground">{step.n}</span>
                <h2 className="mt-3 font-display text-lg">{step.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* A real sample page from the diary, not an abstract feature list */}
      <section className="container max-w-3xl py-20">
        <p className="mb-6 text-sm text-muted-foreground">Takhle vypadá zápis</p>

        <div className="flex gap-4 rounded-md border border-border bg-card py-6 pl-5 pr-6">
          <div
            className="w-1 shrink-0 rounded-full"
            style={{ backgroundColor: moodColor(SAMPLE_ENTRY.mood) }}
            aria-hidden
          />
          <div className="space-y-3">
            <p className="font-display text-xl">
              {SAMPLE_ENTRY.weekday} <span className="text-muted-foreground">{SAMPLE_ENTRY.date}</span>
            </p>
            <p className="max-w-xl leading-relaxed text-foreground/85">{SAMPLE_ENTRY.summary}</p>
            <div className="flex flex-wrap gap-x-3 pt-1 text-xs text-muted-foreground">
              {SAMPLE_ENTRY.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-border pt-8">
          <p className="text-sm text-muted-foreground">
            Fotky a poznámky navíc pošleš přímo přes WhatsApp.
          </p>
          <Button asChild>
            <Link href="/login">Začít psát deník</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

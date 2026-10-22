"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReelPlan } from "@/lib/reels";

function formatTime(seconds: number | null): string {
  if (seconds === null) return "čas neznámý";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ReelPlanSection({
  entryId,
  entryDate,
  initialPlan,
}: {
  entryId: string;
  entryDate: string;
  initialPlan: ReelPlan | null;
}) {
  const [plan, setPlan] = useState<ReelPlan | null>(initialPlan);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/entries/${entryId}/reel-plan`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Nepodařilo se připravit podklady.");
      setPlan(json.plan);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodařilo se připravit podklady.");
      setStatus("error");
    }
  }

  return (
    <div className="border-t border-border pt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-muted-foreground">Podklady pro Reels</h2>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={status === "loading"}>
          {status === "loading" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {plan ? "Připravit znovu" : "Připravit podklady"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {plan && (
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-xs text-muted-foreground">Navržený úvodní nápis</p>
            <p className="font-display text-xl">{plan.introTitle}</p>
          </div>

          <div>
            <p className="mb-2 text-xs text-muted-foreground">Vybrané soundbity (tvůj hlas, v pořadí)</p>
            <ol className="space-y-3">
              {plan.soundbites.map((sb, i) => (
                <li key={i} className="border-l border-border pl-3 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {formatTime(sb.approxStartSeconds)} – {formatTime(sb.approxEndSeconds)}
                  </span>
                  <p className="leading-relaxed">„{sb.text}“</p>
                </li>
              ))}
            </ol>
          </div>

          {plan.mediaUrls.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {plan.mediaUrls.length} fotka/fotky z WhatsApp se použijí jako b-roll.
            </p>
          )}

          <p className="text-sm text-muted-foreground">{plan.notes}</p>

          <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            Napiš Claudovi v chatu: „udělej reels z {entryDate}“ — sestřihá podle téhle volby nahrávku,
            fotky přidá jako b-roll a přidá titulky. Žádný obsah se negeneruje, jen se stříhá to, co
            doopravdy je v nahrávce a ve fotkách.
          </p>
        </div>
      )}
    </div>
  );
}

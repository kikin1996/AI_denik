/**
 * Mood is rendered as a color, not a traffic-light badge: a continuous
 * dusk-to-lamplight gradient (indigo -> taupe -> amber) that mirrors the
 * evening-call palette, so a run of entries reads as a "mood river" at a
 * glance instead of a row of disconnected pills.
 */

interface HslStop {
  h: number;
  s: number;
  l: number;
}

const LOW: HslStop = { h: 248, s: 38, l: 30 }; // heavy day — deep dusk indigo
const MID: HslStop = { h: 280, s: 10, l: 54 }; // ordinary day — quiet taupe
const HIGH: HslStop = { h: 38, s: 68, l: 57 }; // good day — lamplight amber

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpStop(a: HslStop, b: HslStop, t: number): HslStop {
  return { h: lerp(a.h, b.h, t), s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t) };
}

function toHslString({ h, s, l }: HslStop): string {
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

/** Returns a CSS color string for a 1-10 mood rating (null = neutral grey). */
export function moodColor(rating: number | null): string {
  if (rating === null) return "hsl(250 8% 65%)";
  const t = Math.min(Math.max((rating - 1) / 9, 0), 1);
  const stop = t <= 0.5 ? lerpStop(LOW, MID, t / 0.5) : lerpStop(MID, HIGH, (t - 0.5) / 0.5);
  return toHslString(stop);
}

/** Short, plain-language description of where a rating sits on the scale. */
export function moodLabel(rating: number | null): string {
  if (rating === null) return "Nezpracováno";
  if (rating >= 9) return "Výborný den";
  if (rating >= 7) return "Dobrý den";
  if (rating >= 5) return "Obyčejný den";
  if (rating >= 3) return "Těžší den";
  return "Náročný den";
}

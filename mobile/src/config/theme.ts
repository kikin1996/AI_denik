/**
 * DayStory brand tokens, ported from the web app's globals.css (dusk-indigo
 * primary / lamplight-amber accent). React Native has no CSS variables, so
 * these are plain JS constants used directly in StyleSheet definitions.
 */

export const colors = {
  background: "#f5f3f7",
  card: "#ffffff",
  border: "#e3e0ea",

  ink: "#211f2e",
  mutedInk: "#6f6b7d",

  primary: "#2e2853",
  primaryForeground: "#f7f4ec",

  accent: "#dda74b",
  accentForeground: "#211f2e",

  destructive: "#b3273f",
  destructiveForeground: "#f7f4ec",
} as const;

/** Same low->high mood gradient as src/lib/mood.ts in the web app. */
interface HslStop {
  h: number;
  s: number;
  l: number;
}

const LOW: HslStop = { h: 248, s: 38, l: 30 };
const MID: HslStop = { h: 280, s: 10, l: 54 };
const HIGH: HslStop = { h: 38, s: 68, l: 57 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpStop(a: HslStop, b: HslStop, t: number): HslStop {
  return { h: lerp(a.h, b.h, t), s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t) };
}

export function moodColor(rating: number | null): string {
  if (rating === null) return "hsl(250, 8%, 65%)";
  const t = Math.min(Math.max((rating - 1) / 9, 0), 1);
  const stop = t <= 0.5 ? lerpStop(LOW, MID, t / 0.5) : lerpStop(MID, HIGH, (t - 0.5) / 0.5);
  return `hsl(${stop.h.toFixed(0)}, ${stop.s.toFixed(0)}%, ${stop.l.toFixed(0)}%)`;
}

export function moodLabel(rating: number | null): string {
  if (rating === null) return "Nezpracováno";
  if (rating >= 9) return "Výborný den";
  if (rating >= 7) return "Dobrý den";
  if (rating >= 5) return "Obyčejný den";
  if (rating >= 3) return "Těžší den";
  return "Náročný den";
}

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

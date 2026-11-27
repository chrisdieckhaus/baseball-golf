// How a saved play reads in an archive list ("Score +34", "In progress · 1/3").
// Kept out of LocalArchive.tsx, a client component, because the archive pages
// call these on the server: a server component can't call a function exported
// from a "use client" file.
import { HOLES_PER_ROUND } from "./round";
import { scoreLabel } from "./share";

export type Status = { kind: "done" | "partial"; text: string; score?: number | string; bust?: boolean } | null;

/** How Baseball Golf progress reads in the list. */
export function golfStatus(holesPlayed: number, totalScore: number | null, holes = HOLES_PER_ROUND): Status {
  if (totalScore !== null) return { kind: "done", text: "Score", score: scoreLabel(totalScore) };
  if (holesPlayed > 0) return { kind: "partial", text: `In progress · ${holesPlayed}/${holes}` };
  return null;
}

/** How Hit the Number progress reads in the list. */
export function numberStatus(picks: number, done: boolean, bust: boolean, score: number | null): Status {
  if (!done) return { kind: "partial", text: `In progress · ${picks}/3` };
  // A bust gets the share card's 💥 and its own color; a finish is just the
  // number it came up short by.
  if (bust) return { kind: "done", text: "", score: "💥 Bust", bust: true };
  return score === 0 ? { kind: "done", text: "Bullseye" } : { kind: "done", text: "", score: score ?? 0 };
}

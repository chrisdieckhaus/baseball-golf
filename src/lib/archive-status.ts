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

/** How a Stats Ranker result reads in the list, in the game's own words: "Off by 3" or "Perfect". */
export function rankStatus(score: number): Status {
  return score === 0 ? { kind: "done", text: "Perfect" } : { kind: "done", text: "Off by", score };
}

/** How Roster Reveal progress reads in the list. */
export function rosterStatus(revealed: number, correct: boolean, done: boolean): Status {
  if (done) return { kind: "done", text: correct ? `Got it after ${revealed}` : "Missed" };
  return { kind: "partial", text: `In progress · ${revealed} revealed` };
}

/** How Hit the Number progress reads in the list. */
export function numberStatus(picks: number, done: boolean, bust: boolean, score: number | null): Status {
  if (!done) return { kind: "partial", text: `In progress · ${picks}/3` };
  // A bust gets the share card's 💥 and its own color; a finish is just the
  // number it came up short by.
  if (bust) return { kind: "done", text: "", score: "💥 Bust", bust: true };
  return score === 0 ? { kind: "done", text: "Bullseye" } : { kind: "done", text: "", score: score ?? 0 };
}

/** How King of the Hill progress reads in the list: "4/5" once done. */
export function kothStatus(picks: number, done: boolean, score: number | null): Status {
  if (!done) return { kind: "partial", text: `In progress · ${picks}/5` };
  return { kind: "done", text: "Score", score: `${score ?? 0}/5` };
}

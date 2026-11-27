// Lineup Card: a daily game on the same data as Hit the Number.
//
// Each day everyone gets the same batting stat and the same nine lineup spots
// (C, 1B, 2B, 3B, SS, LF, CF, RF, DH), each with a rule: "C · Played for the Red
// Sox", "SS · Played in the 2000s", "LF · Hall of Famer"... Fill the spots, in
// any order, with players who played that position and fit its rule. Each
// pick's career total is revealed as you go. No player twice. The goal is the
// biggest team total; the score is that total as a share of the best lineup
// possible.
//
// No "server-only" import, so client components can use this file. Career
// totals never ship to the browser: the server reveals each pick's total.
import { numberStat, type NumberStat, type SlotRule } from "./number";

/** Round #1. Rounds are numbered from Nov 1, 2026, like the other games. */
export const LINEUP_LAUNCH_DATE = "2026-11-01";

export function lineupRoundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${LINEUP_LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

/** The nine spots, in batting-card order. Bit order matches src/data/lineup-positions.json. */
export const LINEUP_SPOTS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"] as const;
export type LineupSpot = (typeof LINEUP_SPOTS)[number];

/** Batting counting stats only (rate stats don't add up across a team). */
export const LINEUP_STAT_KEYS = ["HR", "H", "RBI", "R", "2B", "SB", "BB"] as const;
export const lineupStat = (key: string): NumberStat | undefined =>
  (LINEUP_STAT_KEYS as readonly string[]).includes(key) ? numberStat(key) : undefined;

export interface StoredLineupRound {
  statKey: string;
  /** One rule per spot, in LINEUP_SPOTS order. */
  rules: SlotRule[];
}

export interface LineupRule extends SlotRule {
  /** "Played for the Red Sox", as the player reads it. */
  label: string;
}

export interface LineupRound {
  date: string;
  statKey: string;
  /** "Home runs" */
  label: string;
  /** "HR" */
  short: string;
  rules: LineupRule[];
  /** Preview deployments: a random round to try the game. Never saved. */
  practice?: string;
  /** Preview deployments: rounds are worked out on the fly and plays aren't saved. */
  preview?: true;
}

export interface LineupPick {
  id: string;
  name: string;
  years: string;
  /** Career total in the round's stat. */
  value: number;
  /** Index into LINEUP_SPOTS. */
  spot: number;
}

export interface PickInput {
  id: string;
  spot: number;
}

export interface LineupState {
  picks: LineupPick[];
  total: number;
  done: boolean;
  /** Once done: the best lineup possible, one pick per spot in LINEUP_SPOTS order. */
  best: { total: number; picks: LineupPick[] } | null;
  /** Once done: total as a whole percentage of the best (100 = perfect). */
  percent: number | null;
}

export function percentOfBest(total: number, best: number): number {
  if (best <= 0) return 100;
  if (total >= best) return 100;
  // Never round up to 100: that's only for a perfect lineup.
  return Math.min(99, Math.floor((total / best) * 100));
}

export function scoreLineup(picks: LineupPick[], best: LineupState["best"]): LineupState {
  const total = picks.reduce((s, p) => s + p.value, 0);
  const done = picks.length === LINEUP_SPOTS.length;
  return {
    picks,
    total,
    done,
    best: done ? best : null,
    percent: done && best ? percentOfBest(total, best.total) : null,
  };
}

/**
 * Check a whole list of picks: known players, each spot once, no player twice,
 * each player fits his spot. The list must start with the saved picks.
 */
export function validateLineupPicks(
  picks: unknown,
  saved: { id: string; spot: number }[],
  check: { known: (id: string) => boolean; fits: (id: string, spot: number) => boolean },
): { picks: PickInput[] } | { error: string } {
  if (!Array.isArray(picks) || picks.length === 0 || picks.length > LINEUP_SPOTS.length) {
    return { error: "picks must be a list of 1 to 9 players" };
  }
  const out: PickInput[] = [];
  const ids = new Set<string>();
  const spots = new Set<number>();
  for (const p of picks) {
    const id = (p as PickInput | null)?.id;
    const spot = (p as PickInput | null)?.spot;
    if (typeof id !== "string" || typeof spot !== "number" || !Number.isInteger(spot) || spot < 0 || spot >= LINEUP_SPOTS.length) {
      return { error: "Each pick needs a player and a spot" };
    }
    if (!check.known(id)) return { error: "Unknown player" };
    if (ids.has(id)) return { error: "He's already in your lineup" };
    if (spots.has(spot)) return { error: "That spot is already filled" };
    if (!check.fits(id, spot)) return { error: "He doesn't fit that spot" };
    ids.add(id);
    spots.add(spot);
    out.push({ id, spot });
  }
  if (out.length < saved.length || saved.some((s, i) => s.id !== out[i].id || s.spot !== out[i].spot)) {
    return { error: "Picks can't be changed" };
  }
  return { picks: out };
}

/** Best lineup's pick at a spot vs yours: 🟩 as good, 🟨 at least half as many, ⬜ less. */
export function spotSquare(mine: number, best: number): string {
  if (mine >= best) return "🟩";
  if (best > 0 && mine * 2 >= best) return "🟨";
  return "⬜";
}

/** Results-chart buckets by percent of the best lineup: 100, 90s, 80s, 70s, 60s, 50s, under 50. */
export const LINEUP_BUCKETS = 7;
export function lineupBucket(percent: number): number {
  if (percent >= 100) return 0;
  return Math.min(LINEUP_BUCKETS - 1, Math.max(1, 10 - Math.floor(percent / 10)));
}

const fmt = (n: number) => n.toLocaleString("en-US");

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Spoiler-free: one square per spot in card order, plus the total. E.g.
 *   Lineup Card #28 · Nov 28, 2026
 *   🟩🟨🟩⬜🟩🟩🟨🟩🟩
 *   4,812 HR · 91% of the best lineup
 *   https://dailydugout.com/lineup
 */
export function buildLineupShareText(round: LineupRound, state: LineupState, url: string): string {
  const title = `Lineup Card #${lineupRoundNumber(round.date)} · ${shortDate(round.date)}`;
  const bySpot = new Map(state.picks.map((p) => [p.spot, p]));
  const squares = LINEUP_SPOTS.map((_, i) => spotSquare(bySpot.get(i)?.value ?? 0, state.best?.picks[i]?.value ?? 0)).join("");
  const pct = state.percent === 100 ? "Perfect lineup!" : `${state.percent ?? 0}% of the best lineup`;
  return [title, squares, `${fmt(state.total)} ${round.short} · ${pct}`, url].join("\n");
}

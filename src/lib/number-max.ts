// Hit the Number's bonus round, "Max it out": once you've finished the day's
// round, play the same stat and the same three slots again, but this time the
// goal is the biggest total you can get. Each pick's career total is revealed as
// you go, and the score is the total as a share of the best three possible.
//
// It only opens after the main round so it can't give the main round away:
// the biggest names in each slot (and their totals) are exactly what it shows.
// Rounds without slot rules have no bonus round.
//
// No "server-only" import, so client components can use this file.
import { NUMBER_PICKS, numberRoundNumber, type NumberPick, type NumberRound } from "./number";

export interface MaxPickInput {
  id: string;
  slot: number;
}

export interface MaxState {
  picks: NumberPick[];
  total: number;
  done: boolean;
  /** Once done: the best three possible, in slot order. */
  best: { total: number; picks: NumberPick[] } | null;
  /** Once done: the total as a whole percentage of the best (100 only when it's matched). */
  percent: number | null;
}

export function percentOfBest(total: number, best: number): number {
  if (best <= 0 || total >= best) return 100;
  return Math.min(99, Math.floor((total / best) * 100));
}

export function scoreMax(picks: NumberPick[], best: MaxState["best"]): MaxState {
  const total = picks.reduce((s, p) => s + p.value, 0);
  const done = picks.length === NUMBER_PICKS;
  return { picks, total, done, best: done ? best : null, percent: done && best ? percentOfBest(total, best.total) : null };
}

/**
 * The best three: one player per slot, no one twice. Only a slot's top three
 * can matter (the other two slots use at most two of them), so trying every
 * combination of those is exact.
 */
export function bestThree<P extends { id: string; value: number; fit: number }>(
  players: P[],
): { total: number; picks: (P | null)[] } {
  const top = Array.from({ length: NUMBER_PICKS }, (_, s) =>
    players
      .filter((p) => p.value > 0 && p.fit & (1 << s))
      .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1))
      .slice(0, NUMBER_PICKS),
  );
  let best: { total: number; picks: (P | null)[] } = { total: 0, picks: [null, null, null] };
  const pools = top.map((t) => (t.length ? t : [null]));
  for (const a of pools[0])
    for (const b of pools[1])
      for (const c of pools[2]) {
        const ids = [a, b, c].filter(Boolean).map((p) => p!.id);
        if (new Set(ids).size !== ids.length) continue;
        const total = (a?.value ?? 0) + (b?.value ?? 0) + (c?.value ?? 0);
        if (total > best.total) best = { total, picks: [a, b, c] };
      }
  return best;
}

/** Your pick vs the best three's pick in the same slot: 🟩 as good, 🟨 at least half, ⬜ less. */
export function maxSquare(mine: number, best: number): string {
  if (mine >= best) return "🟩";
  if (best > 0 && mine * 2 >= best) return "🟨";
  return "⬜";
}

/** Results-chart buckets by percent of the best: 100, 90s, 80s, 70s, 60s, 50s, under 50. */
export const MAX_BUCKETS = 7;
export function maxBucket(percent: number): number {
  if (percent >= 100) return 0;
  return Math.min(MAX_BUCKETS - 1, Math.max(1, 10 - Math.floor(percent / 10)));
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
 * Spoiler-free, like the main round's:
 *   Hit the Number #27 · Max · Nov 27, 2026
 *   🟩🟨🟩
 *   2,145 HR · 94% of the max
 *   https://dailydugout.com/number
 */
export function buildMaxShareText(round: NumberRound, state: MaxState, url: string): string {
  const name = round.sport === "nba" ? "Hit the Number · NBA" : "Hit the Number";
  const title = `${name} #${numberRoundNumber(round.date)} · Max · ${shortDate(round.date)}`;
  const bySlot = new Map(state.picks.map((p) => [p.slot, p]));
  const squares = Array.from({ length: NUMBER_PICKS }, (_, i) =>
    maxSquare(bySlot.get(i)?.value ?? 0, state.best?.picks[i]?.value ?? 0),
  ).join("");
  const pct = state.percent === 100 ? "Maxed out! 💯" : `${state.percent ?? 0}% of the max`;
  return [title, squares, `${fmt(state.total)} ${round.short} · ${pct}`, url].join("\n");
}

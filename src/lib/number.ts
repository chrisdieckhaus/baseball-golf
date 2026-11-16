// Hit the Number: a daily game on the same data as Baseball Golf.
//
// Each day everyone gets the same career stat and target, e.g. "900 home runs."
// Name three players whose career totals add up as close to the target as you
// can without going over. Each player's total is revealed when you pick him,
// so the last pick is about landing it. Going over is a bust and ends the round.
// Score = how far under the target you finish (0 is a bullseye).
//
// No "server-only" import, so scripts and client components can use this file.
// Career totals never ship to the browser: the server reveals each pick's total.
import { hashString, mulberry32 } from "./round";

export const NUMBER_PICKS = 3;
/** Round #1. Rounds are numbered from Nov 1, 2026, like the other games. */
export const NUMBER_LAUNCH_DATE = "2026-11-01";

export function numberRoundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${NUMBER_LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

export interface NumberStat {
  key: string;
  /** "Home runs": the stat's name in the question. */
  label: string;
  /** "HR": after the target ("900 HR") and in the share text. */
  short: string;
  group: "Batting" | "Pitching";
  /** Every target from low to high in steps of step is possible. */
  low: number;
  high: number;
  step: number;
}

/**
 * The stats and their target ranges. Targets go low enough to be funny (three
 * guys who hit 100 homers between them) and high enough to need stars. Keep a
 * stat here even if it's dropped from new rounds: stored rounds refer to it.
 */
export const NUMBER_STATS: NumberStat[] = [
  { key: "HR", label: "Home runs", short: "HR", group: "Batting", low: 100, high: 1200, step: 25 },
  { key: "H", label: "Hits", short: "hits", group: "Batting", low: 500, high: 8000, step: 100 },
  { key: "RBI", label: "RBIs", short: "RBIs", group: "Batting", low: 300, high: 4500, step: 50 },
  { key: "R", label: "Runs", short: "runs", group: "Batting", low: 300, high: 4500, step: 50 },
  { key: "2B", label: "Doubles", short: "doubles", group: "Batting", low: 100, high: 1500, step: 25 },
  { key: "SB", label: "Stolen bases", short: "SB", group: "Batting", low: 50, high: 1200, step: 25 },
  { key: "BB", label: "Walks", short: "walks", group: "Batting", low: 200, high: 3500, step: 50 },
  { key: "W", label: "Wins", short: "wins", group: "Pitching", low: 30, high: 700, step: 10 },
  { key: "SO", label: "Strikeouts", short: "strikeouts", group: "Pitching", low: 300, high: 8000, step: 100 },
  { key: "SV", label: "Saves", short: "saves", group: "Pitching", low: 25, high: 1000, step: 25 },
];

const STAT_BY_KEY = new Map(NUMBER_STATS.map((s) => [s.key, s]));
export const numberStat = (key: string): NumberStat | undefined => STAT_BY_KEY.get(key);

export function targetsFor(stat: NumberStat): number[] {
  const out: number[] = [];
  for (let t = stat.low; t <= stat.high; t += stat.step) out.push(t);
  return out;
}

/** What gets saved for a daily round. */
export interface StoredNumberRound {
  statKey: string;
  target: number;
}

function shuffled<T>(items: T[], seed: string): T[] {
  const a = [...items];
  const rand = mulberry32(hashString(seed));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A shuffle that never starts with the item the previous shuffle ended with,
 * so the same thing never comes up twice in a row across the boundary.
 */
function chainedShuffle<T>(items: T[], seed: (n: number) => string, n: number): T[] {
  const order = shuffled(items, seed(n));
  if (n > 0 && order.length > 1) {
    const prevLast = shuffled(items, seed(n - 1)).at(-1);
    if (order[0] === prevLast) [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

const dayIndex = (date: string) => numberRoundNumber(date) - 1;

/**
 * The round for a date. Stats run in shuffled cycles of ten days (each stat once
 * per cycle, never the same stat two days running). Each stat steps through its
 * own fixed shuffle of every target in its range, so a stat and target come back
 * only after all of that stat's targets have been used: at least 40 cycles, more than a year.
 */
export function generateNumberRound(date: string): StoredNumberRound {
  const idx = Math.max(dayIndex(date), 0);
  const n = NUMBER_STATS.length;
  const cycle = Math.floor(idx / n);
  const keys = NUMBER_STATS.map((s) => s.key);
  const statKey = chainedShuffle(keys, (c) => `number:stats:${c}`, cycle)[idx % n];
  // The same order every lap, so a target comes back one lap (more than a year) later.
  const targets = shuffled(targetsFor(numberStat(statKey)!), `number:${statKey}`);
  const target = targets[cycle % targets.length];
  return { statKey, target };
}

/** The round as the browser sees it. */
export interface NumberRound {
  date: string;
  statKey: string;
  label: string;
  short: string;
  group: "Batting" | "Pitching";
  target: number;
}

export function publicNumberRound(date: string, stored: StoredNumberRound): NumberRound {
  const stat = numberStat(stored.statKey);
  if (!stat) throw new Error(`Unknown Hit the Number stat: ${stored.statKey}`);
  return { date, statKey: stat.key, label: stat.label, short: stat.short, group: stat.group, target: stored.target };
}

export interface NumberPick {
  id: string;
  name: string;
  years: string;
  value: number;
}

export interface NumberState {
  picks: NumberPick[];
  total: number;
  done: boolean;
  bust: boolean;
  /** How far under the target, once done (null for a bust or an unfinished round). 0 is a bullseye. */
  score: number | null;
  /** Once done: how many three-player combos hit the target exactly, and one of them. */
  bullseyes: Bullseyes | null;
}

export interface Bullseyes {
  count: number;
  example: NumberPick[] | null;
}

/** Score a list of picks. Done after three picks, or as soon as the total goes over. */
export function scorePicks(target: number, picks: NumberPick[]): Omit<NumberState, "bullseyes"> {
  const total = picks.reduce((s, p) => s + p.value, 0);
  const bust = total > target;
  const done = bust || picks.length >= NUMBER_PICKS;
  return { picks, total, done, bust, score: done && !bust ? target - total : null };
}

/**
 * Checks a list of picks: 1–3 known players, no repeats, and nothing picked
 * after the total went over. `valueOf` returns undefined for an unknown id.
 */
export function validatePicks(
  ids: unknown,
  target: number,
  valueOf: (id: string) => number | undefined,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > NUMBER_PICKS || !ids.every((x) => typeof x === "string")) {
    return { ok: false, error: "Invalid picks" };
  }
  if (new Set(ids).size !== ids.length) return { ok: false, error: "You already picked that player" };
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    const v = valueOf(ids[i]);
    if (v === undefined) return { ok: false, error: "Unknown player" };
    if (total > target) return { ok: false, error: "The round is already over" };
    total += v;
  }
  return { ok: true, ids: ids as string[] };
}

/**
 * Counts the three-player combos whose totals add up to exactly the target, and
 * picks one to show: the one whose smallest total is largest, so it leans on
 * players people know. `players` must be every player with his total (zeros
 * included); ties within a total go to whoever comes first in the list.
 */
export function findBullseyes<P extends { value: number }>(
  players: P[],
  target: number,
): { count: number; example: P[] | null } {
  const byValue = new Map<number, P[]>();
  for (const p of players) {
    if (p.value > target || p.value < 0) continue;
    const list = byValue.get(p.value);
    if (list) list.push(p);
    else byValue.set(p.value, [p]);
  }
  const values = [...byValue.keys()].sort((a, b) => b - a);
  const c = (v: number) => byValue.get(v)!.length;
  const choose2 = (n: number) => (n * (n - 1)) / 2;
  const choose3 = (n: number) => (n * (n - 1) * (n - 2)) / 6;
  let count = 0;
  let example: P[] | null = null;
  let bestMin = -1;
  // a >= b >= v3, with a + b + v3 = target
  for (const a of values) {
    for (const b of values) {
      if (b > a) continue;
      const v3 = target - a - b;
      if (v3 < 0) continue;
      if (v3 > b) break;
      if (!byValue.has(v3)) continue;
      let n: number;
      if (a === b && b === v3) n = choose3(c(a));
      else if (a === b) n = choose2(c(a)) * c(v3);
      else if (b === v3) n = c(a) * choose2(c(b));
      else n = c(a) * c(b) * c(v3);
      if (n <= 0) continue;
      count += n;
      if (v3 > bestMin) {
        const A = byValue.get(a)!;
        const B = byValue.get(b)!;
        const C = byValue.get(v3)!;
        const pick = [A[0], a === b ? B[1] : B[0], v3 === b ? (a === b ? C[2] : C[1]) : C[0]];
        bestMin = v3;
        example = pick;
      }
    }
  }
  return { count, example };
}

/**
 * The results chart's bars: bullseye, then off by up to 1%, 5%, 10% and 25% of
 * the target, more than that, and busts. Each limit is a whole number and at
 * least one more than the last.
 */
export function numberBucketLimits(target: number): number[] {
  const limits: number[] = [];
  let prev = 0;
  for (const f of [0.01, 0.05, 0.1, 0.25]) {
    prev = Math.max(prev + 1, Math.ceil(target * f));
    limits.push(prev);
  }
  return limits;
}

export const NUMBER_BUCKETS = 7;

/** Which bar a result goes in. A bust is the last bar. */
export function numberBucket(score: number | null, bust: boolean, target: number): number {
  if (bust || score === null) return NUMBER_BUCKETS - 1;
  if (score === 0) return 0;
  const limits = numberBucketLimits(target);
  const i = limits.findIndex((l) => score <= l);
  return i === -1 ? limits.length + 1 : i + 1;
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
 * The share text. Totals only, never the players:
 *
 *   Hit the Number #15 · Nov 15, 2026
 *   875 / 900 HR 🎯
 *   https://…/number
 */
export function buildNumberShareText(round: NumberRound, state: NumberState, url: string): string {
  const title = `Hit the Number #${numberRoundNumber(round.date)} · ${shortDate(round.date)}`;
  const line = `${fmt(state.total)} / ${fmt(round.target)} ${round.short} ${state.bust ? "💥" : "🎯"}`;
  return [title, line, url].join("\n");
}

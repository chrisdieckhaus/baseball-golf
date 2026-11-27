// Hit the Number: a daily game on the same data as Baseball Golf.
//
// Each day everyone gets the same career stat and target, e.g. "900 home runs."
// Name three players whose career totals add up as close to the target as you
// can without going over. Each player's total is revealed when you pick him,
// so the last pick is about landing it. Going over is a bust and ends the round.
// Score = how far under the target you finish (0 is a bullseye).
//
// From NUMBER_SLOTS_FROM on, each of the three slots has a rule ("Played for the
// Astros", "Played in the 1990s", "Hall of Famer"...). You choose which slot each
// pick goes in, and he has to fit it. His whole career total still counts.
//
// No "server-only" import, so scripts and client components can use this file.
// Career totals never ship to the browser: the server reveals each pick's total.
import { hashString, mulberry32 } from "./round";
import { namespaced, type Sport } from "./sport";

export const NUMBER_PICKS = 3;
/** Round #1. Rounds are numbered from Nov 1, 2026, like the other games. */
export const NUMBER_LAUNCH_DATE = "2026-11-01";

export function numberRoundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${NUMBER_LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

export type NumberGroup = "Batting" | "Pitching" | "Totals";

export interface NumberStat {
  key: string;
  /** "Home runs": the stat's name in the question. */
  label: string;
  /** "HR": after the target ("900 HR") and in the share text. */
  short: string;
  /** Baseball: "Batting" or "Pitching" (positions and the Cy Young are for one or the other). NBA: "Totals". */
  group: NumberGroup;
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

/**
 * NBA stats (career regular-season totals, BAA, NBA and ABA combined). Steals
 * and blocks have been kept since 1973–74, 3-pointers since 1979–80 (ABA 1967–76).
 */
export const NBA_NUMBER_STATS: NumberStat[] = [
  { key: "PTS", label: "Points", short: "points", group: "Totals", low: 5000, high: 60000, step: 500 },
  { key: "TRB", label: "Rebounds", short: "rebounds", group: "Totals", low: 2000, high: 30000, step: 250 },
  { key: "AST", label: "Assists", short: "assists", group: "Totals", low: 1000, high: 20000, step: 250 },
  { key: "STL", label: "Steals", short: "steals", group: "Totals", low: 300, high: 4500, step: 50 },
  { key: "BLK", label: "Blocks", short: "blocks", group: "Totals", low: 300, high: 5000, step: 50 },
  { key: "3P", label: "3-pointers", short: "threes", group: "Totals", low: 300, high: 6000, step: 50 },
];

const STATS: Record<Sport, NumberStat[]> = { mlb: NUMBER_STATS, nba: NBA_NUMBER_STATS };
const STAT_BY_KEY: Record<Sport, Map<string, NumberStat>> = {
  mlb: new Map(NUMBER_STATS.map((s) => [s.key, s])),
  nba: new Map(NBA_NUMBER_STATS.map((s) => [s.key, s])),
};
export const numberStats = (sport: Sport = "mlb"): NumberStat[] => STATS[sport];
export const numberStat = (key: string, sport: Sport = "mlb"): NumberStat | undefined => STAT_BY_KEY[sport].get(key);

export function targetsFor(stat: NumberStat): number[] {
  const out: number[] = [];
  for (let t = stat.low; t <= stat.high; t += stat.step) out.push(t);
  return out;
}

/** New baseball rounds stored on or after this date get slot rules. Rounds before it never change. */
export const NUMBER_SLOTS_FROM = "2026-11-21";

/** Does a new round on this date get slot rules? NBA rounds always do. */
export const numberSlotsOn = (date: string, sport: Sport = "mlb") => sport === "nba" || date >= NUMBER_SLOTS_FROM;

export type SlotKind = "decade" | "team" | "league" | "position" | "award";

/**
 * A slot's rule, as stored. key: a decade's first year ("1990"), a franchise
 * ("HOU"), "AL" or "NL", a position ("1B", "OF"...), or an award ("HOF", "AS", "ROY").
 * Any appearance qualifies: one game at first base makes a first baseman.
 */
export interface SlotRule {
  kind: SlotKind;
  key: string;
}

/** A slot's rule as the browser sees it. */
export interface NumberSlot extends SlotRule {
  /** "Played for the Astros", "Hall of Famer". */
  label: string;
}

/** What gets saved for a daily round. slots is null for rounds without slot rules. */
export interface StoredNumberRound {
  statKey: string;
  target: number;
  slots?: SlotRule[] | null;
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
export function generateNumberRound(date: string, sport: Sport = "mlb"): StoredNumberRound {
  const idx = Math.max(dayIndex(date), 0);
  const stats = numberStats(sport);
  const n = stats.length;
  const cycle = Math.floor(idx / n);
  const keys = stats.map((s) => s.key);
  // Baseball's seeds are unchanged; NBA's start with "nba:".
  const statKey = chainedShuffle(keys, (c) => namespaced(sport, `number:stats:${c}`), cycle)[idx % n];
  // The same order every lap, so a target comes back one lap (more than a year) later.
  const targets = shuffled(targetsFor(numberStat(statKey, sport)!), namespaced(sport, `number:${statKey}`));
  const target = targets[cycle % targets.length];
  return { statKey, target };
}

/** The round as the browser sees it. */
export interface NumberRound {
  sport: Sport;
  date: string;
  statKey: string;
  label: string;
  short: string;
  group: NumberGroup;
  target: number;
  /** One rule per slot, or null when any player fits anywhere. */
  slots: NumberSlot[] | null;
  /** Preview deployments only: trial slot rules on a round that doesn't have them. Plays aren't saved. */
  previewSlots?: true;
  /** Preview deployments only: a random practice round's seed. Plays aren't saved. */
  practice?: string;
}

export function publicNumberRound(
  date: string,
  stored: StoredNumberRound,
  labelOf: (rule: SlotRule) => string = (r) => r.key,
  sport: Sport = "mlb",
): NumberRound {
  const stat = numberStat(stored.statKey, sport);
  if (!stat) throw new Error(`Unknown Hit the Number stat: ${stored.statKey}`);
  const slots = stored.slots?.length === NUMBER_PICKS ? stored.slots.map((r) => ({ ...r, label: labelOf(r) })) : null;
  return { sport, date, statKey: stat.key, label: stat.label, short: stat.short, group: stat.group, target: stored.target, slots };
}

export interface NumberPick {
  id: string;
  name: string;
  years: string;
  value: number;
  /** Which slot he went in (0–2), on rounds with slot rules. */
  slot?: number;
  /** Bonus round only: his all-time rank in the stat (1 = the leader), and whether he shares it. */
  rank?: number;
  tied?: boolean;
}

/** A pick as the browser sends it: { id, slot }, or just the id on rounds without slots. */
export interface PickInput {
  id: string;
  slot: number | null;
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
  /** One exact combo; on rounds with slots, in slot order. */
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
 * With slots: every pick names a different slot (0–2) and fits its rule;
 * `fits(id, slot)` checks that and `slotLabel(slot)` names the rule in the error.
 */
export function validatePicks(
  picks: unknown,
  target: number,
  valueOf: (id: string) => number | undefined,
  slots?: { fits: (id: string, slot: number) => boolean; slotLabel: (slot: number) => string } | null,
): { ok: true; picks: PickInput[] } | { ok: false; error: string } {
  if (!Array.isArray(picks) || picks.length < 1 || picks.length > NUMBER_PICKS) return { ok: false, error: "Invalid picks" };
  const list: PickInput[] = [];
  for (const p of picks) {
    if (typeof p === "string") list.push({ id: p, slot: null });
    else if (p && typeof p === "object" && typeof (p as PickInput).id === "string") {
      const slot = (p as PickInput).slot;
      list.push({ id: (p as PickInput).id, slot: typeof slot === "number" ? slot : null });
    } else return { ok: false, error: "Invalid picks" };
  }
  if (new Set(list.map((p) => p.id)).size !== list.length) return { ok: false, error: "You already picked that player" };
  if (slots) {
    for (const p of list) {
      if (p.slot === null || !Number.isInteger(p.slot) || p.slot < 0 || p.slot >= NUMBER_PICKS) {
        return { ok: false, error: "Choose a slot for that player" };
      }
    }
    if (new Set(list.map((p) => p.slot)).size !== list.length) return { ok: false, error: "That slot is already filled" };
  } else {
    for (const p of list) p.slot = null;
  }
  let total = 0;
  for (const p of list) {
    const v = valueOf(p.id);
    if (v === undefined) return { ok: false, error: "Unknown player" };
    if (total > target) return { ok: false, error: "The round is already over" };
    if (slots && !slots.fits(p.id, p.slot!)) return { ok: false, error: `He doesn't fit “${slots.slotLabel(p.slot!)}.”` };
    total += v;
  }
  return { ok: true, picks: list };
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
 * Bullseyes on a round with slots: ways to fill slot 1, 2 and 3 with three
 * different players, each fitting his slot, whose totals add up to the target.
 * `fit` is a bit mask of the slots a player fits (bit i = slot i). Players who
 * fit no slot can be left out. With minValue 1, players with none of the stat
 * don't count (round generation uses that to require a real three-player combo).
 * The example is the combo whose smallest total is largest, in slot order.
 */
export function findSlotBullseyes<P extends { value: number; fit: number }>(
  players: P[],
  target: number,
  opts: { minValue?: number; wantExample?: boolean; stopAtFirst?: boolean } = {},
): { count: number; example: P[] | null } {
  const { minValue = 0, wantExample = true, stopAtFirst = false } = opts;
  // For each value, how many players fit each combination of slots (8 masks).
  const byValue = new Map<number, number[]>();
  for (const p of players) {
    if (p.value > target || p.value < minValue || !(p.fit & 7)) continue;
    let c = byValue.get(p.value);
    if (!c) byValue.set(p.value, (c = [0, 0, 0, 0, 0, 0, 0, 0]));
    c[p.fit & 7]++;
  }
  const n = (c: number[], bits: number) => {
    let s = 0;
    for (let m = 0; m < 8; m++) if ((m & bits) === bits) s += c[m];
    return s;
  };
  const per = new Map<number, number[]>(); // value -> [n1, n2, n3, n12, n13, n23, n123]
  for (const [v, c] of byValue) per.set(v, [n(c, 1), n(c, 2), n(c, 4), n(c, 3), n(c, 5), n(c, 6), n(c, 7)]);
  const v1s = [...per.keys()].filter((v) => per.get(v)![0] > 0);
  const v2s = [...per.keys()].filter((v) => per.get(v)![1] > 0).sort((x, y) => x - y);

  let count = 0;
  let best: [number, number, number] | null = null;
  let bestMin = -1;
  for (const a of v1s) {
    const A = per.get(a)!;
    for (const b of v2s) {
      const c = target - a - b;
      if (c < minValue) break;
      const C = per.get(c);
      if (!C || C[2] === 0) continue;
      const B = per.get(b)!;
      let ways: number;
      if (a !== b && a !== c && b !== c) ways = A[0] * B[1] * C[2];
      else if (a === b && b === c) ways = A[0] * A[1] * A[2] - A[3] * A[2] - A[4] * A[1] - A[5] * A[0] + 2 * A[6];
      else if (a === b) ways = (A[0] * A[1] - A[3]) * C[2];
      else if (a === c) ways = (A[0] * A[2] - A[4]) * B[1];
      else ways = A[0] * (B[1] * B[2] - B[5]);
      if (ways <= 0) continue;
      count += ways;
      const lo = Math.min(a, b, c);
      if (lo > bestMin) {
        bestMin = lo;
        best = [a, b, c];
      }
      if (stopAtFirst) return { count, example: null };
    }
  }
  if (!best || !wantExample) return { count, example: null };
  // Pick actual players for the best values, preferring those earliest in the
  // list. The first three candidates for each slot always include a valid fill.
  const cands = [0, 1, 2].map((slot) =>
    players.filter((q) => q.value === best![slot] && q.fit & (1 << slot)).slice(0, 3),
  );
  let example: P[] | null = null;
  for (const a of cands[0])
    for (const b of cands[1])
      for (const c of cands[2])
        if (!example && a !== b && a !== c && b !== c) example = [a, b, c];
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
 *   https://dailydugout.com/number
 *
 * NBA rounds say so: "Hit the Number · NBA #15 · Nov 15, 2026".
 */
export function buildNumberShareText(round: NumberRound, state: NumberState, url: string): string {
  const name = round.sport === "nba" ? "Hit the Number · NBA" : "Hit the Number";
  const title = `${name} #${numberRoundNumber(round.date)} · ${shortDate(round.date)}`;
  const line = `${fmt(state.total)} / ${fmt(round.target)} ${round.short} ${state.bust ? "💥" : "🎯"}`;
  return [title, line, url].join("\n");
}

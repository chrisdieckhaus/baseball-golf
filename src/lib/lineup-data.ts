// Lineup Card's server side: the daily round (stat and nine spot rules), who
// fits each spot, the best lineup possible, and picks. Server-only: it loads
// every player's career totals.
import "server-only";
import positions from "@/data/lineup-positions.json";
import raw from "@/data/number.json";
import slotData from "@/data/number-slots.json";
import index from "../../public/players.json";
import { getDb } from "./db";
import {
  LINEUP_LAUNCH_DATE,
  LINEUP_SPOTS,
  LINEUP_STAT_KEYS,
  lineupRoundNumber,
  lineupStat,
  scoreLineup,
  type LineupPick,
  type LineupRound,
  type LineupState,
  type StoredLineupRound,
} from "./lineup";
import { getStoredLineupRound, storeLineupRoundIfMissing } from "./lineup-rounds";
import type { SlotRule } from "./number";
import { fitsSlot, ruleWeight, slotLabel } from "./number-slots";
import { hashString, isValidDate, mulberry32, todayET } from "./round";
import type { PlayerIndexEntry } from "./types";

const totals = (raw as unknown as { totals: Record<string, Record<string, number>> }).totals;
const spotMasks = (positions as unknown as { players: Record<string, number> }).players;
const players = (index as unknown as { players: PlayerIndexEntry[] }).players;
const playerById = new Map(players.map((p) => [p.id, p]));
const slots = slotData as unknown as { teams: { key: string }[]; awards: string[]; leagues: string[] };

export const isKnownPlayer = (id: string) => playerById.has(id);
export const careerTotal = (statKey: string, id: string) => totals[statKey]?.[id] ?? 0;

/** Did he play this spot (one game is enough) and does he fit its rule? */
export function fitsSpot(id: string, spot: number, rule: SlotRule): boolean {
  return Boolean((spotMasks[id] ?? 0) & (1 << spot)) && fitsSlot(id, rule);
}

export function toPick(statKey: string, id: string, spot: number): LineupPick {
  const p = playerById.get(id)!;
  return { id, name: p.n, years: p.y, value: careerTotal(statKey, id), spot };
}

// ---- Picking the round ----

/** Each spot needs at least this many players who fit and have some of the stat. */
export const MIN_SPOT_POOL = 12;
const MAX_TRIES = 200;

/** How often each kind of rule comes up. The Cy Young is for pitchers, so it's out. */
const KIND_WEIGHTS: [SlotRule["kind"], number][] = [
  ["team", 0.4],
  ["decade", 0.3],
  ["award", 0.2],
  ["league", 0.1],
];
const RULES: Record<string, SlotRule[]> = {
  team: slots.teams.map((t) => ({ kind: "team", key: t.key })),
  decade: Array.from({ length: 13 }, (_, i) => ({ kind: "decade", key: String(1900 + i * 10) })),
  award: slots.awards.filter((a) => a !== "CY").map((a) => ({ kind: "award", key: a })),
  league: slots.leagues.map((l) => ({ kind: "league", key: l })),
};

function weighted<T>(items: T[], weight: (t: T) => number, rand: () => number): T {
  const ws = items.map(weight);
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((r -= ws[i]) < 0) return items[i];
  return items[items.length - 1];
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The stat for a date: shuffled cycles of the seven stats, never the same stat two days running. */
export function lineupStatFor(date: string): string {
  const idx = Math.max(lineupRoundNumber(date) - 1, 0);
  const n = LINEUP_STAT_KEYS.length;
  const cycle = Math.floor(idx / n);
  let prevLast: string | null = null;
  let order: string[] = [];
  for (let c = 0; c <= cycle; c++) {
    order = shuffle([...LINEUP_STAT_KEYS], mulberry32(hashString(`lineup:stats:${c}`)));
    if (order[0] === prevLast) order.push(order.shift()!);
    prevLast = order[n - 1];
  }
  return order[idx % n];
}

/** How many players fit a spot and have some of the stat. */
function poolSize(statKey: string, spot: number, rule: SlotRule): number {
  const t = totals[statKey] ?? {};
  let n = 0;
  for (const id in t) if (t[id] > 0 && fitsSpot(id, spot, rule)) n++;
  return n;
}

/**
 * The round for a date: the stat, then a rule for each spot drawn from
 * `lineup:spots:<date>`. A spot redraws until its pool is big enough, and no rule
 * appears twice. Decades lean recent, like Hit the Number's.
 */
export function generateLineupRound(date: string, statKey: string = lineupStatFor(date)): StoredLineupRound {
  const rand = mulberry32(hashString(`lineup:spots:${date}`));
  const rules: SlotRule[] = [];
  const used = new Set<string>();
  for (let spot = 0; spot < LINEUP_SPOTS.length; spot++) {
    let rule: SlotRule | null = null;
    for (let t = 0; t < MAX_TRIES && !rule; t++) {
      const kind = weighted(KIND_WEIGHTS, ([, w]) => w, rand)[0];
      const r = weighted(RULES[kind], ruleWeight, rand);
      const key = `${r.kind}:${r.key}`;
      if (!used.has(key) && poolSize(statKey, spot, r) >= MIN_SPOT_POOL) rule = r;
    }
    // Never seen in testing; a league rule always has a big pool.
    rule ??= { kind: "league", key: spot % 2 ? "NL" : "AL" };
    used.add(`${rule.kind}:${rule.key}`);
    rules.push(rule);
  }
  return { statKey, rules };
}

// ---- The best lineup ----

/**
 * The biggest total possible: one player per spot, no one twice. Only a spot's
 * top nine can matter (at most eight of them are used elsewhere), so a search
 * over those players and the set of spots filled is exact and quick.
 */
export function bestLineup(round: StoredLineupRound): { total: number; picks: LineupPick[] } {
  const t = totals[round.statKey] ?? {};
  const k = LINEUP_SPOTS.length;
  const cands = new Map<string, number>(); // id -> spots he fits (bit mask)
  for (let s = 0; s < k; s++) {
    const fit: [string, number][] = [];
    for (const id in t) if (t[id] > 0 && fitsSpot(id, s, round.rules[s])) fit.push([id, t[id]]);
    fit.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [id] of fit.slice(0, k)) cands.set(id, (cands.get(id) ?? 0) | (1 << s));
  }
  const full = (1 << k) - 1;
  let best: number[] = Array(full + 1).fill(-1);
  let pick: (string | null)[][] = Array.from({ length: full + 1 }, () => Array(k).fill(null));
  best[0] = 0;
  for (const [id, mask] of cands) {
    const v = t[id];
    const nb = [...best];
    const np = pick.map((p) => [...p]);
    for (let m = 0; m <= full; m++) {
      if (best[m] < 0) continue;
      for (let s = 0; s < k; s++) {
        if (!(mask & (1 << s)) || m & (1 << s)) continue;
        const to = m | (1 << s);
        if (best[m] + v > nb[to]) {
          nb[to] = best[m] + v;
          np[to] = [...pick[m]];
          np[to][s] = id;
        }
      }
    }
    best = nb;
    pick = np;
  }
  // A spot with no one left over counts as 0 (pools are at least MIN_SPOT_POOL, so this shouldn't happen).
  let top = 0;
  for (let m = 0; m <= full; m++) if (best[m] > best[top]) top = m;
  const picks = LINEUP_SPOTS.map((_, s) => {
    const id = pick[top][s];
    return id ? toPick(round.statKey, id, s) : { id: "", name: "Nobody", years: "", value: 0, spot: s };
  });
  return { total: best[top], picks };
}

const bestCache = new Map<string, { total: number; picks: LineupPick[] }>();
function bestFor(date: string, round: StoredLineupRound) {
  const key = `${date}:${round.statKey}:${JSON.stringify(round.rules)}`;
  let b = bestCache.get(key);
  if (!b) {
    b = bestLineup(round);
    bestCache.set(key, b);
  }
  return b;
}

// ---- Rounds ----

/**
 * Preview deployments share the production database, so there rounds are
 * worked out on the fly and nothing is saved, until the game is merged.
 */
export const isPreview = () => process.env.VERCEL_ENV === "preview";
export const isPracticeSeed = (seed: unknown): seed is string =>
  typeof seed === "string" && /^[a-z0-9]{1,16}$/.test(seed);

export function isPlayableLineupDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= LINEUP_LAUNCH_DATE && date <= today;
}

function toPublic(date: string, stored: StoredLineupRound, extra: Partial<LineupRound> = {}): LineupRound {
  const stat = lineupStat(stored.statKey)!;
  return {
    date,
    statKey: stat.key,
    label: stat.label,
    short: stat.short,
    rules: stored.rules.map((r) => ({ ...r, label: slotLabel(r) })),
    ...extra,
  };
}

const roundCache = new Map<string, StoredLineupRound>();

async function storedRound(date: string): Promise<StoredLineupRound> {
  const cached = roundCache.get(date);
  if (cached) return cached;
  const db = getDb();
  if (!db || isPreview()) return generateLineupRound(date);
  try {
    let stored = await getStoredLineupRound(db, date);
    if (!stored) {
      await storeLineupRoundIfMissing(db, date, generateLineupRound(date));
      stored = await getStoredLineupRound(db, date);
    }
    if (!stored) throw new Error(`Lineup Card round for ${date} could not be stored`);
    roundCache.set(date, stored);
    return stored;
  } catch (e) {
    console.error(`[lineup] Couldn't load the round for ${date}; generating it instead.`, e);
    return generateLineupRound(date);
  }
}

export async function getLineupRound(date: string): Promise<LineupRound> {
  return toPublic(date, await storedRound(date), isPreview() ? { preview: true } : {});
}

/** Preview deployments: a random round (a made-up date seeds the rules). */
export function getPracticeRound(seed: string): LineupRound | null {
  if (!isPreview() && process.env.LINEUP_PRACTICE !== "1") return null;
  if (!isPracticeSeed(seed)) return null;
  const rand = mulberry32(hashString(`lineup:practice:${seed}`));
  const statKey = LINEUP_STAT_KEYS[Math.floor(rand() * LINEUP_STAT_KEYS.length)];
  return { ...toPublic(todayET(), generateLineupRound(`practice:${seed}`, statKey)), practice: seed };
}

/** The stored round behind a public one (for checking picks and the best lineup). */
export function storedFromPublic(round: LineupRound): StoredLineupRound {
  return { statKey: round.statKey, rules: round.rules.map(({ kind, key }) => ({ kind, key })) };
}

/** The state for a list of picks: totals, and the best lineup once the card is full. */
export function lineupState(round: LineupRound, picks: { id: string; spot: number }[]): LineupState {
  const stored = storedFromPublic(round);
  const full = picks.map((p) => toPick(round.statKey, p.id, p.spot));
  const done = full.length === LINEUP_SPOTS.length;
  return scoreLineup(full, done ? bestFor(round.practice ? `practice:${round.practice}` : round.date, stored) : null);
}

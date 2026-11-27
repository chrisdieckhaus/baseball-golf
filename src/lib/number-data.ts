import "server-only";
import nbaRaw from "@/data/nba/number.json";
import raw from "@/data/number.json";
import nbaIndex from "../../public/players-nba.json";
import index from "../../public/players.json";
import { getDb } from "./db";
import {
  findBullseyes,
  findSlotBullseyes,
  generateNumberRound,
  numberStats,
  targetsFor,
  NUMBER_LAUNCH_DATE,
  NUMBER_PICKS,
  publicNumberRound,
  scorePicks,
  type Bullseyes,
  type NumberPick,
  type NumberRound,
  type NumberState,
  type PickInput,
  type SlotRule,
  type StoredNumberRound,
} from "./number";
import { getOrCreateStoredNumberRound, newNumberRound } from "./number-rounds";
import { fitsSlot, generateNumberSlots, slotLabel, slotPlayers } from "./number-slots";
import { bestThree, scoreMax, type MaxPickInput, type MaxState } from "./number-max";
import { hashString, isValidDate, mulberry32, todayET } from "./round";
import { namespaced, type Sport } from "./sport";
import type { PlayerIndexEntry } from "./types";

type NumberFile = { throughSeason: number; firstDebutYear: number; totals: Record<string, Record<string, number>> };
const FILES: Record<Sport, NumberFile> = { mlb: raw as unknown as NumberFile, nba: nbaRaw as unknown as NumberFile };
const totalsFor = (sport: Sport) => FILES[sport].totals;
/** The last season in a sport's totals (NBA: the year the season ended). */
export const numberThroughSeason = (sport: Sport = "mlb") => FILES[sport].throughSeason;
export const numberFirstDebutYear = (sport: Sport = "mlb") => FILES[sport].firstDebutYear;

// Every player who can be picked: the autocomplete index (baseball: debuts 1890 on), most games first.
const PLAYERS: Record<Sport, PlayerIndexEntry[]> = {
  mlb: (index as unknown as { players: PlayerIndexEntry[] }).players,
  nba: (nbaIndex as unknown as { players: PlayerIndexEntry[] }).players,
};
const PLAYER_BY_ID: Record<Sport, Map<string, PlayerIndexEntry>> = {
  mlb: new Map(PLAYERS.mlb.map((p) => [p.id, p])),
  nba: new Map(PLAYERS.nba.map((p) => [p.id, p])),
};

/** A player's career total in a stat: 0 if he has none, undefined if he isn't a player we know. */
export function careerTotal(statKey: string, id: string, sport: Sport = "mlb"): number | undefined {
  if (!PLAYER_BY_ID[sport].has(id)) return undefined;
  return totalsFor(sport)[statKey]?.[id] ?? 0;
}

export function toPick(statKey: string, id: string, slot?: number | null, sport: Sport = "mlb"): NumberPick {
  const p = PLAYER_BY_ID[sport].get(id)!;
  const pick: NumberPick = { id, name: p.n, years: p.y, value: careerTotal(statKey, id, sport) ?? 0 };
  if (typeof slot === "number") pick.slot = slot;
  return pick;
}

/** Does this player fit the round's slot? (Always true on rounds without slots.) */
export function fitsRoundSlot(round: NumberRound, id: string, slot: number): boolean {
  const rule = round.slots?.[slot];
  return !rule || fitsSlot(id, rule, round.sport);
}

/**
 * Preview deployments (and local dev with NUMBER_SLOTS_PREVIEW=1) try slot rules
 * on every round, so they can be played before NUMBER_SLOTS_FROM. Those rules are
 * worked out on the fly, never stored, and plays on them aren't saved, because
 * previews share the production database.
 */
const slotsPreview = () => process.env.VERCEL_ENV === "preview" || process.env.NUMBER_SLOTS_PREVIEW === "1";

/** Practice rounds (temporary, for testing slot rules) are on wherever preview slot rules are. */
export const practiceEnabled = slotsPreview;

/** A valid practice seed: a few lowercase letters and digits. */
export const isPracticeSeed = (seed: unknown): seed is string => typeof seed === "string" && /^[a-z0-9]{1,16}$/.test(seed);

/**
 * A random practice round: any stat, any target, fresh slot rules. The seed
 * picks it, so the same link gives the same round. Never stored or saved.
 */
export function getPracticeRound(seed: string, sport: Sport = "mlb"): NumberRound | null {
  if (!slotsPreview() || !isPracticeSeed(seed)) return null;
  const rand = mulberry32(hashString(namespaced(sport, `number:practice:${seed}`)));
  const stats = numberStats(sport);
  const stat = stats[Math.floor(rand() * stats.length)];
  const targets = targetsFor(stat);
  const target = targets[Math.floor(rand() * targets.length)];
  const slots = generateNumberSlots(`practice:${seed}`, stat.key, target, sport);
  const round = publicNumberRound(todayET(), { statKey: stat.key, target, slots }, (r) => slotLabel(r, sport), sport);
  return { ...round, practice: seed };
}

function withPreviewSlots(
  date: string,
  stored: StoredNumberRound,
  sport: Sport,
): StoredNumberRound & { previewSlots?: true } {
  if (stored.slots || !slotsPreview()) return stored;
  const slots = generateNumberSlots(date, stored.statKey, stored.target, sport);
  return slots ? { ...stored, slots, previewSlots: true } : stored;
}

function toPublic(date: string, stored: StoredNumberRound & { previewSlots?: true }, sport: Sport): NumberRound {
  const round = publicNumberRound(date, stored, (r) => slotLabel(r, sport), sport);
  return stored.previewSlots ? { ...round, previewSlots: true } : round;
}

/** A daily round exists for every date from round #1 through today (ET). */
export function isPlayableNumberDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= NUMBER_LAUNCH_DATE && date <= today;
}

const roundCache = new Map<string, StoredNumberRound>();

/** The daily round, stored the first time it's needed. */
export async function getNumberRound(date: string, sport: Sport = "mlb"): Promise<NumberRound> {
  const cacheKey = `${sport}:${date}`;
  const cached = roundCache.get(cacheKey);
  if (cached) return toPublic(date, withPreviewSlots(date, cached, sport), sport);
  const db = getDb();
  if (!db) return toPublic(date, withPreviewSlots(date, newNumberRound(date, sport), sport), sport);
  try {
    const stored = await getOrCreateStoredNumberRound(db, date, sport);
    roundCache.set(cacheKey, stored);
    return toPublic(date, withPreviewSlots(date, stored, sport), sport);
  } catch (e) {
    console.error(`[number-rounds] Couldn't load the ${sport} round for ${date}; generating it instead.`, e);
    // Baseball's fallback has no slots (its stored rounds before Nov 21 have none); NBA's always do.
    const fallback = sport === "nba" ? newNumberRound(date, sport) : { ...generateNumberRound(date), slots: null };
    return toPublic(date, withPreviewSlots(date, fallback, sport), sport);
  }
}

const bullseyeCache = new Map<string, Bullseyes>();

/**
 * How many exact combos a round has, and one to show. With slots, combos fill
 * each slot with a player who fits it, and the example is in slot order.
 * Worked out once per stat, target and rules.
 */
export function bullseyesFor(
  statKey: string,
  target: number,
  slots: SlotRule[] | null = null,
  sport: Sport = "mlb",
): Bullseyes {
  const key = `${sport}:${statKey}:${target}:${slots ? slots.map((r) => `${r.kind}=${r.key}`).join(",") : ""}`;
  const cached = bullseyeCache.get(key);
  if (cached) return cached;
  let result: Bullseyes;
  if (slots) {
    const { count, example } = findSlotBullseyes(slotPlayers(statKey, slots, sport), target);
    result = { count, example: example ? example.map((p, i) => toPick(statKey, p.id, i, sport)) : null };
  } else {
    const totals = totalsFor(sport);
    const all = PLAYERS[sport].map((p) => ({ id: p.id, value: totals[statKey]?.[p.id] ?? 0 }));
    const { count, example } = findBullseyes(all, target);
    result = { count, example: example ? example.map((p) => toPick(statKey, p.id, null, sport)) : null };
  }
  bullseyeCache.set(key, result);
  return result;
}

/** The state the browser sees for a list of picks (already validated). */
export function numberState(round: NumberRound, picks: PickInput[]): NumberState {
  const scored = scorePicks(
    round.target,
    picks.map((p) => toPick(round.statKey, p.id, round.slots ? p.slot : null, round.sport)),
  );
  return {
    ...scored,
    bullseyes: scored.done ? bullseyesFor(round.statKey, round.target, round.slots, round.sport) : null,
  };
}

// ---- The bonus round ("Max it out") ----

/** Every non-zero career total in a stat, biggest first, for all-time ranks. */
const sortedCache = new Map<string, number[]>();
function sortedTotals(statKey: string, sport: Sport): number[] {
  const key = `${sport}:${statKey}`;
  let sorted = sortedCache.get(key);
  if (!sorted) {
    sorted = Object.values(totalsFor(sport)[statKey] ?? {})
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    sortedCache.set(key, sorted);
  }
  return sorted;
}

/**
 * All-time rank among every player in the game (1 = the leader), with ties
 * sharing a rank like Golf's leaderboards: 1 + how many have more. Null for a
 * total of 0.
 */
export function careerRank(statKey: string, value: number, sport: Sport = "mlb"): { rank: number; tied: boolean } | null {
  if (value <= 0) return null;
  const sorted = sortedTotals(statKey, sport);
  // First index whose value is <= this one (the list runs biggest first).
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] > value) lo = mid + 1;
    else hi = mid;
  }
  const tied = sorted[lo] === value && (sorted[lo + 1] === value || (lo > 0 && sorted[lo - 1] === value));
  return { rank: lo + 1, tied };
}

/** A bonus-round pick: the usual pick plus his all-time rank. */
function rankedPick(round: NumberRound, id: string, slot: number): NumberPick {
  const pick = toPick(round.statKey, id, slot, round.sport);
  const r = careerRank(round.statKey, pick.value, round.sport);
  if (r) {
    pick.rank = r.rank;
    if (r.tied) pick.tied = true;
  }
  return pick;
}

const maxCache = new Map<string, { total: number; picks: NumberPick[] }>();

/** The best three for a round's slots, as picks in slot order. */
export function bestMax(round: NumberRound): { total: number; picks: NumberPick[] } {
  const rules = round.slots ?? [];
  const key = `${round.sport}:${round.statKey}:${JSON.stringify(rules.map(({ kind, key }) => [kind, key]))}`;
  const cached = maxCache.get(key);
  if (cached) return cached;
  const best = bestThree(slotPlayers(round.statKey, rules, round.sport));
  const result = {
    total: best.total,
    picks: best.picks.map((p, i) =>
      p ? rankedPick(round, p.id, i) : { id: "", name: "Nobody", years: "", value: 0, slot: i },
    ),
  };
  maxCache.set(key, result);
  return result;
}

/** The bonus round's state for a list of picks, with the best three once all three are in. */
export function maxState(round: NumberRound, picks: MaxPickInput[]): MaxState {
  const full = picks.map((p) => rankedPick(round, p.id, p.slot));
  return scoreMax(full, full.length === NUMBER_PICKS ? bestMax(round) : null);
}

/** Checks the bonus round's picks: known players, one per slot, no repeats, each fits; saved picks come first. */
export function validateMaxPicks(
  round: NumberRound,
  picks: unknown,
  saved: MaxPickInput[],
): { picks: MaxPickInput[] } | { error: string } {
  if (!round.slots) return { error: "This round has no bonus round" };
  if (!Array.isArray(picks) || picks.length === 0 || picks.length > NUMBER_PICKS) {
    return { error: "picks must be a list of 1 to 3 players" };
  }
  const out: MaxPickInput[] = [];
  for (const p of picks) {
    const id = (p as MaxPickInput | null)?.id;
    const slot = (p as MaxPickInput | null)?.slot;
    if (typeof id !== "string" || typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot >= NUMBER_PICKS) {
      return { error: "Each pick needs a player and a slot" };
    }
    if (careerTotal(round.statKey, id, round.sport) === undefined) return { error: "Unknown player" };
    if (out.some((o) => o.id === id)) return { error: "He's already picked" };
    if (out.some((o) => o.slot === slot)) return { error: "That slot is already filled" };
    if (!fitsRoundSlot(round, id, slot)) return { error: `He doesn't fit "${round.slots[slot].label}"` };
    out.push({ id, slot });
  }
  if (out.length < saved.length || saved.some((s, i) => s.id !== out[i].id || s.slot !== out[i].slot)) {
    return { error: "Picks can't be changed" };
  }
  return { picks: out };
}

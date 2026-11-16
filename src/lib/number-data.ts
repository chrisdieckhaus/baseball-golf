import "server-only";
import raw from "@/data/number.json";
import index from "../../public/players.json";
import { getDb } from "./db";
import {
  findBullseyes,
  generateNumberRound,
  NUMBER_LAUNCH_DATE,
  publicNumberRound,
  scorePicks,
  type Bullseyes,
  type NumberPick,
  type NumberRound,
  type NumberState,
  type StoredNumberRound,
} from "./number";
import { getOrCreateStoredNumberRound } from "./number-rounds";
import { isValidDate, todayET } from "./round";
import type { PlayerIndexEntry } from "./types";

const totals = (raw as unknown as { totals: Record<string, Record<string, number>> }).totals;
export const numberThroughSeason = (raw as unknown as { throughSeason: number }).throughSeason;
export const numberFirstDebutYear = (raw as unknown as { firstDebutYear: number }).firstDebutYear;

// Every player who can be picked: the autocomplete index (debuts 1890 on), most games first.
const players = (index as unknown as { players: PlayerIndexEntry[] }).players;
const playerById = new Map(players.map((p) => [p.id, p]));

/** A player's career total in a stat: 0 if he has none, undefined if he isn't a player we know. */
export function careerTotal(statKey: string, id: string): number | undefined {
  if (!playerById.has(id)) return undefined;
  return totals[statKey]?.[id] ?? 0;
}

export function toPick(statKey: string, id: string): NumberPick {
  const p = playerById.get(id)!;
  return { id, name: p.n, years: p.y, value: careerTotal(statKey, id) ?? 0 };
}

/** A daily round exists for every date from round #1 through today (ET). */
export function isPlayableNumberDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= NUMBER_LAUNCH_DATE && date <= today;
}

const roundCache = new Map<string, StoredNumberRound>();

/** The daily round, stored the first time it's needed. */
export async function getNumberRound(date: string): Promise<NumberRound> {
  const cached = roundCache.get(date);
  if (cached) return publicNumberRound(date, cached);
  const db = getDb();
  if (!db) return publicNumberRound(date, generateNumberRound(date));
  try {
    const stored = await getOrCreateStoredNumberRound(db, date);
    roundCache.set(date, stored);
    return publicNumberRound(date, stored);
  } catch (e) {
    console.error(`[number-rounds] Couldn't load the round for ${date}; generating it instead.`, e);
    return publicNumberRound(date, generateNumberRound(date));
  }
}

const bullseyeCache = new Map<string, Bullseyes>();

/** How many exact combos a round has, and one to show. Worked out once per stat and target. */
export function bullseyesFor(statKey: string, target: number): Bullseyes {
  const key = `${statKey}:${target}`;
  const cached = bullseyeCache.get(key);
  if (cached) return cached;
  const all = players.map((p) => ({ id: p.id, value: totals[statKey]?.[p.id] ?? 0 }));
  const { count, example } = findBullseyes(all, target);
  const result = { count, example: example ? example.map((p) => toPick(statKey, p.id)) : null };
  bullseyeCache.set(key, result);
  return result;
}

/** The state the browser sees for a list of picks (already validated). */
export function numberState(round: NumberRound, ids: string[]): NumberState {
  const scored = scorePicks(round.target, ids.map((id) => toPick(round.statKey, id)));
  return { ...scored, bullseyes: scored.done ? bullseyesFor(round.statKey, round.target) : null };
}

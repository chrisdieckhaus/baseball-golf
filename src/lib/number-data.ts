import "server-only";
import raw from "@/data/number.json";
import index from "../../public/players.json";
import { getDb } from "./db";
import {
  findBullseyes,
  findSlotBullseyes,
  generateNumberRound,
  NUMBER_LAUNCH_DATE,
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

export function toPick(statKey: string, id: string, slot?: number | null): NumberPick {
  const p = playerById.get(id)!;
  const pick: NumberPick = { id, name: p.n, years: p.y, value: careerTotal(statKey, id) ?? 0 };
  if (typeof slot === "number") pick.slot = slot;
  return pick;
}

/** Does this player fit the round's slot? (Always true on rounds without slots.) */
export function fitsRoundSlot(round: NumberRound, id: string, slot: number): boolean {
  const rule = round.slots?.[slot];
  return !rule || fitsSlot(id, rule);
}

/**
 * Preview deployments (and local dev with NUMBER_SLOTS_PREVIEW=1) try slot rules
 * on every round, so they can be played before NUMBER_SLOTS_FROM. Those rules are
 * worked out on the fly, never stored, and plays on them aren't saved, because
 * previews share the production database.
 */
const slotsPreview = () => process.env.VERCEL_ENV === "preview" || process.env.NUMBER_SLOTS_PREVIEW === "1";

function withPreviewSlots(date: string, stored: StoredNumberRound): StoredNumberRound & { previewSlots?: true } {
  if (stored.slots || !slotsPreview()) return stored;
  const slots = generateNumberSlots(date, stored.statKey, stored.target);
  return slots ? { ...stored, slots, previewSlots: true } : stored;
}

function toPublic(date: string, stored: StoredNumberRound & { previewSlots?: true }): NumberRound {
  const round = publicNumberRound(date, stored, slotLabel);
  return stored.previewSlots ? { ...round, previewSlots: true } : round;
}

/** A daily round exists for every date from round #1 through today (ET). */
export function isPlayableNumberDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= NUMBER_LAUNCH_DATE && date <= today;
}

const roundCache = new Map<string, StoredNumberRound>();

/** The daily round, stored the first time it's needed. */
export async function getNumberRound(date: string): Promise<NumberRound> {
  const cached = roundCache.get(date);
  if (cached) return toPublic(date, withPreviewSlots(date, cached));
  const db = getDb();
  if (!db) return toPublic(date, withPreviewSlots(date, newNumberRound(date)));
  try {
    const stored = await getOrCreateStoredNumberRound(db, date);
    roundCache.set(date, stored);
    return toPublic(date, withPreviewSlots(date, stored));
  } catch (e) {
    console.error(`[number-rounds] Couldn't load the round for ${date}; generating it instead.`, e);
    return toPublic(date, withPreviewSlots(date, { ...generateNumberRound(date), slots: null }));
  }
}

const bullseyeCache = new Map<string, Bullseyes>();

/**
 * How many exact combos a round has, and one to show. With slots, combos fill
 * each slot with a player who fits it, and the example is in slot order.
 * Worked out once per stat, target and rules.
 */
export function bullseyesFor(statKey: string, target: number, slots: SlotRule[] | null = null): Bullseyes {
  const key = `${statKey}:${target}:${slots ? slots.map((r) => `${r.kind}=${r.key}`).join(",") : ""}`;
  const cached = bullseyeCache.get(key);
  if (cached) return cached;
  let result: Bullseyes;
  if (slots) {
    const { count, example } = findSlotBullseyes(slotPlayers(statKey, slots), target);
    result = { count, example: example ? example.map((p, i) => toPick(statKey, p.id, i)) : null };
  } else {
    const all = players.map((p) => ({ id: p.id, value: totals[statKey]?.[p.id] ?? 0 }));
    const { count, example } = findBullseyes(all, target);
    result = { count, example: example ? example.map((p) => toPick(statKey, p.id)) : null };
  }
  bullseyeCache.set(key, result);
  return result;
}

/** The state the browser sees for a list of picks (already validated). */
export function numberState(round: NumberRound, picks: PickInput[]): NumberState {
  const scored = scorePicks(
    round.target,
    picks.map((p) => toPick(round.statKey, p.id, round.slots ? p.slot : null)),
  );
  return { ...scored, bullseyes: scored.done ? bullseyesFor(round.statKey, round.target, round.slots) : null };
}

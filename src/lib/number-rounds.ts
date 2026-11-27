// Stored Hit the Number rounds, same idea as rounds.ts:
// each daily round's stat, target and slot rules are saved the first time they're needed,
// so changing the generator never changes a round that already exists.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import { generateNumberRound, NUMBER_SLOTS_FROM, numberStat, type SlotRule, type StoredNumberRound } from "./number";
import { generateNumberSlots } from "./number-slots";
import type { Queryable } from "./plays";

/**
 * A new round: the stat and target, plus slot rules from NUMBER_SLOTS_FROM on.
 * A round stored without slots (before that date, or by older code) never gets them.
 */
export function newNumberRound(date: string): StoredNumberRound {
  const r = generateNumberRound(date);
  const slots = date >= NUMBER_SLOTS_FROM ? generateNumberSlots(date, r.statKey, r.target) : null;
  return { ...r, slots };
}

export async function getStoredNumberRound(db: Queryable, date: string): Promise<StoredNumberRound | null> {
  const { rows } = await db.query<{ stat_key: string; target: number; slots: SlotRule[] | null }>(
    `SELECT stat_key, target, slots FROM number_rounds WHERE round_date = $1`,
    [date],
  );
  const r = rows[0];
  if (!r || !numberStat(r.stat_key)) return null;
  return { statKey: r.stat_key, target: Number(r.target), slots: Array.isArray(r.slots) ? r.slots : null };
}

/** Save the round for this date if there isn't one yet. Returns true if it was created. Safe to race. */
export async function storeNumberRoundIfMissing(db: Queryable, date: string): Promise<boolean> {
  const r = newNumberRound(date);
  const { rowCount } = await db.query(
    `INSERT INTO number_rounds (round_date, stat_key, target, slots) VALUES ($1, $2, $3, $4) ON CONFLICT (round_date) DO NOTHING`,
    [date, r.statKey, r.target, r.slots ? JSON.stringify(r.slots) : null],
  );
  return (rowCount ?? 0) > 0;
}

export async function getOrCreateStoredNumberRound(db: Queryable, date: string): Promise<StoredNumberRound> {
  let stored = await getStoredNumberRound(db, date);
  if (!stored) {
    await storeNumberRoundIfMissing(db, date);
    stored = await getStoredNumberRound(db, date);
    if (!stored) throw new Error(`Hit the Number round for ${date} could not be stored`);
  }
  return stored;
}

// Stored Hit the Number rounds, same idea as rounds.ts and roster-rounds.ts:
// each daily round's stat and target are saved the first time they're needed,
// so changing the generator never changes a round that already exists.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import { generateNumberRound, numberStat, type StoredNumberRound } from "./number";
import type { Queryable } from "./plays";

export async function getStoredNumberRound(db: Queryable, date: string): Promise<StoredNumberRound | null> {
  const { rows } = await db.query<{ stat_key: string; target: number }>(
    `SELECT stat_key, target FROM number_rounds WHERE round_date = $1`,
    [date],
  );
  const r = rows[0];
  if (!r || !numberStat(r.stat_key)) return null;
  return { statKey: r.stat_key, target: Number(r.target) };
}

/** Save the round for this date if there isn't one yet. Returns true if it was created. Safe to race. */
export async function storeNumberRoundIfMissing(db: Queryable, date: string): Promise<boolean> {
  const r = generateNumberRound(date);
  const { rowCount } = await db.query(
    `INSERT INTO number_rounds (round_date, stat_key, target) VALUES ($1, $2, $3) ON CONFLICT (round_date) DO NOTHING`,
    [date, r.statKey, r.target],
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

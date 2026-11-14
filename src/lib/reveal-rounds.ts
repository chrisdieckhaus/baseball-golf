// Stored Sports Revealer rounds, same idea as rounds.ts and rank-rounds.ts: each
// daily round's player is saved the first time it's needed, so changing the
// generator or the pool never changes a round that already exists. Clues aren't
// saved; they always come from the current data.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import type { Queryable } from "./plays";
import { generateStoredRevealRound, type RevealData, type StoredRevealRound } from "./reveal";

export async function getStoredRevealRound(db: Queryable, date: string): Promise<StoredRevealRound | null> {
  const { rows } = await db.query<{ player_id: string }>(
    `SELECT player_id FROM reveal_rounds WHERE round_date = $1`,
    [date],
  );
  return rows[0] ? { playerId: rows[0].player_id } : null;
}

/** Save the round for this date if there isn't one yet. Returns true if it was created. Safe to race. */
export async function storeRevealRoundIfMissing(db: Queryable, data: RevealData, date: string): Promise<boolean> {
  const r = generateStoredRevealRound(data, date);
  const { rowCount } = await db.query(
    `INSERT INTO reveal_rounds (round_date, player_id) VALUES ($1, $2)
     ON CONFLICT (round_date) DO NOTHING`,
    [date, r.playerId],
  );
  return (rowCount ?? 0) > 0;
}

export async function getOrCreateStoredRevealRound(
  db: Queryable,
  data: RevealData,
  date: string,
): Promise<StoredRevealRound> {
  let stored = await getStoredRevealRound(db, date);
  if (!stored) {
    await storeRevealRoundIfMissing(db, data, date);
    stored = await getStoredRevealRound(db, date);
    if (!stored) throw new Error(`Reveal round for ${date} could not be stored`);
  }
  return stored;
}

// Stored Stats Ranker rounds, same idea as rounds.ts: each daily round's stat
// and players are saved the first time it's needed, so changing the generator
// never changes a round that already exists. Values aren't saved; scoring always
// uses the current leaderboards.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import type { Queryable } from "./plays";
import { generateStoredRankRound, type StoredRankRound } from "./rank";
import type { LeaderboardData } from "./types";

export async function getStoredRankRound(db: Queryable, date: string): Promise<StoredRankRound | null> {
  const { rows } = await db.query<{ stat_key: string; player_ids: string[] }>(
    `SELECT stat_key, player_ids FROM rank_rounds WHERE round_date = $1`,
    [date],
  );
  return rows[0] ? { statKey: rows[0].stat_key, playerIds: rows[0].player_ids } : null;
}

/** Save the round for this date if there isn't one yet. Returns true if it was created. Safe to race. */
export async function storeRankRoundIfMissing(db: Queryable, data: LeaderboardData, date: string): Promise<boolean> {
  const r = generateStoredRankRound(data, date);
  const { rowCount } = await db.query(
    `INSERT INTO rank_rounds (round_date, stat_key, player_ids) VALUES ($1, $2, $3)
     ON CONFLICT (round_date) DO NOTHING`,
    [date, r.statKey, r.playerIds],
  );
  return (rowCount ?? 0) > 0;
}

export async function getOrCreateStoredRankRound(
  db: Queryable,
  data: LeaderboardData,
  date: string,
): Promise<StoredRankRound> {
  let stored = await getStoredRankRound(db, date);
  if (!stored) {
    await storeRankRoundIfMissing(db, data, date);
    stored = await getStoredRankRound(db, date);
    if (!stored) throw new Error(`Rank round for ${date} could not be stored`);
  }
  return stored;
}

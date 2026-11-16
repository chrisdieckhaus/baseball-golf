// Stored King of the Hill rounds, same idea as rank-rounds.ts: each daily
// round's stat and six players are saved the first time it's needed, so
// changing the generator never changes a round that already exists. Values
// aren't saved; who wins each matchup always comes from the current leaderboards.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import { generateStoredKothRound, type StoredKothRound } from "./koth";
import type { Queryable } from "./plays";
import { table, type Sport } from "./sport";
import type { LeaderboardData } from "./types";

export async function getStoredKothRound(db: Queryable, date: string, sport: Sport = "mlb"): Promise<StoredKothRound | null> {
  const { rows } = await db.query<{ stat_key: string; player_ids: string[] }>(
    `SELECT stat_key, player_ids FROM ${table(sport, "koth_rounds")} WHERE round_date = $1`,
    [date],
  );
  return rows[0] ? { statKey: rows[0].stat_key, playerIds: rows[0].player_ids } : null;
}

/** Save the round for this date if there isn't one yet. Returns true if it was created. Safe to race. */
export async function storeKothRoundIfMissing(
  db: Queryable,
  data: LeaderboardData,
  date: string,
  sport: Sport = "mlb",
): Promise<boolean> {
  const r = generateStoredKothRound(data, date, sport);
  const { rowCount } = await db.query(
    `INSERT INTO ${table(sport, "koth_rounds")} (round_date, stat_key, player_ids) VALUES ($1, $2, $3)
     ON CONFLICT (round_date) DO NOTHING`,
    [date, r.statKey, r.playerIds],
  );
  return (rowCount ?? 0) > 0;
}

export async function getOrCreateStoredKothRound(
  db: Queryable,
  data: LeaderboardData,
  date: string,
  sport: Sport = "mlb",
): Promise<StoredKothRound> {
  let stored = await getStoredKothRound(db, date, sport);
  if (!stored) {
    await storeKothRoundIfMissing(db, data, date, sport);
    stored = await getStoredKothRound(db, date, sport);
    if (!stored) throw new Error(`King of the Hill round for ${date} could not be stored`);
  }
  return stored;
}

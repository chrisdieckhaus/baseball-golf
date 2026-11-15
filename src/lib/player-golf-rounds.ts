// Stored Player mode rounds, same idea as rounds.ts: each daily round's stats and
// players are saved the first time it's needed, so changing the generator never
// changes a round that already exists. Ranks aren't saved; scoring always uses
// the current leaderboards.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import type { Queryable } from "./plays";
import { generateStoredPlayerRound, type PlayerMeta, type StoredPlayerHole } from "./player-golf";
import { table, type Sport } from "./sport";
import type { LeaderboardData } from "./types";

export async function getStoredPlayerRound(
  db: Queryable,
  date: string,
  sport: Sport = "mlb",
): Promise<StoredPlayerHole[] | null> {
  const { rows } = await db.query<{ holes: StoredPlayerHole[] }>(
    `SELECT holes FROM ${table(sport, "player_golf_rounds")} WHERE round_date = $1`,
    [date],
  );
  return rows[0]?.holes ?? null;
}

/** Save the round for this date if there isn't one yet. Returns true if it was created. Safe to race. */
export async function storePlayerRoundIfMissing(
  db: Queryable,
  data: LeaderboardData,
  meta: PlayerMeta,
  date: string,
  sport: Sport = "mlb",
): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO ${table(sport, "player_golf_rounds")} (round_date, holes) VALUES ($1, $2::jsonb)
     ON CONFLICT (round_date) DO NOTHING`,
    [date, JSON.stringify(generateStoredPlayerRound(data, meta, date, sport))],
  );
  return (rowCount ?? 0) > 0;
}

export async function getOrCreateStoredPlayerRound(
  db: Queryable,
  data: LeaderboardData,
  meta: PlayerMeta,
  date: string,
  sport: Sport = "mlb",
): Promise<StoredPlayerHole[]> {
  let holes = await getStoredPlayerRound(db, date, sport);
  if (!holes) {
    await storePlayerRoundIfMissing(db, data, meta, date, sport);
    holes = await getStoredPlayerRound(db, date, sport);
    if (!holes) throw new Error(`Player round for ${date} could not be stored`);
  }
  return holes;
}

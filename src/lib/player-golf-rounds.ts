// Stored Player mode rounds, same idea as rounds.ts: each daily round's stats and
// players are saved the first time it's needed, so changing the generator never
// changes a round that already exists. Ranks aren't saved; scoring always uses
// the current leaderboards.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import type { Queryable } from "./plays";
import { generateStoredPlayerRound, type PlayerMeta, type StoredPlayerHole } from "./player-golf";
import type { LeaderboardData } from "./types";

export async function getStoredPlayerRound(db: Queryable, date: string): Promise<StoredPlayerHole[] | null> {
  const { rows } = await db.query<{ holes: StoredPlayerHole[] }>(
    `SELECT holes FROM player_golf_rounds WHERE round_date = $1`,
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
): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO player_golf_rounds (round_date, holes) VALUES ($1, $2::jsonb) ON CONFLICT (round_date) DO NOTHING`,
    [date, JSON.stringify(generateStoredPlayerRound(data, meta, date))],
  );
  return (rowCount ?? 0) > 0;
}

export async function getOrCreateStoredPlayerRound(
  db: Queryable,
  data: LeaderboardData,
  meta: PlayerMeta,
  date: string,
): Promise<StoredPlayerHole[]> {
  let holes = await getStoredPlayerRound(db, date);
  if (!holes) {
    await storePlayerRoundIfMissing(db, data, meta, date);
    holes = await getStoredPlayerRound(db, date);
    if (!holes) throw new Error(`Player round for ${date} could not be stored`);
  }
  return holes;
}

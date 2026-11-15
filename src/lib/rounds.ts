// Stored daily rounds.
//
// A daily round is generated from its date (see generateRound), but that only
// stays the same while the generator code and the leaderboard data don't
// change. So each daily round's stats and target ranks are saved the first time
// it's needed, and from then on the saved copy is the round.
//
// Only the stat and target rank are saved, not the answers: guesses are always
// scored against the current leaderboards, so replaying an old round after a
// data refresh uses the newest rankings.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import type { Queryable } from "./plays";
import { generateRound } from "./round";
import { table, type Sport } from "./sport";
import type { Hole, LeaderboardData, Round } from "./types";

export type StoredHole = Pick<Hole, "statKey" | "targetRank">;

/** What gets saved for a date: each hole's stat and target rank. */
export function generateStoredHoles(data: LeaderboardData, date: string, sport: Sport = "mlb"): StoredHole[] {
  return generateRound(data, date, sport).holes.map(({ statKey, targetRank }) => ({ statKey, targetRank }));
}

/** Rebuild a playable round from its saved holes, with labels from the current data. */
export function roundFromStored(data: LeaderboardData, date: string, holes: StoredHole[]): Round {
  return {
    date,
    holes: holes.map(({ statKey, targetRank }) => {
      const stat = data.stats[statKey];
      if (!stat) throw new Error(`Round ${date} uses stat "${statKey}", which is missing from the leaderboards`);
      return { statKey, label: stat.label, group: stat.group, qualifier: stat.qualifier, targetRank };
    }),
  };
}

export async function getStoredHoles(db: Queryable, date: string, sport: Sport = "mlb"): Promise<StoredHole[] | null> {
  const { rows } = await db.query<{ holes: StoredHole[] }>(
    `SELECT holes FROM ${table(sport, "rounds")} WHERE round_date = $1`,
    [date],
  );
  return rows[0]?.holes ?? null;
}

/**
 * Save the round for this date if there isn't one yet. Returns true if it was created.
 * Safe to race: if two requests create the same date at once, the first insert
 * wins and both end up using the stored row.
 */
export async function storeRoundIfMissing(
  db: Queryable,
  data: LeaderboardData,
  date: string,
  sport: Sport = "mlb",
): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO ${table(sport, "rounds")} (round_date, holes) VALUES ($1, $2::jsonb) ON CONFLICT (round_date) DO NOTHING`,
    [date, JSON.stringify(generateStoredHoles(data, date, sport))],
  );
  return (rowCount ?? 0) > 0;
}

/** The stored round for a date, creating it the first time. */
export async function getOrCreateRound(
  db: Queryable,
  data: LeaderboardData,
  date: string,
  sport: Sport = "mlb",
): Promise<Round> {
  let holes = await getStoredHoles(db, date, sport);
  if (!holes) {
    await storeRoundIfMissing(db, data, date, sport);
    holes = await getStoredHoles(db, date, sport);
    if (!holes) throw new Error(`Round for ${date} could not be stored`);
  }
  return roundFromStored(data, date, holes);
}

// Stored Roster Reveal rounds, same idea as rounds.ts and rank-rounds.ts: each
// daily round's team-season is saved the first time it's needed, so changing
// the generator or the data never changes a round that already exists. The
// lineup isn't saved; it always comes from the current data.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
import type { Queryable } from "./plays";
import { generateStoredRosterRound, type RosterData, type StoredRosterRound } from "./roster";
import { table, type Sport } from "./sport";

export async function getStoredRosterRound(
  db: Queryable,
  date: string,
  sport: Sport = "mlb",
): Promise<StoredRosterRound | null> {
  const { rows } = await db.query<{ franchise: string; year: number }>(
    `SELECT franchise, year FROM ${table(sport, "roster_rounds")} WHERE round_date = $1`,
    [date],
  );
  return rows[0] ? { franchise: rows[0].franchise, year: Number(rows[0].year) } : null;
}

/** Save the round for this date if there isn't one yet. Returns true if it was created. Safe to race. */
export async function storeRosterRoundIfMissing(
  db: Queryable,
  data: RosterData,
  date: string,
  sport: Sport = "mlb",
): Promise<boolean> {
  const r = generateStoredRosterRound(data, date, sport);
  const { rowCount } = await db.query(
    `INSERT INTO ${table(sport, "roster_rounds")} (round_date, franchise, year) VALUES ($1, $2, $3)
     ON CONFLICT (round_date) DO NOTHING`,
    [date, r.franchise, r.year],
  );
  return (rowCount ?? 0) > 0;
}

export async function getOrCreateStoredRosterRound(
  db: Queryable,
  data: RosterData,
  date: string,
  sport: Sport = "mlb",
): Promise<StoredRosterRound> {
  let stored = await getStoredRosterRound(db, date, sport);
  if (!stored) {
    await storeRosterRoundIfMissing(db, data, date, sport);
    stored = await getStoredRosterRound(db, date, sport);
    if (!stored) throw new Error(`Roster round for ${date} could not be stored`);
  }
  return stored;
}

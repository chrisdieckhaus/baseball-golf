// Stored Lineup Card rounds: the stat and the nine spot rules, saved the first
// time a date is needed so a later change to the generator never changes a
// round someone has played.
import { lineupStat, LINEUP_SPOTS, type StoredLineupRound } from "./lineup";
import type { SlotRule } from "./number";
import type { Queryable } from "./plays";

export async function getStoredLineupRound(db: Queryable, date: string): Promise<StoredLineupRound | null> {
  const { rows } = await db.query<{ stat_key: string; rules: SlotRule[] }>(
    `SELECT stat_key, rules FROM lineup_rounds WHERE round_date = $1`,
    [date],
  );
  const r = rows[0];
  if (!r || !lineupStat(r.stat_key) || !Array.isArray(r.rules) || r.rules.length !== LINEUP_SPOTS.length) return null;
  return { statKey: r.stat_key, rules: r.rules };
}

export async function storeLineupRoundIfMissing(db: Queryable, date: string, round: StoredLineupRound): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO lineup_rounds (round_date, stat_key, rules) VALUES ($1, $2, $3) ON CONFLICT (round_date) DO NOTHING`,
    [date, round.statKey, JSON.stringify(round.rules)],
  );
  return (rowCount ?? 0) > 0;
}

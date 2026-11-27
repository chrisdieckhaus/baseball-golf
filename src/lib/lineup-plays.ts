// Saved Lineup Card plays, one row per player per daily round, keyed by the
// same anonymous bg_player cookie as the other games. The browser also keeps a
// copy in localStorage; the database is the record.
import { LINEUP_BUCKETS, lineupBucket } from "./lineup";
import { percentBeaten, type Queryable } from "./plays";

export interface LineupPlay {
  ids: string[];
  spots: number[];
  total: number;
  done: boolean;
  percent: number | null;
}

export interface LineupStats {
  others: number;
  worse: number;
  tied: number;
  percentBeaten: number | null;
  finishers: number;
  /** Average percent of the best lineup. */
  averagePercent: number | null;
  perfectPercent: number;
  /** Players per bucket (see lineupBucket). */
  distribution: number[];
}

function toPlay(r: Record<string, unknown>): LineupPlay {
  return {
    ids: (r.pick_ids as string[]) ?? [],
    spots: ((r.pick_spots as number[] | null) ?? []).map(Number),
    total: Number(r.total),
    done: Boolean(r.done),
    percent: r.percent === null || r.percent === undefined ? null : Number(r.percent),
  };
}

export async function getLineupPlay(db: Queryable, playerId: string, roundDate: string): Promise<LineupPlay | null> {
  const { rows } = await db.query(
    `SELECT pick_ids, pick_spots, total, done, percent FROM lineup_plays WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? toPlay(rows[0]) : null;
}

/** Save the picks. Picks only grow and a finished card doesn't change (the WHERE guards both). */
export async function recordLineupPicks(
  db: Queryable,
  args: { playerId: string; roundDate: string; play: LineupPlay; isLive: boolean },
): Promise<LineupPlay> {
  const { playerId, roundDate, play, isLive } = args;
  await db.query(`INSERT INTO players (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [playerId]);
  await db.query(
    `INSERT INTO lineup_plays (player_id, round_date, pick_ids, pick_spots, total, done, percent, is_live, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $6 THEN now() END)
     ON CONFLICT (player_id, round_date) DO UPDATE SET
       pick_ids = EXCLUDED.pick_ids, pick_spots = EXCLUDED.pick_spots, total = EXCLUDED.total,
       done = EXCLUDED.done, percent = EXCLUDED.percent,
       completed_at = COALESCE(lineup_plays.completed_at, EXCLUDED.completed_at)
     WHERE NOT lineup_plays.done AND cardinality(EXCLUDED.pick_ids) > cardinality(lineup_plays.pick_ids)`,
    [playerId, roundDate, play.ids, play.spots, play.total, play.done, play.percent, isLive],
  );
  return (await getLineupPlay(db, playerId, roundDate))!;
}

/** For the archive: every round this browser has started. */
export async function getLineupProgress(db: Queryable, playerId: string): Promise<Map<string, LineupPlay>> {
  const { rows } = await db.query(
    `SELECT round_date::text AS round_date, pick_ids, pick_spots, total, done, percent
       FROM lineup_plays WHERE player_id = $1`,
    [playerId],
  );
  return new Map(rows.map((r) => [String(r.round_date), toPlay(r)]));
}

/** How a finished card compares with everyone who has finished the round. Higher total is better. */
export async function getLineupStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  mine: { total: number },
): Promise<LineupStats> {
  const { rows } = await db.query<{ total: string; percent: number; n: string; mine: string }>(
    `SELECT total, percent, count(*) AS n, count(*) FILTER (WHERE player_id = $2) AS mine
       FROM lineup_plays WHERE round_date = $1 AND done GROUP BY total, percent`,
    [roundDate, playerId],
  );
  const distribution = Array(LINEUP_BUCKETS).fill(0);
  let others = 0;
  let worse = 0;
  let tied = 0;
  let finishers = 0;
  let perfect = 0;
  let pctSum = 0;
  for (const r of rows) {
    const n = Number(r.n);
    const notMe = n - Number(r.mine);
    const total = Number(r.total);
    const pct = Number(r.percent);
    finishers += n;
    pctSum += pct * n;
    if (pct >= 100) perfect += n;
    distribution[lineupBucket(pct)] += n;
    others += notMe;
    if (total < mine.total) worse += notMe;
    if (total === mine.total) tied += notMe;
  }
  return {
    others,
    worse,
    tied,
    percentBeaten: percentBeaten(worse, others),
    finishers,
    averagePercent: finishers ? Math.round(pctSum / finishers) : null,
    perfectPercent: finishers ? Math.round((perfect / finishers) * 100) : 0,
    distribution,
  };
}

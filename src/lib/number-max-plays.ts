// Saved bonus-round ("Max it out") plays, one row per player per daily round,
// keyed by the same anonymous bg_player cookie as the main round.
import { MAX_BUCKETS, maxBucket } from "./number-max";
import { percentBeaten, type Queryable } from "./plays";
import { table, type Sport } from "./sport";

export interface MaxPlay {
  ids: string[];
  slots: number[];
  total: number;
  done: boolean;
  percent: number | null;
}

export interface MaxStats {
  others: number;
  worse: number;
  tied: number;
  percentBeaten: number | null;
  finishers: number;
  /** Average percent of the max. */
  averagePercent: number | null;
  maxedPercent: number;
  /** Players per bucket (see maxBucket). */
  distribution: number[];
}

function toPlay(r: Record<string, unknown>): MaxPlay {
  return {
    ids: (r.pick_ids as string[]) ?? [],
    slots: ((r.pick_slots as number[] | null) ?? []).map(Number),
    total: Number(r.total),
    done: Boolean(r.done),
    percent: r.percent === null || r.percent === undefined ? null : Number(r.percent),
  };
}

export async function getMaxPlay(db: Queryable, playerId: string, roundDate: string, sport: Sport): Promise<MaxPlay | null> {
  const { rows } = await db.query(
    `SELECT pick_ids, pick_slots, total, done, percent FROM ${table(sport, "number_max_plays")}
      WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? toPlay(rows[0]) : null;
}

/** Save the picks. Picks only grow and a finished bonus round doesn't change (the WHERE guards both). */
export async function recordMaxPicks(
  db: Queryable,
  args: { playerId: string; roundDate: string; play: MaxPlay; isLive: boolean },
  sport: Sport,
): Promise<MaxPlay> {
  const { playerId, roundDate, play, isLive } = args;
  const t = table(sport, "number_max_plays");
  await db.query(`INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING`, [playerId]);
  await db.query(
    `INSERT INTO ${t} (player_id, round_date, pick_ids, pick_slots, total, done, percent, is_live, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $6 THEN now() END)
     ON CONFLICT (player_id, round_date) DO UPDATE SET
       pick_ids = EXCLUDED.pick_ids, pick_slots = EXCLUDED.pick_slots, total = EXCLUDED.total,
       done = EXCLUDED.done, percent = EXCLUDED.percent,
       completed_at = COALESCE(${t}.completed_at, EXCLUDED.completed_at)
     WHERE NOT ${t}.done AND cardinality(EXCLUDED.pick_ids) > cardinality(${t}.pick_ids)`,
    [playerId, roundDate, play.ids, play.slots, play.total, play.done, play.percent, isLive],
  );
  return (await getMaxPlay(db, playerId, roundDate, sport))!;
}

/** How a finished bonus round compares with everyone who has finished it. Higher total is better. */
export async function getMaxStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  mine: { total: number },
  sport: Sport,
): Promise<MaxStats> {
  const { rows } = await db.query<{ total: string; percent: number; n: string; mine: string }>(
    `SELECT total, percent, count(*) AS n, count(*) FILTER (WHERE player_id = $2) AS mine
       FROM ${table(sport, "number_max_plays")} WHERE round_date = $1 AND done GROUP BY total, percent`,
    [roundDate, playerId],
  );
  const distribution = Array(MAX_BUCKETS).fill(0);
  let others = 0;
  let worse = 0;
  let tied = 0;
  let finishers = 0;
  let maxed = 0;
  let pctSum = 0;
  for (const r of rows) {
    const n = Number(r.n);
    const notMe = n - Number(r.mine);
    const total = Number(r.total);
    const pct = Number(r.percent);
    finishers += n;
    pctSum += pct * n;
    if (pct >= 100) maxed += n;
    distribution[maxBucket(pct)] += n;
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
    maxedPercent: finishers ? Math.round((maxed / finishers) * 100) : 0,
    distribution,
  };
}

// Saved King of the Hill plays, one row per player per daily round, keyed by the
// same anonymous bg_player cookie as the other games. The browser also keeps a
// copy in localStorage; the database is the record.
import { KOTH_MATCHUPS } from "./koth";
import { percentBeaten, type Queryable } from "./plays";
import { table, type Sport } from "./sport";

export interface KothPlay {
  picks: string[];
  score: number | null;
  done: boolean;
}

const toPlay = (r: Record<string, unknown>): KothPlay => ({
  picks: (r.pick_ids as string[]) ?? [],
  score: r.score === null || r.score === undefined ? null : Number(r.score),
  done: Boolean(r.done),
});

export async function getKothPlay(db: Queryable, playerId: string, roundDate: string, sport: Sport = "mlb"): Promise<KothPlay | null> {
  const { rows } = await db.query(
    `SELECT pick_ids, score, done FROM ${table(sport, "koth_plays")} WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? toPlay(rows[0]) : null;
}

/**
 * Save the picks so far. Picks only grow: the new list must start with the
 * saved one, and nothing changes once the round is done. The saved play comes back.
 */
export async function recordKothPicks(
  db: Queryable,
  args: { playerId: string; roundDate: string; play: KothPlay; isLive: boolean },
  sport: Sport = "mlb",
): Promise<KothPlay> {
  const { playerId, roundDate, play, isLive } = args;
  const t = table(sport, "koth_plays");
  await db.query(`INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING`, [playerId]);
  await db.query(`INSERT INTO ${t} (player_id, round_date, is_live) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
    playerId,
    roundDate,
    isLive,
  ]);
  const { rows } = await db.query(
    `UPDATE ${t} SET pick_ids = $3::text[], score = $4, done = $5,
        completed_at = CASE WHEN $5 THEN now() ELSE NULL END
      WHERE player_id = $1 AND round_date = $2 AND NOT done
        AND cardinality(pick_ids) <= cardinality($3::text[])
        AND pick_ids = ($3::text[])[1:cardinality(pick_ids)]
      RETURNING pick_ids, score, done`,
    [playerId, roundDate, play.picks, play.score, play.done],
  );
  if (rows[0]) return toPlay(rows[0]);
  return (await getKothPlay(db, playerId, roundDate, sport))!;
}

/** This player's plays on every daily round they've started, by date. */
export async function getKothProgress(db: Queryable, playerId: string, sport: Sport = "mlb"): Promise<Map<string, KothPlay>> {
  const { rows } = await db.query(
    `SELECT round_date::text AS round_date, pick_ids, score, done FROM ${table(sport, "koth_plays")} WHERE player_id = $1`,
    [playerId],
  );
  return new Map(rows.map((r) => [r.round_date as string, toPlay(r)]));
}

export interface KothStats {
  others: number;
  worse: number;
  tied: number;
  percentBeaten: number | null;
  finishers: number;
  averageScore: number | null;
  perfectPercent: number;
  /** Finishers with each score, 0 to 5 (index = score). */
  distribution: number[];
}

/**
 * How a finished play compares with everyone who has finished the round (on its
 * day or later from the archive). Higher is better. Your own play is left out of
 * the percentile but counted everywhere else.
 */
export async function getKothStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  score: number,
  sport: Sport = "mlb",
): Promise<KothStats> {
  const { rows } = await db.query<{ score: number; n: string; mine: string }>(
    `SELECT score, count(*) AS n, count(*) FILTER (WHERE player_id = $2) AS mine
       FROM ${table(sport, "koth_plays")} WHERE round_date = $1 AND done GROUP BY score`,
    [roundDate, playerId],
  );
  const distribution = Array(KOTH_MATCHUPS + 1).fill(0);
  let others = 0;
  let worse = 0;
  let tied = 0;
  for (const r of rows) {
    const s = Math.min(Math.max(Number(r.score), 0), KOTH_MATCHUPS);
    const n = Number(r.n);
    const notMe = n - Number(r.mine);
    distribution[s] += n;
    others += notMe;
    if (s < score) worse += notMe;
    if (s === score) tied += notMe;
  }
  const finishers = distribution.reduce((a, b) => a + b, 0);
  const total = distribution.reduce((sum, n, s) => sum + n * s, 0);
  return {
    others,
    worse,
    tied,
    percentBeaten: percentBeaten(worse, others),
    finishers,
    averageScore: finishers ? Math.round((total / finishers) * 10) / 10 : null,
    perfectPercent: finishers ? Math.round((distribution[KOTH_MATCHUPS] / finishers) * 100) : 0,
    distribution,
  };
}

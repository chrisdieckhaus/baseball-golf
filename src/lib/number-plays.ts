// Saved Hit the Number plays, one row per player per daily round, keyed by the
// same anonymous bg_player cookie as the other games. The browser also keeps a
// copy in localStorage; the database is the record.
import { NUMBER_BUCKETS, numberBucket } from "./number";
import { percentBeaten, type Queryable } from "./plays";
import { table, type Sport } from "./sport";

export interface NumberPlay {
  ids: string[];
  /** The slot each pick went in, on rounds with slot rules (empty otherwise). */
  slots: number[];
  total: number;
  done: boolean;
  bust: boolean;
  score: number | null;
}

function toPlay(r: Record<string, unknown>): NumberPlay {
  return {
    ids: (r.pick_ids as string[]) ?? [],
    slots: ((r.pick_slots as number[] | null) ?? []).map(Number),
    total: Number(r.total),
    done: Boolean(r.done),
    bust: Boolean(r.bust),
    score: r.score === null || r.score === undefined ? null : Number(r.score),
  };
}

export async function getNumberPlay(
  db: Queryable,
  playerId: string,
  roundDate: string,
  sport: Sport = "mlb",
): Promise<NumberPlay | null> {
  const { rows } = await db.query(
    `SELECT pick_ids, pick_slots, total, done, bust, score FROM ${table(sport, "number_plays")} WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? toPlay(rows[0]) : null;
}

/**
 * Save the picks so far. Picks only grow: the new list must start with the saved
 * one, and nothing changes once the round is done. Either way the saved play comes back.
 */
export async function recordNumberPicks(
  db: Queryable,
  args: { playerId: string; roundDate: string; play: NumberPlay; isLive: boolean },
  sport: Sport = "mlb",
): Promise<NumberPlay> {
  const { playerId, roundDate, play, isLive } = args;
  const plays = table(sport, "number_plays");
  await db.query(`INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING`, [playerId]);
  await db.query(
    `INSERT INTO ${plays} (player_id, round_date, is_live) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [playerId, roundDate, isLive],
  );
  const { rows } = await db.query(
    `UPDATE ${plays} SET
        pick_ids = $3::text[], pick_slots = $8::integer[], total = $4, done = $5, bust = $6, score = $7,
        completed_at = CASE WHEN $5 THEN now() ELSE NULL END
      WHERE player_id = $1 AND round_date = $2 AND NOT done
        AND cardinality(pick_ids) <= cardinality($3::text[])
        AND pick_ids = ($3::text[])[1:cardinality(pick_ids)]
        AND pick_slots = ($8::integer[])[1:cardinality(pick_slots)]
      RETURNING pick_ids, pick_slots, total, done, bust, score`,
    [playerId, roundDate, play.ids, play.total, play.done, play.bust, play.score, play.slots],
  );
  if (rows[0]) return toPlay(rows[0]);
  return (await getNumberPlay(db, playerId, roundDate, sport))!;
}

/** This player's plays on every daily round they've started, by date. */
export async function getNumberProgress(
  db: Queryable,
  playerId: string,
  sport: Sport = "mlb",
): Promise<Map<string, NumberPlay>> {
  const { rows } = await db.query(
    `SELECT round_date::text AS round_date, pick_ids, pick_slots, total, done, bust, score
       FROM ${table(sport, "number_plays")} WHERE player_id = $1`,
    [playerId],
  );
  return new Map(rows.map((r) => [r.round_date as string, toPlay(r)]));
}

export interface NumberStats {
  others: number;
  worse: number;
  tied: number;
  percentBeaten: number | null;
  finishers: number;
  /** Average distance under the target, among those who didn't bust. */
  averageOff: number | null;
  bullseyePercent: number;
  bustPercent: number;
  /** Finishers per bar of the results chart (see numberBucket): bullseye … bust. */
  distribution: number[];
}

/**
 * How a finished play compares with everyone who has finished the round (on its
 * day or later from the archive). Closer is better; every bust ties for last.
 * Your own play is left out of the percentile but counted everywhere else.
 */
export async function getNumberStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  mine: { score: number | null; bust: boolean },
  target: number,
  sport: Sport = "mlb",
): Promise<NumberStats> {
  const { rows } = await db.query<{ bust: boolean; score: number | null; n: string; mine: string }>(
    `SELECT bust, score, count(*) AS n, count(*) FILTER (WHERE player_id = $2) AS mine
       FROM ${table(sport, "number_plays")} WHERE round_date = $1 AND done
      GROUP BY bust, score`,
    [roundDate, playerId],
  );
  const rank = (bust: boolean, score: number | null) => (bust || score === null ? Infinity : score);
  const myRank = rank(mine.bust, mine.score);
  const distribution = Array(NUMBER_BUCKETS).fill(0);
  let others = 0;
  let worse = 0;
  let tied = 0;
  let finishers = 0;
  let busts = 0;
  let bullseyes = 0;
  let offSum = 0;
  for (const r of rows) {
    const n = Number(r.n);
    const notMe = n - Number(r.mine);
    const score = r.score === null ? null : Number(r.score);
    const theirs = rank(r.bust, score);
    finishers += n;
    distribution[numberBucket(score, r.bust, target)] += n;
    if (r.bust) busts += n;
    else {
      offSum += (score ?? 0) * n;
      if (score === 0) bullseyes += n;
    }
    others += notMe;
    if (theirs > myRank) worse += notMe;
    if (theirs === myRank) tied += notMe;
  }
  const made = finishers - busts;
  return {
    others,
    worse,
    tied,
    percentBeaten: percentBeaten(worse, others),
    finishers,
    averageOff: made ? Math.round((offSum / made) * 10) / 10 : null,
    bullseyePercent: finishers ? Math.round((bullseyes / finishers) * 100) : 0,
    bustPercent: finishers ? Math.round((busts / finishers) * 100) : 0,
    distribution,
  };
}

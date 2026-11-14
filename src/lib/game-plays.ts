// Saved plays for Stats Ranker and Sports Revealer, one row per player per
// daily round (practice rounds aren't saved). Same anonymous player id as
// Baseball Golf's plays (the bg_player cookie). The browser also keeps a copy
// in localStorage; the database is the record.
import { percentBeaten, type Queryable } from "./plays";

async function ensurePlayer(db: Queryable, playerId: string) {
  await db.query(`INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING`, [playerId]);
}

// ---------- Stats Ranker ----------

export interface RankPlay {
  order: string[];
  score: number;
}

export async function getRankPlay(db: Queryable, playerId: string, roundDate: string): Promise<RankPlay | null> {
  const { rows } = await db.query<{ guess_order: string[]; score: number }>(
    `SELECT guess_order, score FROM rank_plays WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? { order: rows[0].guess_order, score: rows[0].score } : null;
}

/**
 * Save a submitted order. One shot: if this player already has a play for the
 * round, nothing changes and the saved play comes back with created = false.
 */
export async function recordRankPlay(
  db: Queryable,
  args: { playerId: string; roundDate: string; order: string[]; score: number; isLive: boolean },
): Promise<{ created: boolean; play: RankPlay }> {
  const { playerId, roundDate, order, score, isLive } = args;
  await ensurePlayer(db, playerId);
  const { rowCount } = await db.query(
    `INSERT INTO rank_plays (player_id, round_date, guess_order, score, is_live)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [playerId, roundDate, order, score, isLive],
  );
  if ((rowCount ?? 0) > 0) return { created: true, play: { order, score } };
  return { created: false, play: (await getRankPlay(db, playerId, roundDate))! };
}

/** This player's score on every daily round they've played, by date. */
export async function getRankProgress(db: Queryable, playerId: string): Promise<Map<string, number>> {
  const { rows } = await db.query<{ round_date: string; score: number }>(
    `SELECT round_date::text AS round_date, score FROM rank_plays WHERE player_id = $1`,
    [playerId],
  );
  return new Map(rows.map((r) => [r.round_date, r.score]));
}

// ---------- Sports Revealer ----------

export interface RevealPlay {
  guesses: string[];
  names: string[];
}

export async function getRevealPlay(db: Queryable, playerId: string, roundDate: string): Promise<RevealPlay | null> {
  const { rows } = await db.query<{ guesses: string[]; guess_names: string[] }>(
    `SELECT guesses, guess_names FROM reveal_plays WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? { guesses: rows[0].guesses, names: rows[0].guess_names } : null;
}

/**
 * Save the guesses so far. They must extend what's saved (the saved guesses
 * plus at least one more) and the round must not be over. That keeps one
 * guess per inning even with two tabs open, and lets a browser upload progress
 * it made before plays were saved. Otherwise nothing changes and the saved
 * play comes back with saved = false.
 */
export async function recordRevealGuesses(
  db: Queryable,
  args: {
    playerId: string;
    roundDate: string;
    guesses: string[];
    names: string[];
    solved: boolean;
    done: boolean;
    isLive: boolean;
  },
): Promise<{ saved: boolean; play: RevealPlay }> {
  const { playerId, roundDate, guesses, names, solved, done, isLive } = args;
  await ensurePlayer(db, playerId);
  await db.query(
    `INSERT INTO reveal_plays (player_id, round_date, is_live) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [playerId, roundDate, isLive],
  );
  const { rows } = await db.query<{ guesses: string[]; guess_names: string[] }>(
    `UPDATE reveal_plays p SET
        guesses = $3::text[], guess_names = $4::text[], solved = $5, done = $6,
        completed_at = CASE WHEN $6 THEN now() END
      WHERE p.player_id = $1::uuid AND p.round_date = $2::date
        AND NOT p.done
        AND cardinality($3::text[]) > cardinality(p.guesses)
        AND ($3::text[])[1:cardinality(p.guesses)] = p.guesses
      RETURNING guesses, guess_names`,
    [playerId, roundDate, guesses, names, solved, done],
  );
  if (rows[0]) return { saved: true, play: { guesses: rows[0].guesses, names: rows[0].guess_names } };
  return { saved: false, play: (await getRevealPlay(db, playerId, roundDate))! };
}

export interface RevealProgress {
  innings: number;
  solved: boolean;
  done: boolean;
}

/** This player's progress on every daily round they've started, by date. */
export async function getRevealProgress(db: Queryable, playerId: string): Promise<Map<string, RevealProgress>> {
  const { rows } = await db.query<{ round_date: string; innings: number; solved: boolean; done: boolean }>(
    `SELECT round_date::text AS round_date, cardinality(guesses) AS innings, solved, done
       FROM reveal_plays WHERE player_id = $1 AND cardinality(guesses) > 0`,
    [playerId],
  );
  return new Map(rows.map((r) => [r.round_date, { innings: r.innings, solved: r.solved, done: r.done }]));
}

// ---------- How a finished play compares ----------
// Like Baseball Golf's getRoundStats: everyone who has finished the round counts,
// whether they played it on its day or later from the archive. The player's own
// play is left out of the percentile but counted in the averages.

const toNum = (v: string | number | null) => (v === null ? null : Number(v));
const oneDecimal = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

export interface RankStats {
  others: number;
  worse: number;
  tied: number;
  percentBeaten: number | null;
  finishers: number;
  averageScore: number | null;
  /** Percent of finishers with a perfect order. */
  perfectPercent: number;
}

export async function getRankStats(db: Queryable, roundDate: string, playerId: string, score: number): Promise<RankStats> {
  const { rows } = await db.query<Record<string, string | null>>(
    `SELECT count(*) FILTER (WHERE player_id <> $2)                         AS others,
            count(*) FILTER (WHERE player_id <> $2 AND score > $3::smallint) AS worse,
            count(*) FILTER (WHERE player_id <> $2 AND score = $3::smallint) AS tied,
            count(*)                                                        AS finishers,
            avg(score)                                                      AS average,
            count(*) FILTER (WHERE score = 0)                               AS perfect
       FROM rank_plays WHERE round_date = $1`,
    [roundDate, playerId, score],
  );
  const r = rows[0];
  const others = Number(r.others);
  const worse = Number(r.worse);
  const finishers = Number(r.finishers);
  return {
    others,
    worse,
    tied: Number(r.tied),
    percentBeaten: percentBeaten(worse, others),
    finishers,
    averageScore: oneDecimal(toNum(r.average)),
    perfectPercent: finishers ? Math.round((Number(r.perfect) / finishers) * 100) : 0,
  };
}

export interface RevealStats {
  others: number;
  worse: number;
  tied: number;
  percentBeaten: number | null;
  finishers: number;
  /** Percent of finishers who named the player. */
  solvedPercent: number;
  /** Average inning among those who solved it. */
  averageInning: number | null;
  /** How many finishers solved it in each inning (index 0 = 1st), then struck out last (index 9). */
  distribution: number[];
}

/**
 * A finished Revealer play's result as one number, lower is better: the inning
 * it was solved in (1–9), or 10 for a strikeout.
 */
export const revealResult = (innings: number, solved: boolean) => (solved ? innings : 10);

export async function getRevealStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  result: number,
): Promise<RevealStats> {
  const { rows } = await db.query<{ result: number; n: string; mine: string }>(
    `SELECT CASE WHEN solved THEN cardinality(guesses) ELSE 10 END AS result,
            count(*) AS n,
            count(*) FILTER (WHERE player_id = $2) AS mine
       FROM reveal_plays WHERE round_date = $1 AND done
      GROUP BY 1`,
    [roundDate, playerId],
  );
  const distribution = Array(10).fill(0);
  let others = 0;
  let worse = 0;
  let tied = 0;
  for (const r of rows) {
    const n = Number(r.n);
    const notMe = n - Number(r.mine);
    distribution[Math.min(Math.max(r.result, 1), 10) - 1] += n;
    others += notMe;
    if (r.result > result) worse += notMe;
    if (r.result === result) tied += notMe;
  }
  const finishers = distribution.reduce((a, b) => a + b, 0);
  const solved = finishers - distribution[9];
  const inningSum = distribution.slice(0, 9).reduce((s, n, i) => s + n * (i + 1), 0);
  return {
    others,
    worse,
    tied,
    percentBeaten: percentBeaten(worse, others),
    finishers,
    solvedPercent: finishers ? Math.round((solved / finishers) * 100) : 0,
    averageInning: solved ? oneDecimal(inningSum / solved) : null,
    distribution,
  };
}

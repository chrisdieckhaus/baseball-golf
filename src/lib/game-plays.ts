// Saved plays for Stats Ranker and Roster Reveal, one row per player per
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

// ---------- Roster Reveal ----------

export interface RosterPlay {
  revealed: number;
  guess: string | null;
  correct: boolean;
  done: boolean;
}

function toRosterPlay(r: Record<string, unknown>): RosterPlay {
  return {
    revealed: Number(r.revealed),
    guess: (r.guess as string | null) ?? null,
    correct: Boolean(r.correct),
    done: Boolean(r.done),
  };
}

export async function getRosterPlay(db: Queryable, playerId: string, roundDate: string): Promise<RosterPlay | null> {
  const { rows } = await db.query(
    `SELECT revealed, guess, correct, done FROM roster_plays WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? toRosterPlay(rows[0]) : null;
}

/**
 * Save how many players have been revealed. It only goes up, so a reload can't
 * hide reveals, and it stops changing once the guess is in. Returns the saved play.
 */
export async function recordRosterReveal(
  db: Queryable,
  args: { playerId: string; roundDate: string; revealed: number; isLive: boolean },
): Promise<RosterPlay> {
  const { playerId, roundDate, revealed, isLive } = args;
  await ensurePlayer(db, playerId);
  const { rows } = await db.query(
    `INSERT INTO roster_plays (player_id, round_date, revealed, is_live) VALUES ($1, $2, $3, $4)
     ON CONFLICT (player_id, round_date) DO UPDATE
       SET revealed = GREATEST(roster_plays.revealed, EXCLUDED.revealed)
       WHERE NOT roster_plays.done
     RETURNING revealed, guess, correct, done`,
    [playerId, roundDate, revealed, isLive],
  );
  return rows[0] ? toRosterPlay(rows[0]) : (await getRosterPlay(db, playerId, roundDate))!;
}

/**
 * Save the one guess. The score is the most players this browser ever revealed
 * for the round (saved or sent now). If a guess is already saved, nothing
 * changes and the saved play comes back with saved = false.
 */
export async function recordRosterGuess(
  db: Queryable,
  args: { playerId: string; roundDate: string; revealed: number; guess: string; answer: string; isLive: boolean },
): Promise<{ saved: boolean; play: RosterPlay }> {
  const { playerId, roundDate, revealed, guess, answer, isLive } = args;
  await ensurePlayer(db, playerId);
  await db.query(
    `INSERT INTO roster_plays (player_id, round_date, revealed, is_live) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [playerId, roundDate, revealed, isLive],
  );
  const { rows } = await db.query(
    `UPDATE roster_plays SET
        revealed = GREATEST(revealed, $3), guess = $4, correct = ($4 = $5), done = true, completed_at = now()
      WHERE player_id = $1 AND round_date = $2 AND NOT done
      RETURNING revealed, guess, correct, done`,
    [playerId, roundDate, revealed, guess, answer],
  );
  if (rows[0]) return { saved: true, play: toRosterPlay(rows[0]) };
  return { saved: false, play: (await getRosterPlay(db, playerId, roundDate))! };
}

/** This player's progress on every daily round they've started, by date. */
export async function getRosterProgress(db: Queryable, playerId: string): Promise<Map<string, RosterPlay>> {
  const { rows } = await db.query(
    `SELECT round_date::text AS round_date, revealed, guess, correct, done FROM roster_plays WHERE player_id = $1`,
    [playerId],
  );
  return new Map(rows.map((r) => [r.round_date as string, toRosterPlay(r)]));
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

export interface RosterStats {
  others: number;
  worse: number;
  tied: number;
  percentBeaten: number | null;
  finishers: number;
  /** Percent of finishers who named the team. */
  correctPercent: number;
  /** Average players revealed among those who got it. */
  averageRevealed: number | null;
  /** How many finishers got it after 1, 2, … 10 players (index 0 = 1), then misses last (index 10). */
  distribution: number[];
}

/**
 * How a finished Roster Reveal play compares. `result` is rosterResult(): the
 * players revealed when you got it (1–10), or 11 for a miss; lower is better.
 */
export async function getRosterStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  result: number,
): Promise<RosterStats> {
  const { rows } = await db.query<{ result: number; n: string; mine: string }>(
    `SELECT CASE WHEN correct THEN revealed ELSE 11 END AS result,
            count(*) AS n,
            count(*) FILTER (WHERE player_id = $2) AS mine
       FROM roster_plays WHERE round_date = $1 AND done
      GROUP BY 1`,
    [roundDate, playerId],
  );
  const distribution = Array(11).fill(0);
  let others = 0;
  let worse = 0;
  let tied = 0;
  for (const r of rows) {
    const n = Number(r.n);
    const notMe = n - Number(r.mine);
    distribution[Math.min(Math.max(Number(r.result), 1), 11) - 1] += n;
    others += notMe;
    if (r.result > result) worse += notMe;
    if (r.result === result) tied += notMe;
  }
  const finishers = distribution.reduce((a, b) => a + b, 0);
  const correct = finishers - distribution[10];
  const revealedSum = distribution.slice(0, 10).reduce((s, n, i) => s + n * (i + 1), 0);
  return {
    others,
    worse,
    tied,
    percentBeaten: percentBeaten(worse, others),
    finishers,
    correctPercent: finishers ? Math.round((correct / finishers) * 100) : 0,
    averageRevealed: correct ? oneDecimal(revealedSum / correct) : null,
    distribution,
  };
}

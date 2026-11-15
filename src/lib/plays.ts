import { HOLES_PER_ROUND } from "./round";
import { MAX_HOLE_SCORE } from "./scoring";
import type { RoundStats } from "./types";

/** Anything with pg's query(): a Pool, a Client, or a transaction client. */
export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface StoredPlay {
  guessIds: (string | null)[];
  guessNames: (string | null)[];
  holeScores: (number | null)[];
  totalScore: number | null;
  isLive: boolean;
}

export type RecordOutcome =
  | { ok: true; play: StoredPlay }
  | { ok: false; reason: "already_guessed" | "out_of_order" | "player_reused"; play: StoredPlay };

const PLAYER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidPlayerId = (id: unknown): id is string => typeof id === "string" && PLAYER_ID_RE.test(id);

/**
 * Plays saved before Nov 14, 2026 could score more than MAX_HOLE_SCORE on a
 * hole (the cap used to be higher). Saved scores are left as they are and capped
 * whenever they're read, here and in the SQL below, so old plays score on the
 * same scale as new ones.
 */
const capHole = (s: number | null): number | null => (s === null ? null : Math.min(s, MAX_HOLE_SCORE));

/** A play's total from its capped hole scores, in SQL. */
const CAPPED_TOTAL_SQL = `(SELECT sum(LEAST(s, ${MAX_HOLE_SCORE})) FROM unnest(hole_scores) s)`;

function toPlay(row: Record<string, unknown>): StoredPlay {
  const holeScores = (row.hole_scores as (number | null)[]).map(capHole);
  const finished = row.total_score !== null;
  return {
    guessIds: row.guess_ids as (string | null)[],
    guessNames: row.guess_names as (string | null)[],
    holeScores,
    totalScore: finished ? holeScores.reduce<number>((sum, h) => sum + (h ?? 0), 0) : null,
    isLive: row.is_live as boolean,
  };
}

export async function getPlay(db: Queryable, playerId: string, roundDate: string): Promise<StoredPlay | null> {
  const { rows } = await db.query(
    `SELECT guess_ids, guess_names, hole_scores, total_score, is_live
       FROM plays WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? toPlay(rows[0]) : null;
}

export interface RoundProgress {
  holesPlayed: number;
  totalScore: number | null; // set once the round is finished
}

/** This player's progress on every daily round they've started, by date (YYYY-MM-DD). */
export async function getPlayerProgress(db: Queryable, playerId: string): Promise<Map<string, RoundProgress>> {
  const { rows } = await db.query<{ round_date: string; holes_played: number; total_score: number | null }>(
    `SELECT round_date::text AS round_date,
            cardinality(array_remove(guess_ids, NULL)) AS holes_played,
            CASE WHEN total_score IS NULL THEN NULL ELSE ${CAPPED_TOTAL_SQL}::int END AS total_score
       FROM plays WHERE player_id = $1`,
    [playerId],
  );
  return new Map(rows.map((r) => [r.round_date, { holesPlayed: r.holes_played, totalScore: r.total_score }]));
}

/**
 * Save one guess. The database enforces the game rules, so they hold even if
 * the browser is tampered with: holes in order, one guess per hole, and no
 * player reused within a round. The round total is set when the last hole is saved.
 */
export async function recordGuess(
  db: Queryable,
  args: {
    playerId: string;
    roundDate: string;
    hole: number; // 0-based
    guessId: string;
    guessName: string;
    score: number;
    isLive: boolean;
  },
): Promise<RecordOutcome> {
  const { playerId, roundDate, hole, guessId, guessName, score, isLive } = args;
  const h = hole + 1; // Postgres arrays are 1-based

  await db.query(`INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING`, [playerId]);
  await db.query(
    `INSERT INTO plays (player_id, round_date, is_live) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [playerId, roundDate, isLive],
  );

  const { rows } = await db.query(
    `UPDATE plays p SET
        guess_ids[$3::int]   = $4::text,
        guess_names[$3::int] = $5::text,
        hole_scores[$3::int] = $6::smallint,
        total_score = CASE WHEN cardinality(array_remove(p.guess_ids, NULL)) = $7::int - 1
                           THEN ((SELECT coalesce(sum(s), 0) FROM unnest(p.hole_scores) s) + $6::smallint)::smallint END,
        completed_at = CASE WHEN cardinality(array_remove(p.guess_ids, NULL)) = $7::int - 1 THEN now() END
      WHERE p.player_id = $1::uuid AND p.round_date = $2::date
        AND p.guess_ids[$3::int] IS NULL                                  -- one guess per hole
        AND ($3::int = 1 OR p.guess_ids[$3::int - 1] IS NOT NULL)         -- holes in order
        AND NOT ($4::text = ANY (array_remove(p.guess_ids, NULL)))        -- no player reused
      RETURNING guess_ids, guess_names, hole_scores, total_score, is_live`,
    [playerId, roundDate, h, guessId, guessName, score, HOLES_PER_ROUND],
  );
  if (rows[0]) return { ok: true, play: toPlay(rows[0]) };

  // Rejected: report why, with the current state so the browser can catch up.
  const play = (await getPlay(db, playerId, roundDate))!;
  const reason =
    play.guessIds[hole] !== null
      ? "already_guessed"
      : hole > 0 && play.guessIds[hole - 1] === null
        ? "out_of_order"
        : "player_reused";
  return { ok: false, reason, play };
}

/**
 * How a finished score compares with everyone else who has finished this round,
 * whether they played it on its day or later from the archive. Guests count.
 * The player's own play is excluded from the percentile, but included in the
 * per-hole averages (the average of everyone who has finished the round).
 */
export async function getRoundStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  totalScore: number,
  /** Rank mode's plays, or Player mode's (/golf/player). Same columns. */
  table: "plays" | "player_golf_plays" = "plays",
): Promise<RoundStats> {
  const { rows } = await db.query<{
    others: string;
    worse: string;
    tied: string;
    finishers: string;
    hole_averages: (string | null)[];
    round_average: string | null;
  }>(
    `WITH capped AS (
       SELECT player_id,
              ARRAY[LEAST(hole_scores[1], ${MAX_HOLE_SCORE}), LEAST(hole_scores[2], ${MAX_HOLE_SCORE}),
                    LEAST(hole_scores[3], ${MAX_HOLE_SCORE})] AS holes,
              ${CAPPED_TOTAL_SQL} AS total
         FROM ${table === "player_golf_plays" ? "player_golf_plays" : "plays"}
        WHERE round_date = $1 AND total_score IS NOT NULL
     )
     SELECT count(*) FILTER (WHERE player_id <> $2)                          AS others,
            count(*) FILTER (WHERE player_id <> $2 AND total > $3::int)       AS worse,
            count(*) FILTER (WHERE player_id <> $2 AND total = $3::int)       AS tied,
            count(*)                                                         AS finishers,
            ARRAY[avg(holes[1]), avg(holes[2]), avg(holes[3])]               AS hole_averages,
            avg(total)                                                       AS round_average
       FROM capped`,
    [roundDate, playerId, totalScore],
  );
  const r = rows[0];
  const others = Number(r.others);
  const worse = Number(r.worse);
  return {
    others,
    worse,
    tied: Number(r.tied),
    percentBeaten: percentBeaten(worse, others),
    finishers: Number(r.finishers),
    holeAverages: r.hole_averages.slice(0, HOLES_PER_ROUND).map((a) => oneDecimal(a)),
    roundAverage: oneDecimal(r.round_average),
  };
}

const oneDecimal = (v: string | null) => Math.round(Number(v ?? 0) * 10) / 10;

/** Whole-number percent of other players beaten; never shows 0% or 100% unless literally true. */
export function percentBeaten(worse: number, others: number): number | null {
  if (others === 0) return null;
  if (worse === 0) return 0;
  if (worse === others) return 100;
  return Math.min(99, Math.max(1, Math.round((worse / others) * 100)));
}

import { HOLES_PER_ROUND } from "./round";
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

function toPlay(row: Record<string, unknown>): StoredPlay {
  return {
    guessIds: row.guess_ids as (string | null)[],
    guessNames: row.guess_names as (string | null)[],
    holeScores: row.hole_scores as (number | null)[],
    totalScore: row.total_score as number | null,
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
 * How a finished score compares with everyone else who finished this round on its day.
 * Guests count. The player's own play is excluded from the comparison.
 */
export async function getRoundStats(
  db: Queryable,
  roundDate: string,
  playerId: string,
  totalScore: number,
): Promise<RoundStats> {
  const { rows } = await db.query<{ others: string; worse: string; tied: string }>(
    `SELECT count(*)                                  AS others,
            count(*) FILTER (WHERE total_score > $3::smallint)  AS worse,
            count(*) FILTER (WHERE total_score = $3::smallint)  AS tied
       FROM plays
      WHERE round_date = $1 AND is_live AND total_score IS NOT NULL AND player_id <> $2`,
    [roundDate, playerId, totalScore],
  );
  const others = Number(rows[0].others);
  const worse = Number(rows[0].worse);
  return { others, worse, tied: Number(rows[0].tied), percentBeaten: percentBeaten(worse, others) };
}

/** Whole-number percent of other players beaten; never shows 0% or 100% unless literally true. */
export function percentBeaten(worse: number, others: number): number | null {
  if (others === 0) return null;
  if (worse === 0) return 0;
  if (worse === others) return 100;
  return Math.min(99, Math.max(1, Math.round((worse / others) * 100)));
}

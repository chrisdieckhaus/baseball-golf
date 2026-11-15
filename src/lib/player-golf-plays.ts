// Saved Player mode plays (/golf/player), one row per player per daily round,
// keyed by the same anonymous bg_player cookie as the other games. Like Rank
// mode's plays.ts, the database enforces the rules: holes in order and one
// guess per hole. The round total is set when the last hole is saved.
import type { Queryable } from "./plays";
import { HOLES_PER_ROUND } from "./round";
import { table, type Sport } from "./sport";

export interface StoredPlayerPlay {
  guesses: (number | null)[];
  holeScores: (number | null)[];
  totalScore: number | null;
}

export type PlayerRecordOutcome =
  | { ok: true; play: StoredPlayerPlay }
  | { ok: false; reason: "already_guessed" | "out_of_order"; play: StoredPlayerPlay };

function toPlay(row: Record<string, unknown>): StoredPlayerPlay {
  return {
    guesses: row.guesses as (number | null)[],
    holeScores: row.hole_scores as (number | null)[],
    totalScore: row.total_score as number | null,
  };
}

export async function getPlayerGolfPlay(
  db: Queryable,
  playerId: string,
  roundDate: string,
  sport: Sport = "mlb",
): Promise<StoredPlayerPlay | null> {
  const { rows } = await db.query(
    `SELECT guesses, hole_scores, total_score FROM ${table(sport, "player_golf_plays")} WHERE player_id = $1 AND round_date = $2`,
    [playerId, roundDate],
  );
  return rows[0] ? toPlay(rows[0]) : null;
}

/** This player's progress on every Player mode round they've started, by date. */
export async function getPlayerGolfProgress(
  db: Queryable,
  playerId: string,
  sport: Sport = "mlb",
): Promise<Map<string, { holesPlayed: number; totalScore: number | null }>> {
  const { rows } = await db.query<{ round_date: string; holes_played: number; total_score: number | null }>(
    `SELECT round_date::text AS round_date,
            cardinality(array_remove(guesses, NULL)) AS holes_played,
            total_score
       FROM ${table(sport, "player_golf_plays")} WHERE player_id = $1`,
    [playerId],
  );
  return new Map(rows.map((r) => [r.round_date, { holesPlayed: r.holes_played, totalScore: r.total_score }]));
}

export async function recordPlayerGolfGuess(
  db: Queryable,
  args: { playerId: string; roundDate: string; hole: number; guess: number; score: number; isLive: boolean },
  sport: Sport = "mlb",
): Promise<PlayerRecordOutcome> {
  const { playerId, roundDate, hole, guess, score, isLive } = args;
  const h = hole + 1; // Postgres arrays are 1-based
  const plays = table(sport, "player_golf_plays");

  await db.query(`INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING`, [playerId]);
  await db.query(
    `INSERT INTO ${plays} (player_id, round_date, is_live) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [playerId, roundDate, isLive],
  );

  const { rows } = await db.query(
    `UPDATE ${plays} p SET
        guesses[$3::int]     = $4::smallint,
        hole_scores[$3::int] = $5::smallint,
        total_score = CASE WHEN cardinality(array_remove(p.guesses, NULL)) = $6::int - 1
                           THEN ((SELECT coalesce(sum(s), 0) FROM unnest(p.hole_scores) s) + $5::smallint)::smallint END,
        completed_at = CASE WHEN cardinality(array_remove(p.guesses, NULL)) = $6::int - 1 THEN now() END
      WHERE p.player_id = $1::uuid AND p.round_date = $2::date
        AND p.guesses[$3::int] IS NULL                              -- one guess per hole
        AND ($3::int = 1 OR p.guesses[$3::int - 1] IS NOT NULL)     -- holes in order
      RETURNING guesses, hole_scores, total_score`,
    [playerId, roundDate, h, guess, score, HOLES_PER_ROUND],
  );
  if (rows[0]) return { ok: true, play: toPlay(rows[0]) };

  const play = (await getPlayerGolfPlay(db, playerId, roundDate, sport))!;
  return { ok: false, reason: play.guesses[hole] !== null ? "already_guessed" : "out_of_order", play };
}

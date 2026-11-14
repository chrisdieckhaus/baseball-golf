// Saved plays for Stats Ranker and Sports Revealer, one row per player per
// daily round (practice rounds aren't saved). Same anonymous player id as
// Baseball Golf's plays (the bg_player cookie). The browser also keeps a copy
// in localStorage; the database is the record.
import type { Queryable } from "./plays";

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

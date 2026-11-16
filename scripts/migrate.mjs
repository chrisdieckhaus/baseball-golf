// Creates or updates the database tables. Runs before every `next build`.
// Safe to run repeatedly: every statement is idempotent.
// Skips quietly when no database is configured, so local builds and
// deployments without a database keep working.
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] No DATABASE_URL set; skipping database migration.");
  process.exit(0);
}

const PLAYERS_SCHEMA = `
-- One row per browser (guest) — later linked to an account via user_id.
CREATE TABLE IF NOT EXISTS players (
  id          uuid PRIMARY KEY,
  user_id     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_user_id_idx ON players (user_id) WHERE user_id IS NOT NULL;

`;

// The game tables, once per sport. Baseball's keep their names (prefix ""); NBA's
// are the same tables with an "nba_" prefix (see src/lib/sport.ts).
const gameSchema = (p) => `
-- One row per player per daily round. Holes are 1-indexed in the arrays (Postgres arrays).
CREATE TABLE IF NOT EXISTS ${p}plays (
  player_id     uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_date    date NOT NULL,
  guess_ids     text[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::text[],
  guess_names   text[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::text[],
  hole_scores   smallint[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::smallint[],
  total_score   smallint,
  is_live       boolean NOT NULL,           -- started on the round's own day (ET), not later from the archive
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (player_id, round_date)
);
-- Percentiles compare every finished play of a round, archive plays included.
${p === "" ? "DROP INDEX IF EXISTS plays_percentile_idx;  -- older index that covered only same-day plays" : ""}
CREATE INDEX IF NOT EXISTS ${p}plays_round_scores_idx
  ON ${p}plays (round_date, total_score) WHERE total_score IS NOT NULL;

-- One row per daily round, saved the first time it's needed. Once saved, this row
-- is the round, even if the generator changes later. Only each hole's stat and
-- target rank are saved; answers always come from the current leaderboards.
-- holes: [{"statKey": "RBI", "targetRank": 83}, ...]
CREATE TABLE IF NOT EXISTS ${p}rounds (
  round_date  date PRIMARY KEY,
  holes       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Stats Ranker: one row per daily round, saved the first time it's needed.
-- player_ids is the order the players are shown in. Values aren't saved.
CREATE TABLE IF NOT EXISTS ${p}rank_rounds (
  round_date  date PRIMARY KEY,
  stat_key    text NOT NULL,
  player_ids  text[] NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Stats Ranker plays: one per player per daily round. The game is one shot, so
-- the first order submitted is the play; later submissions get this one back.
CREATE TABLE IF NOT EXISTS ${p}rank_plays (
  player_id     uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_date    date NOT NULL,
  guess_order   text[] NOT NULL,
  score         smallint NOT NULL,
  is_live       boolean NOT NULL,           -- played on the round's own day (ET), not later from the archive
  completed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, round_date)
);
CREATE INDEX IF NOT EXISTS ${p}rank_plays_round_idx ON ${p}rank_plays (round_date, score);

-- Roster Reveal plays: one per player per daily round. revealed only goes up;
-- the one guess (a franchise id) ends the round.
CREATE TABLE IF NOT EXISTS ${p}roster_plays (
  player_id     uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_date    date NOT NULL,
  revealed      smallint NOT NULL DEFAULT 1,
  guess         text,
  correct       boolean NOT NULL DEFAULT false,
  done          boolean NOT NULL DEFAULT false,
  is_live       boolean NOT NULL,           -- played on the round's own day (ET), not later from the archive
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (player_id, round_date)
);
CREATE INDEX IF NOT EXISTS ${p}roster_plays_round_idx ON ${p}roster_plays (round_date) WHERE done;

-- Roster Reveal: one row per daily round (the team-season), saved the first time
-- it's needed. The lineup isn't saved; it comes from the current data.
-- (Sports Revealer's reveal_rounds and reveal_plays tables are no longer used.)
CREATE TABLE IF NOT EXISTS ${p}roster_rounds (
  round_date  date PRIMARY KEY,
  franchise   text NOT NULL,
  year        smallint NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Baseball Golf, Player mode (/golf/player): one row per daily round, saved the
-- first time it's needed. holes: [{"statKey": "HR", "playerId": "ortizda01"}, ...].
-- Ranks aren't saved; they come from the current leaderboards.
CREATE TABLE IF NOT EXISTS ${p}player_golf_rounds (
  round_date  date PRIMARY KEY,
  holes       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Player mode plays: one row per player per daily round, like plays. guesses are
-- the ranks guessed (1-100), one per hole, in order.
CREATE TABLE IF NOT EXISTS ${p}player_golf_plays (
  player_id     uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_date    date NOT NULL,
  guesses       smallint[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::smallint[],
  hole_scores   smallint[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::smallint[],
  total_score   smallint,
  is_live       boolean NOT NULL,           -- started on the round's own day (ET), not later from the archive
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (player_id, round_date)
);
CREATE INDEX IF NOT EXISTS ${p}player_golf_plays_round_scores_idx
  ON ${p}player_golf_plays (round_date, total_score) WHERE total_score IS NOT NULL;

-- King of the Hill: one row per daily round, saved the first time it's needed.
-- player_ids are the six players in the order they appear (the first two meet
-- in matchup 1; each later one challenges the king). Values aren't saved.
CREATE TABLE IF NOT EXISTS ${p}koth_rounds (
  round_date  date PRIMARY KEY,
  stat_key    text NOT NULL,
  player_ids  text[] NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- King of the Hill plays: one row per player per daily round. pick_ids are the
-- player picked in each matchup, in order; they only grow. score = matchups
-- right, saved once all five are played.
CREATE TABLE IF NOT EXISTS ${p}koth_plays (
  player_id     uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_date    date NOT NULL,
  pick_ids      text[] NOT NULL DEFAULT '{}',
  score         smallint,
  done          boolean NOT NULL DEFAULT false,
  is_live       boolean NOT NULL,           -- started on the round's own day (ET), not later from the archive
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (player_id, round_date)
);
CREATE INDEX IF NOT EXISTS ${p}koth_plays_round_idx ON ${p}koth_plays (round_date, score) WHERE done;
`;

// Hit the Number (baseball only).
const NUMBER_SCHEMA = `
-- One row per daily round: the stat and target, saved the first time it's needed.
CREATE TABLE IF NOT EXISTS number_rounds (
  round_date  date PRIMARY KEY,
  stat_key    text NOT NULL,
  target      integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per player per daily round. pick_ids only grow, in order, until the
-- round is done (three picks, or the total went over). score is how far under
-- the target the total finished (null for a bust or an unfinished round).
CREATE TABLE IF NOT EXISTS number_plays (
  player_id     uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_date    date NOT NULL,
  pick_ids      text[] NOT NULL DEFAULT '{}',
  total         integer NOT NULL DEFAULT 0,
  done          boolean NOT NULL DEFAULT false,
  bust          boolean NOT NULL DEFAULT false,
  score         integer,
  is_live       boolean NOT NULL,           -- started on the round's own day (ET), not later from the archive
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (player_id, round_date)
);
CREATE INDEX IF NOT EXISTS number_plays_round_idx ON number_plays (round_date) WHERE done;
`;

const SCHEMA = PLAYERS_SCHEMA + gameSchema("") + gameSchema("nba_") + NUMBER_SCHEMA;

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query(SCHEMA);
  console.log("[migrate] Database schema is up to date.");
} catch (e) {
  console.error("[migrate] Migration failed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}

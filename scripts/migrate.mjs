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

const SCHEMA = `
-- One row per browser (guest) — later linked to an account via user_id.
CREATE TABLE IF NOT EXISTS players (
  id          uuid PRIMARY KEY,
  user_id     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_user_id_idx ON players (user_id) WHERE user_id IS NOT NULL;

-- One row per player per daily round. Holes are 1-indexed in the arrays (Postgres arrays).
CREATE TABLE IF NOT EXISTS plays (
  player_id     uuid NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  round_date    date NOT NULL,
  guess_ids     text[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::text[],
  guess_names   text[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::text[],
  hole_scores   smallint[] NOT NULL DEFAULT ARRAY[NULL, NULL, NULL]::smallint[],
  total_score   smallint,
  is_live       boolean NOT NULL,           -- started on the round's own day (ET); only these count for percentiles
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  PRIMARY KEY (player_id, round_date)
);
CREATE INDEX IF NOT EXISTS plays_percentile_idx
  ON plays (round_date, total_score) WHERE is_live AND total_score IS NOT NULL;
`;

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

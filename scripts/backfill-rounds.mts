// Saves every daily round from launch through today that isn't stored yet.
// Runs after migrations in every build (`npm run build`), and by hand with
// `npm run db:backfill`.
//
// Stored rounds are never changed, so running this again is harmless. It matters
// most on the first deploy with the rounds table: it saves the rounds people
// already played, using the generator they were played with, and adds the
// rounds from launch day on that were never played live. After that,
// changing the generator only affects rounds that don't exist yet.
//
// Skips quietly when no database is configured.
import pg from "pg";
import { leaderboards } from "../src/lib/leaderboards";
import { playableDates } from "../src/lib/round";
import { storeRoundIfMissing } from "../src/lib/rounds";
import { RANK_LAUNCH_DATE } from "../src/lib/rank";
import { storeRankRoundIfMissing } from "../src/lib/rank-rounds";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.log("[backfill-rounds] No DATABASE_URL set; skipping.");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const dates = playableDates();
  let created = 0;
  for (const date of dates) {
    if (await storeRoundIfMissing(client, leaderboards, date)) created++;
  }
  let rankCreated = 0;
  const rankDates = dates.filter((d) => d >= RANK_LAUNCH_DATE);
  for (const date of rankDates) {
    if (await storeRankRoundIfMissing(client, leaderboards, date)) rankCreated++;
  }
  console.log(`[backfill-rounds] Stats Ranker: checked ${rankDates.length} round(s); saved ${rankCreated} new.`);
  console.log(
    `[backfill-rounds] checked ${dates.length} daily round(s) through ${dates.at(-1)}; saved ${created} new.`,
  );
} catch (e) {
  console.error("[backfill-rounds] Failed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}

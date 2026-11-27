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
import { leaderboards, leaderboardsFor } from "../src/lib/leaderboards";
import { isNbaEnabled } from "../src/lib/nba-flag";
import { playerMetaFor } from "../src/lib/player-meta";
import { playableDates } from "../src/lib/round";
import { storeRoundIfMissing } from "../src/lib/rounds";
import playerMeta from "../src/data/player-meta.json";
import { PLAYER_GOLF_LAUNCH_DATE, type PlayerMeta } from "../src/lib/player-golf";
import { storePlayerRoundIfMissing } from "../src/lib/player-golf-rounds";
import { NUMBER_LAUNCH_DATE } from "../src/lib/number";
import { storeNumberRoundIfMissing } from "../src/lib/number-rounds";

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
  let playerCreated = 0;
  const playerDates = dates.filter((d) => d >= PLAYER_GOLF_LAUNCH_DATE);
  for (const date of playerDates) {
    if (await storePlayerRoundIfMissing(client, leaderboards, playerMeta as unknown as PlayerMeta, date)) playerCreated++;
  }
  let numberCreated = 0;
  const numberDates = dates.filter((d) => d >= NUMBER_LAUNCH_DATE);
  for (const date of numberDates) {
    if (await storeNumberRoundIfMissing(client, date)) numberCreated++;
  }
  // NBA (only while the NBA kill switch is on; otherwise its rounds are made the first time they're needed).
  if (isNbaEnabled()) {
    const nba = leaderboardsFor("nba");
    const counts = { golf: 0, player: 0 };
    for (const date of dates) {
      if (await storeRoundIfMissing(client, nba, date, "nba")) counts.golf++;
      if (date >= PLAYER_GOLF_LAUNCH_DATE && (await storePlayerRoundIfMissing(client, nba, playerMetaFor("nba"), date, "nba")))
        counts.player++;
    }
    console.log(`[backfill-rounds] NBA: checked ${dates.length} date(s); saved new rounds ${JSON.stringify(counts)}.`);
  } else {
    console.log("[backfill-rounds] NBA is off (NBA_ENABLED isn't set); skipping NBA rounds.");
  }
  console.log(`[backfill-rounds] Hit the Number: checked ${numberDates.length} round(s); saved ${numberCreated} new.`);
  console.log(`[backfill-rounds] Baseball Golf Player mode: checked ${playerDates.length} round(s); saved ${playerCreated} new.`);
  console.log(
    `[backfill-rounds] checked ${dates.length} daily round(s) through ${dates.at(-1)}; saved ${created} new.`,
  );
} catch (e) {
  console.error("[backfill-rounds] Failed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}

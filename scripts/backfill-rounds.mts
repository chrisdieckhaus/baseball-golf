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
import { rosterDataFor } from "../src/lib/roster-pool";
import { playableDates } from "../src/lib/round";
import { storeRoundIfMissing } from "../src/lib/rounds";
import { RANK_LAUNCH_DATE } from "../src/lib/rank";
import { storeRankRoundIfMissing } from "../src/lib/rank-rounds";
import { ROSTER_LAUNCH_DATE } from "../src/lib/roster";
import { rosterData } from "../src/lib/roster-pool";
import { storeRosterRoundIfMissing } from "../src/lib/roster-rounds";
import playerMeta from "../src/data/player-meta.json";
import { PLAYER_GOLF_LAUNCH_DATE, type PlayerMeta } from "../src/lib/player-golf";
import { storePlayerRoundIfMissing } from "../src/lib/player-golf-rounds";
import { NUMBER_LAUNCH_DATE } from "../src/lib/number";
import { KOTH_LAUNCH_DATE } from "../src/lib/koth";
import { storeKothRoundIfMissing } from "../src/lib/koth-rounds";
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
  let rankCreated = 0;
  const rankDates = dates.filter((d) => d >= RANK_LAUNCH_DATE);
  for (const date of rankDates) {
    if (await storeRankRoundIfMissing(client, leaderboards, date)) rankCreated++;
  }
  let rosterCreated = 0;
  const rosterDates = dates.filter((d) => d >= ROSTER_LAUNCH_DATE);
  for (const date of rosterDates) {
    if (await storeRosterRoundIfMissing(client, rosterData, date)) rosterCreated++;
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
  let kothCreated = 0;
  const kothDates = dates.filter((d) => d >= KOTH_LAUNCH_DATE);
  for (const date of kothDates) {
    if (await storeKothRoundIfMissing(client, leaderboards, date)) kothCreated++;
  }
  // NBA (only while the NBA kill switch is on; otherwise its rounds are made the first time they're needed).
  if (isNbaEnabled()) {
    const nba = leaderboardsFor("nba");
    const counts = { golf: 0, player: 0, rank: 0, roster: 0, king: 0 };
    for (const date of dates) {
      if (await storeRoundIfMissing(client, nba, date, "nba")) counts.golf++;
      if (date >= PLAYER_GOLF_LAUNCH_DATE && (await storePlayerRoundIfMissing(client, nba, playerMetaFor("nba"), date, "nba")))
        counts.player++;
      if (date >= RANK_LAUNCH_DATE && (await storeRankRoundIfMissing(client, nba, date, "nba"))) counts.rank++;
      if (date >= ROSTER_LAUNCH_DATE && (await storeRosterRoundIfMissing(client, rosterDataFor("nba"), date, "nba")))
        counts.roster++;
      if (date >= KOTH_LAUNCH_DATE && (await storeKothRoundIfMissing(client, nba, date, "nba"))) counts.king++;
    }
    console.log(`[backfill-rounds] NBA: checked ${dates.length} date(s); saved new rounds ${JSON.stringify(counts)}.`);
  } else {
    console.log("[backfill-rounds] NBA is off (NBA_ENABLED isn't set); skipping NBA rounds.");
  }
  console.log(`[backfill-rounds] King of the Hill: checked ${kothDates.length} round(s); saved ${kothCreated} new.`);
  console.log(`[backfill-rounds] Hit the Number: checked ${numberDates.length} round(s); saved ${numberCreated} new.`);
  console.log(`[backfill-rounds] Baseball Golf Player mode: checked ${playerDates.length} round(s); saved ${playerCreated} new.`);
  console.log(`[backfill-rounds] Roster Reveal: checked ${rosterDates.length} round(s); saved ${rosterCreated} new.`);
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

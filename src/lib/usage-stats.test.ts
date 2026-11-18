// Database tests for the /stats page's counts. Like the other play tests, they run
// against a real Postgres when TEST_DATABASE_URL is set, and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { getUsageStats } from "./usage-stats";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("usage stats (Postgres)", () => {
  let db: pg.Pool;
  const TODAY = "2026-11-17";
  const [A, B, C] = [1, 2, 3].map((i) => `00000000-0000-4000-8000-00000000002${i}`);
  // 3 pm ET on a given day, and just after midnight ET (still the previous UTC day).
  const at = (date: string, time = "15:00") => `${date} ${time} America/New_York`;

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE players CASCADE");
    await db.query("INSERT INTO players (id) VALUES ($1), ($2), ($3)", [A, B, C]);
  });
  afterAll(async () => {
    await db?.end();
  });

  const golf = (player: string, round: string, completed: string | null, started = completed ?? at(TODAY)) =>
    db.query(
      `INSERT INTO plays (player_id, round_date, total_score, is_live, started_at, completed_at)
       VALUES ($1, $2, $3, true, $4, $5)`,
      [player, round, completed ? 10 : null, started, completed],
    );

  it("counts finished plays by the ET day they finished, archive plays included", async () => {
    await golf(A, TODAY, at(TODAY, "00:05")); // just after midnight ET: today, though UTC says yesterday
    await golf(B, "2026-11-05", at(TODAY)); // archive round finished today
    await golf(C, TODAY, null); // started today, not finished
    await golf(A, "2026-11-16", at("2026-11-16", "23:55")); // yesterday ET
    await golf(B, "2026-11-11", at("2026-11-11")); // 6 days ago: inside 7 days
    await golf(C, "2026-11-10", at("2026-11-10")); // 7 days ago: outside

    const stats = await getUsageStats(db, TODAY);
    const g = stats.games.find((x) => x.name === "Baseball Golf")!;
    expect(g).toMatchObject({ today: 2, yesterday: 1, last7Days: 4, allTime: 5, unfinishedToday: 1 });
    expect(stats.playersToday).toBe(2);
  });

  it("counts every game, and each player once across games", async () => {
    await golf(A, TODAY, at(TODAY));
    await db.query(
      `INSERT INTO rank_plays (player_id, round_date, guess_order, score, is_live, completed_at)
       VALUES ($1, $2, '{}', 0, true, $3)`,
      [A, TODAY, at(TODAY)],
    );
    await db.query(
      `INSERT INTO nba_koth_plays (player_id, round_date, done, score, is_live, completed_at)
       VALUES ($1, $2, true, 4, true, $3)`,
      [B, TODAY, at(TODAY)],
    );
    await db.query(
      `INSERT INTO number_plays (player_id, round_date, done, is_live, started_at) VALUES ($1, $2, false, true, $3)`,
      [C, TODAY, at(TODAY)],
    );

    const stats = await getUsageStats(db, TODAY);
    const find = (name: string, sport: string) => stats.games.find((x) => x.name === name && x.sport === sport)!;
    expect(stats.games).toHaveLength(11);
    expect(find("Stats Ranker", "Baseball").today).toBe(1);
    expect(find("King of the Hill", "Basketball").today).toBe(1);
    expect(find("Hit the Number", "Baseball")).toMatchObject({ today: 0, unfinishedToday: 1 });
    expect(stats.playersToday).toBe(2);
  });
});

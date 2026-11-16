// Database tests for King of the Hill plays and rounds. Like the other play tests,
// they run against a real Postgres when TEST_DATABASE_URL is set, and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { generateStoredKothRound } from "./koth";
import { getKothPlay, getKothProgress, getKothStats, recordKothPicks } from "./koth-plays";
import { getOrCreateStoredKothRound, getStoredKothRound, storeKothRoundIfMissing } from "./koth-rounds";
import { leaderboardsFor } from "./leaderboards";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("King of the Hill plays (Postgres)", () => {
  let db: pg.Pool;
  const D = "2026-11-10";
  const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000001${i}`);
  const [A, B, C, E] = ids;

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE koth_plays, koth_rounds, nba_koth_plays, nba_koth_rounds, players CASCADE");
  });
  afterAll(async () => {
    await db?.end();
  });

  const save = (playerId: string, picks: string[], score: number | null = null, sport: "mlb" | "nba" = "mlb") =>
    recordKothPicks(db, { playerId, roundDate: D, play: { picks, score, done: picks.length === 5 }, isLive: true }, sport);

  it("saves picks as they grow and stops once done", async () => {
    expect(await save(A, ["a"])).toEqual({ picks: ["a"], score: null, done: false });
    expect(await save(A, ["a", "b"])).toEqual({ picks: ["a", "b"], score: null, done: false });
    const done = { picks: ["a", "b", "c", "d", "e"], score: 3, done: true };
    expect(await save(A, done.picks, 3)).toEqual(done);
    expect(await save(A, ["a", "b", "c", "d", "x"], 5)).toEqual(done); // done is final
    expect(await getKothPlay(db, A, D)).toEqual(done);
    expect([...(await getKothProgress(db, A))]).toEqual([[D, done]]);
  });

  it("won't drop or swap picks already saved", async () => {
    await save(A, ["a", "b"]);
    expect((await save(A, ["a"])).picks).toEqual(["a", "b"]);
    expect((await save(A, ["z", "b", "c"])).picks).toEqual(["a", "b"]);
  });

  it("compares a finished play", async () => {
    const five = ["a", "b", "c", "d", "e"];
    await save(A, five, 5);
    await save(B, five, 3);
    await save(C, five, 3);
    await save(E, ["a"]); // unfinished: not counted
    const s = await getKothStats(db, D, B, 3);
    expect(s).toMatchObject({ others: 2, worse: 0, tied: 1, percentBeaten: 0, finishers: 3, averageScore: 3.7, perfectPercent: 33 });
    expect(s.distribution).toEqual([0, 0, 0, 2, 0, 1]);
    expect((await getKothStats(db, D, A, 5)).percentBeaten).toBe(100);
  });

  it("keeps NBA plays separate", async () => {
    await save(A, ["a"], null, "nba");
    expect(await getKothPlay(db, A, D)).toBeNull();
    expect((await getKothPlay(db, A, D, "nba"))!.picks).toEqual(["a"]);
  });

  it("stores a round once and keeps it", async () => {
    const data = leaderboardsFor("mlb");
    expect(await getStoredKothRound(db, D)).toBeNull();
    expect(await storeKothRoundIfMissing(db, data, D)).toBe(true);
    expect(await storeKothRoundIfMissing(db, data, D)).toBe(false);
    expect(await getOrCreateStoredKothRound(db, data, D)).toEqual(generateStoredKothRound(data, D));
    await db.query(`UPDATE koth_rounds SET stat_key = 'HR' WHERE round_date = $1`, [D]);
    expect((await getOrCreateStoredKothRound(db, data, D)).statKey).toBe("HR");
  });
});

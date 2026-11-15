// Database tests: NBA plays and rounds go to the nba_ tables and never mix with
// baseball's. Like plays.test.ts, they run against a real Postgres when
// TEST_DATABASE_URL is set, and are skipped otherwise. They use their own player
// ids and clean up only their own rows, so they can run alongside the other files.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { getRankPlay, getRosterPlay, recordRankPlay, recordRosterGuess, recordRosterReveal } from "./game-plays";
import { nbaLeaderboards, leaderboards } from "./leaderboards";
import { getPlayerGolfPlay, recordPlayerGolfGuess } from "./player-golf-plays";
import { getPlay, getRoundStats, recordGuess } from "./plays";
import { getStoredRankRound, storeRankRoundIfMissing } from "./rank-rounds";
import { generateRound } from "./round";
import { getOrCreateRound, getStoredHoles } from "./rounds";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("NBA plays and rounds (Postgres)", () => {
  let db: pg.Pool;
  const D = "2030-01-15"; // a date no other test file uses
  const A = "00000000-0000-4000-8000-0000000000ba";
  const NBA_TABLES = ["nba_plays", "nba_rounds", "nba_rank_plays", "nba_rank_rounds", "nba_roster_plays", "nba_player_golf_plays"];

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    for (const t of [...NBA_TABLES, "plays", "rounds", "rank_plays", "rank_rounds", "roster_plays", "player_golf_plays"]) {
      await db.query(`DELETE FROM ${t} WHERE round_date = $1`, [D]);
    }
  });
  afterAll(async () => {
    await db?.query(`DELETE FROM players WHERE id = $1`, [A]);
    await db?.end();
  });

  it("stores the NBA round in nba_rounds, separate from baseball's", async () => {
    const nba = await getOrCreateRound(db, nbaLeaderboards, D, "nba");
    expect(nba.holes).toEqual(generateRound(nbaLeaderboards, D, "nba").holes);
    expect(await getStoredHoles(db, D, "mlb")).toBeNull();
    const mlb = await getOrCreateRound(db, leaderboards, D);
    expect(mlb.holes[0].statKey in leaderboards.stats).toBe(true);
    expect((await getStoredHoles(db, D, "nba"))!.map((h) => h.statKey)).toEqual(nba.holes.map((h) => h.statKey));
  });

  it("saves Golf guesses per sport, with separate percentiles", async () => {
    const guess = (sport: "mlb" | "nba", hole: number, id: string, score: number) =>
      recordGuess(db, { playerId: A, roundDate: D, hole, guessId: id, guessName: id, score, isLive: false }, sport);
    expect((await guess("nba", 0, "jamesle01", 5)).ok).toBe(true);
    expect(await getPlay(db, A, D, "mlb")).toBeNull();
    // Baseball's first hole is still open, and the same player can be used there.
    expect((await guess("mlb", 0, "jamesle01", 9)).ok).toBe(true);
    await guess("nba", 1, "curryst01", 0);
    const done = await guess("nba", 2, "jordami01", 10);
    expect(done.ok && done.play.totalScore).toBe(15);
    const stats = await getRoundStats(db, D, A, 15, "plays", "nba");
    expect(stats.finishers).toBe(1);
    expect((await getRoundStats(db, D, A, 15, "plays", "mlb")).finishers).toBe(0);
  });

  it("saves Player mode, Ranker and Roster plays per sport", async () => {
    await recordPlayerGolfGuess(db, { playerId: A, roundDate: D, hole: 0, guess: 12, score: 3, isLive: false }, "nba");
    expect((await getPlayerGolfPlay(db, A, D, "nba"))!.guesses[0]).toBe(12);
    expect(await getPlayerGolfPlay(db, A, D)).toBeNull();

    await recordRankPlay(db, { playerId: A, roundDate: D, order: ["a"], score: 2, isLive: false }, "nba");
    expect(await getRankPlay(db, A, D, "nba")).toEqual({ order: ["a"], score: 2 });
    expect(await getRankPlay(db, A, D)).toBeNull();

    await recordRosterReveal(db, { playerId: A, roundDate: D, revealed: 4, isLive: false }, "nba");
    const g = await recordRosterGuess(
      db,
      { playerId: A, roundDate: D, revealed: 4, guess: "CHI", answer: "CHI", isLive: false },
      "nba",
    );
    expect(g.play).toEqual({ revealed: 4, guess: "CHI", correct: true, done: true });
    expect(await getRosterPlay(db, A, D)).toBeNull();
  });

  it("stores NBA Ranker rounds in nba_rank_rounds", async () => {
    expect(await storeRankRoundIfMissing(db, nbaLeaderboards, D, "nba")).toBe(true);
    expect(await storeRankRoundIfMissing(db, nbaLeaderboards, D, "nba")).toBe(false);
    const stored = (await getStoredRankRound(db, D, "nba"))!;
    expect(stored.statKey in nbaLeaderboards.stats).toBe(true);
    expect(await getStoredRankRound(db, D)).toBeNull();
  });
});

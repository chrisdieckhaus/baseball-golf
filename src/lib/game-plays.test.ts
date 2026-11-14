// Database tests for Stats Ranker and Sports Revealer plays. Like plays.test.ts,
// they run against a real Postgres when TEST_DATABASE_URL is set, and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import {
  getRankPlay,
  getRankStats,
  getRevealStats,
  revealResult,
  getRankProgress,
  getRevealPlay,
  getRevealProgress,
  recordRankPlay,
  recordRevealGuesses,
} from "./game-plays";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Stats Ranker and Sports Revealer plays (Postgres)", () => {
  let db: pg.Pool;
  const D = "2026-11-10";
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE rank_plays, reveal_plays, players CASCADE");
  });
  afterAll(async () => {
    await db?.end();
  });

  it("saves a Ranker play once; a second submission gets the first back", async () => {
    const first = await recordRankPlay(db, { playerId: A, roundDate: D, order: ["a", "b"], score: 4, isLive: true });
    expect(first).toEqual({ created: true, play: { order: ["a", "b"], score: 4 } });
    const again = await recordRankPlay(db, { playerId: A, roundDate: D, order: ["b", "a"], score: 0, isLive: true });
    expect(again).toEqual({ created: false, play: { order: ["a", "b"], score: 4 } });
    await recordRankPlay(db, { playerId: B, roundDate: D, order: ["b", "a"], score: 0, isLive: false });
    expect(await getRankPlay(db, B, D)).toEqual({ order: ["b", "a"], score: 0 });
    expect([...(await getRankProgress(db, A))]).toEqual([[D, 4]]);
  });

  const reveal = (playerId: string, guesses: string[], solved = false, done = false) =>
    recordRevealGuesses(db, {
      playerId,
      roundDate: D,
      guesses,
      names: guesses.map((g) => (g === "skip" ? "" : g.toUpperCase())),
      solved,
      done,
      isLive: true,
    });

  it("saves Revealer guesses one inning at a time", async () => {
    expect((await reveal(A, ["skip"])).saved).toBe(true);
    expect((await reveal(A, ["skip", "ruthba01"])).saved).toBe(true);
    expect(await getRevealPlay(db, A, D)).toEqual({ guesses: ["skip", "ruthba01"], names: ["", "RUTHBA01"] });
    expect([...(await getRevealProgress(db, A))]).toEqual([[D, { innings: 2, solved: false, done: false }]]);
  });

  it("rejects guesses that don't extend the saved ones, and returns the saved play", async () => {
    await reveal(A, ["skip", "ruthba01"]);
    const stale = await reveal(A, ["skip"]); // an older tab
    expect(stale).toEqual({ saved: false, play: { guesses: ["skip", "ruthba01"], names: ["", "RUTHBA01"] } });
    const fork = await reveal(A, ["cobbty01", "aaronha01", "skip"]); // a different history
    expect(fork.saved).toBe(false);
  });

  it("accepts a browser's earlier progress when nothing is saved yet", async () => {
    const r = await reveal(A, ["skip", "skip", "henderi01"], true, true);
    expect(r.saved).toBe(true);
    expect([...(await getRevealProgress(db, A))]).toEqual([[D, { innings: 3, solved: true, done: true }]]);
  });

  it("locks a finished round", async () => {
    await reveal(A, ["henderi01"], true, true);
    expect((await reveal(A, ["henderi01", "skip"])).saved).toBe(false);
  });

  it("compares a Ranker score with everyone else's", async () => {
    const C = "00000000-0000-4000-8000-00000000000c";
    await recordRankPlay(db, { playerId: A, roundDate: D, order: ["a"], score: 2, isLive: true });
    await recordRankPlay(db, { playerId: B, roundDate: D, order: ["a"], score: 0, isLive: true });
    await recordRankPlay(db, { playerId: C, roundDate: D, order: ["a"], score: 6, isLive: false });
    expect(await getRankStats(db, D, A, 2)).toEqual({
      others: 2,
      worse: 1,
      tied: 0,
      percentBeaten: 50,
      finishers: 3,
      averageScore: 2.7,
      perfectPercent: 33,
    });
  });

  it("compares a Revealer result with everyone else's, with a chart by inning", async () => {
    const C = "00000000-0000-4000-8000-00000000000c";
    await reveal(A, ["skip", "x1"], true, true); // solved in the 2nd
    await reveal(B, ["x1"], true, true); // solved in the 1st
    await reveal(C, Array(9).fill("skip"), false, true); // struck out
    const stats = await getRevealStats(db, D, A, revealResult(2, true));
    expect(stats).toMatchObject({ others: 2, worse: 1, tied: 0, percentBeaten: 50, finishers: 3, solvedPercent: 67 });
    expect(stats.averageInning).toBe(1.5);
    expect(stats.distribution).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
});

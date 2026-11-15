// Database tests for Stats Ranker and Roster Reveal plays. Like plays.test.ts,
// they run against a real Postgres when TEST_DATABASE_URL is set, and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import {
  getRankPlay,
  getRankStats,
  getRosterStats,
  getRankProgress,
  getRosterPlay,
  getRosterProgress,
  recordRankPlay,
  recordRosterGuess,
  recordRosterReveal,
} from "./game-plays";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Stats Ranker and Roster Reveal plays (Postgres)", () => {
  let db: pg.Pool;
  const D = "2026-11-10";
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE rank_plays, roster_plays, players CASCADE");
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

  const show = (playerId: string, revealed: number) =>
    recordRosterReveal(db, { playerId, roundDate: D, revealed, isLive: true });
  const guess = (playerId: string, revealed: number, team: string) =>
    recordRosterGuess(db, { playerId, roundDate: D, revealed, guess: team, answer: "BOS", isLive: true });

  it("saves Roster reveals, which only go up", async () => {
    expect(await show(A, 3)).toEqual({ revealed: 3, guess: null, correct: false, done: false });
    expect((await show(A, 2)).revealed).toBe(3); // an older tab can't lower it
    expect((await show(A, 5)).revealed).toBe(5);
  });

  it("scores a Roster guess on the most players ever revealed", async () => {
    await show(A, 6);
    const r = await guess(A, 2, "BOS"); // claims 2, but 6 were revealed
    expect(r).toEqual({ saved: true, play: { revealed: 6, guess: "BOS", correct: true, done: true } });
    expect([...(await getRosterProgress(db, A))]).toEqual([[D, { revealed: 6, guess: "BOS", correct: true, done: true }]]);
  });

  it("keeps the first Roster guess and locks the round", async () => {
    await guess(A, 3, "NYY");
    const again = await guess(A, 3, "BOS");
    expect(again).toEqual({ saved: false, play: { revealed: 3, guess: "NYY", correct: false, done: true } });
    expect((await show(A, 9)).revealed).toBe(3); // no more reveals after the guess
    expect(await getRosterPlay(db, A, D)).toMatchObject({ guess: "NYY", correct: false });
  });

  it("accepts a guess with no reveals saved yet (progress from before plays were saved)", async () => {
    const r = await guess(B, 4, "BOS");
    expect(r.play).toEqual({ revealed: 4, guess: "BOS", correct: true, done: true });
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

  it("compares a Roster result with everyone else's, with a chart of players needed", async () => {
    const C = "00000000-0000-4000-8000-00000000000c";
    await guess(A, 3, "BOS"); // got it after 3
    await guess(B, 1, "BOS"); // got it after 1
    await guess(C, 7, "NYY"); // missed
    const stats = await getRosterStats(db, D, A, 3);
    expect(stats).toMatchObject({ others: 2, worse: 1, tied: 0, percentBeaten: 50, finishers: 3, correctPercent: 67 });
    expect(stats.averageRevealed).toBe(2);
    expect(stats.distribution).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
});

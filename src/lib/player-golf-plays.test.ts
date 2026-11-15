// Database tests for Player mode. They run against a real Postgres when
// TEST_DATABASE_URL is set, and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import meta from "@/data/player-meta.json";
import { leaderboards } from "./leaderboards";
import { generateStoredPlayerRound, type PlayerMeta } from "./player-golf";
import { getPlayerGolfPlay, getPlayerGolfProgress, recordPlayerGolfGuess } from "./player-golf-plays";
import { getOrCreateStoredPlayerRound, storePlayerRoundIfMissing } from "./player-golf-rounds";
import { getRoundStats } from "./plays";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Player mode (Postgres)", () => {
  let db: pg.Pool;
  const D = "2026-11-15";
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  const guess = (playerId: string, hole: number, g: number, score: number) =>
    recordPlayerGolfGuess(db, { playerId, roundDate: D, hole, guess: g, score, isLive: true });

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE player_golf_plays, player_golf_rounds, plays, players CASCADE");
  });
  afterAll(async () => {
    await db?.end();
  });

  it("stores a round once and returns the stored copy", async () => {
    const M = meta as unknown as PlayerMeta;
    const [a, b] = await Promise.all([
      getOrCreateStoredPlayerRound(db, leaderboards, M, D),
      getOrCreateStoredPlayerRound(db, leaderboards, M, D),
    ]);
    expect(a).toEqual(b);
    expect(a).toEqual(generateStoredPlayerRound(leaderboards, M, D));
    expect(await storePlayerRoundIfMissing(db, leaderboards, M, D)).toBe(false);
  });

  it("records a full round, in order, one guess per hole", async () => {
    expect(await guess(A, 1, 20, 3)).toMatchObject({ ok: false, reason: "out_of_order" });
    expect((await guess(A, 0, 25, 8)).ok).toBe(true);
    expect(await guess(A, 0, 17, 0)).toMatchObject({ ok: false, reason: "already_guessed" });
    await guess(A, 1, 12, 2);
    const last = await guess(A, 2, 21, 0);
    expect(last).toMatchObject({ ok: true, play: { guesses: [25, 12, 21], holeScores: [8, 2, 0], totalScore: 10 } });
    expect((await getPlayerGolfPlay(db, A, D))?.totalScore).toBe(10);
    expect((await getPlayerGolfProgress(db, A)).get(D)).toEqual({ holesPlayed: 3, totalScore: 10 });
  });

  it("compares only with Player mode plays", async () => {
    for (const [h, g, s] of [[0, 1, 30], [1, 1, 30], [2, 1, 30]] as const) await guess(B, h, g, s); // B: 90
    for (const [h, g, s] of [[0, 2, 1], [1, 2, 1], [2, 2, 1]] as const) await guess(A, h, g, s); // A: 3
    const stats = await getRoundStats(db, D, A, 3, "player_golf_plays");
    expect(stats).toMatchObject({ others: 1, worse: 1, percentBeaten: 100, finishers: 2, holeAverages: [15.5, 15.5, 15.5] });
    // Rank mode's table has no plays for this date.
    expect((await getRoundStats(db, D, A, 3)).finishers).toBe(0);
  });
});

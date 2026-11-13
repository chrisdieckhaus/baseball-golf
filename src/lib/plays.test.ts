// Database tests for round tracking. They run against a real Postgres when
// TEST_DATABASE_URL is set (e.g. a local Postgres), and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { getPlay, getRoundStats, percentBeaten, recordGuess } from "./plays";

const url = process.env.TEST_DATABASE_URL;

describe("percentBeaten", () => {
  it("handles edge cases", () => {
    expect(percentBeaten(0, 0)).toBeNull();
    expect(percentBeaten(0, 10)).toBe(0);
    expect(percentBeaten(10, 10)).toBe(100);
    expect(percentBeaten(1, 1000)).toBe(1); // never rounds down to 0% when you beat someone
    expect(percentBeaten(999, 1000)).toBe(99); // never rounds up to 100% unless you beat everyone
    expect(percentBeaten(78, 100)).toBe(78);
  });
});

describe.skipIf(!url)("round tracking (Postgres)", () => {
  let db: pg.Pool;
  const D = "2026-11-13";
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  const guess = (playerId: string, hole: number, guessId: string, score: number, isLive = true, roundDate = D) =>
    recordGuess(db, { playerId, roundDate, hole, guessId, guessName: guessId, score, isLive });

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE plays, players CASCADE");
  });
  afterAll(async () => {
    await db?.end();
  });

  it("records a full round and totals it", async () => {
    expect((await guess(A, 0, "p1", 4)).ok).toBe(true);
    expect((await guess(A, 1, "p2", 12)).ok).toBe(true);
    const last = await guess(A, 2, "p3", 0);
    expect(last).toMatchObject({ ok: true, play: { totalScore: 16, holeScores: [4, 12, 0] } });
    expect((await getPlay(db, A, D))?.guessIds).toEqual(["p1", "p2", "p3"]);
  });

  it("allows only one guess per hole", async () => {
    await guess(A, 0, "p1", 4);
    const again = await guess(A, 0, "p9", 0);
    expect(again).toMatchObject({ ok: false, reason: "already_guessed" });
    expect((await getPlay(db, A, D))?.holeScores[0]).toBe(4);
  });

  it("requires holes in order", async () => {
    expect(await guess(A, 1, "p1", 4)).toMatchObject({ ok: false, reason: "out_of_order" });
  });

  it("rejects reusing a player within a round", async () => {
    await guess(A, 0, "p1", 4);
    expect(await guess(A, 1, "p1", 4)).toMatchObject({ ok: false, reason: "player_reused" });
  });

  it("keeps a finished round finished", async () => {
    for (const [h, id] of ["p1", "p2", "p3"].entries()) await guess(A, h, id, 5);
    expect(await guess(A, 2, "p4", 0)).toMatchObject({ ok: false, reason: "already_guessed", play: { totalScore: 15 } });
  });

  it("computes percentiles from live, finished rounds (guests included)", async () => {
    // Ten other finished players with totals 10, 20, ..., 100.
    for (let i = 1; i <= 10; i++) {
      const id = `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`;
      await guess(id, 0, "p1", i * 10);
      await guess(id, 1, "p2", 0);
      await guess(id, 2, "p3", 0);
    }
    await guess(B, 0, "p1", 5); // unfinished: ignored
    const late = "00000000-0000-4000-8000-0000000002ff";
    for (const [h, id] of ["p1", "p2", "p3"].entries()) await guess(late, h, id, 0, false); // archive play: ignored

    for (const [h, id] of ["p1", "p2", "p3"].entries()) await guess(A, h, id, h === 0 ? 45 : 0); // total 45
    const stats = await getRoundStats(db, D, A, 45);
    expect(stats).toEqual({ others: 10, worse: 6, tied: 0, percentBeaten: 60 });

    // A different day is a separate pool.
    expect((await getRoundStats(db, "2026-11-12", A, 45)).others).toBe(0);
  });

  it("handles two simultaneous guesses on the same hole safely", async () => {
    const results = await Promise.all([guess(A, 0, "p1", 4), guess(A, 0, "p2", 9)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await getPlay(db, A, D))?.guessIds.filter(Boolean)).toHaveLength(1);
  });
});

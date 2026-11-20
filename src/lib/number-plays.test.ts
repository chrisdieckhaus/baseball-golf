// Database tests for Hit the Number plays and rounds. Like the other play tests,
// they run against a real Postgres when TEST_DATABASE_URL is set, and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { generateNumberRound, NUMBER_SLOTS_FROM } from "./number";
import { getNumberPlay, getNumberProgress, getNumberStats, recordNumberPicks, type NumberPlay } from "./number-plays";
import { getOrCreateStoredNumberRound, getStoredNumberRound, newNumberRound, storeNumberRoundIfMissing } from "./number-rounds";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Hit the Number plays (Postgres)", () => {
  let db: pg.Pool;
  const D = "2026-11-10";
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  const C = "00000000-0000-4000-8000-00000000000c";

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE number_plays, number_rounds, players CASCADE");
  });
  afterAll(async () => {
    await db?.end();
  });

  const play = (ids: string[], total: number, end?: { bust?: boolean; score?: number }): NumberPlay => ({
    ids,
    slots: [],
    total,
    done: end !== undefined,
    bust: end?.bust ?? false,
    score: end?.score ?? null,
  });
  const save = (playerId: string, p: NumberPlay) => recordNumberPicks(db, { playerId, roundDate: D, play: p, isLive: true });

  it("saves picks as they grow and stops once done", async () => {
    expect(await save(A, play(["x"], 500))).toEqual(play(["x"], 500));
    expect(await save(A, play(["x", "y"], 800))).toEqual(play(["x", "y"], 800));
    const done = play(["x", "y", "z"], 875, { score: 25 });
    expect(await save(A, done)).toEqual(done);
    // Done is final.
    expect(await save(A, play(["x", "y", "w"], 900, { score: 0 }))).toEqual(done);
    expect(await getNumberPlay(db, A, D)).toEqual(done);
    expect([...(await getNumberProgress(db, A))]).toEqual([[D, done]]);
  });

  it("won't drop or swap picks already saved", async () => {
    await save(A, play(["x", "y"], 800));
    expect(await save(A, play(["x"], 500))).toEqual(play(["x", "y"], 800)); // an older tab
    expect(await save(A, play(["q", "y", "z"], 875, { score: 25 }))).toEqual(play(["x", "y"], 800)); // different first pick
  });

  it("compares a finished play; busts tie for last", async () => {
    await save(A, play(["a", "b", "c"], 900, { score: 0 }));
    await save(B, play(["a", "b", "c"], 850, { score: 50 }));
    await save(C, play(["a"], 1200, { bust: true }));
    await recordNumberPicks(db, { playerId: "00000000-0000-4000-8000-00000000000d", roundDate: D, play: play(["a"], 5), isLive: true });
    const mine = await getNumberStats(db, D, B, { score: 50, bust: false }, 900);
    expect(mine).toMatchObject({ others: 2, worse: 1, tied: 0, percentBeaten: 50, finishers: 3 });
    expect(mine).toMatchObject({ averageOff: 25, bullseyePercent: 33, bustPercent: 33 });
    expect(mine.distribution).toEqual([1, 0, 0, 1, 0, 0, 1]);
    const bust = await getNumberStats(db, D, C, { score: null, bust: true }, 900);
    expect(bust).toMatchObject({ worse: 0, tied: 0, percentBeaten: 0 });
  });

  it("stores a round once and keeps it", async () => {
    expect(await getStoredNumberRound(db, D)).toBeNull();
    expect(await storeNumberRoundIfMissing(db, D)).toBe(true);
    expect(await storeNumberRoundIfMissing(db, D)).toBe(false);
    expect(await getOrCreateStoredNumberRound(db, D)).toEqual({ ...generateNumberRound(D), slots: null });
    await db.query(`UPDATE number_rounds SET target = 123 WHERE round_date = $1`, [D]);
    expect((await getOrCreateStoredNumberRound(db, D)).target).toBe(123);
  });

  it("stores slot rules for rounds from NUMBER_SLOTS_FROM on", async () => {
    const stored = await getOrCreateStoredNumberRound(db, NUMBER_SLOTS_FROM);
    expect(stored).toEqual(newNumberRound(NUMBER_SLOTS_FROM));
    expect(stored.slots).toHaveLength(3);
    // A round stored without slots (by older code) keeps none.
    const next = "2026-11-22";
    await db.query(`INSERT INTO number_rounds (round_date, stat_key, target) VALUES ($1, 'HR', 500)`, [next]);
    expect((await getOrCreateStoredNumberRound(db, next)).slots).toBeNull();
  });

  it("saves each pick's slot, and won't move a pick to another slot", async () => {
    const slotted = (ids: string[], slots: number[], total: number, end?: { score?: number }) => ({ ...play(ids, total, end), slots });
    expect(await save(A, slotted(["x"], [2], 500))).toEqual(slotted(["x"], [2], 500));
    expect(await save(A, slotted(["x", "y"], [0, 1], 800))).toEqual(slotted(["x"], [2], 500)); // x moved
    const done = slotted(["x", "y", "z"], [2, 0, 1], 875, { score: 25 });
    expect(await save(A, done)).toEqual(done);
    expect(await getNumberPlay(db, A, D)).toEqual(done);
  });
});

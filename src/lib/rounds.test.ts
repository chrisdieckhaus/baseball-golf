// Stored daily rounds. The database tests run against a real Postgres when
// TEST_DATABASE_URL is set, and are skipped otherwise.
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { leaderboards } from "./leaderboards";
import { generateRound, isPlayableDate, LAUNCH_DATE, playableDates, roundNumber } from "./round";
import { generateStoredHoles, getOrCreateRound, getStoredHoles, roundFromStored, storeRoundIfMissing } from "./rounds";
import { targetPlayers } from "./scoring";

describe("playable dates", () => {
  it("run from launch through today", () => {
    expect(isPlayableDate(LAUNCH_DATE, "2026-11-20")).toBe(true);
    expect(isPlayableDate("2026-11-20", "2026-11-20")).toBe(true);
    expect(isPlayableDate("2026-11-21", "2026-11-20")).toBe(false); // future
    expect(isPlayableDate("2026-10-31", "2026-11-20")).toBe(false); // before launch
    expect(isPlayableDate("2026-02-30", "2027-01-01")).toBe(false);
    expect(isPlayableDate(undefined)).toBe(false);
  });
  it("lists every date, across month and year ends", () => {
    expect(playableDates(LAUNCH_DATE)).toEqual([LAUNCH_DATE]);
    const dates = playableDates("2027-01-02");
    expect(dates[0]).toBe(LAUNCH_DATE);
    expect(dates.slice(-4)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(dates).toHaveLength(63);
  });
});

describe("roundNumber", () => {
  it("counts from #1 on launch day", () => {
    expect(roundNumber("2026-11-01")).toBe(1);
    expect(roundNumber("2026-11-13")).toBe(13);
    expect(roundNumber("2027-01-01")).toBe(62);
  });
});

describe("stored holes", () => {
  it("save only each hole's stat and target rank", () => {
    const holes = generateStoredHoles(leaderboards, "2026-11-13");
    for (const h of holes) expect(Object.keys(h).sort()).toEqual(["statKey", "targetRank"]);
  });
  it("rebuild the same round the generator makes", () => {
    for (const date of ["2026-11-13", "2026-12-25", "2027-06-01"]) {
      expect(roundFromStored(leaderboards, date, generateStoredHoles(leaderboards, date))).toEqual(
        generateRound(leaderboards, date),
      );
    }
  });
  it("fail clearly if a stat is missing from the leaderboards", () => {
    expect(() => roundFromStored(leaderboards, "2026-11-13", [{ statKey: "WAR", targetRank: 5 }])).toThrow(/WAR/);
  });
});

describe("targetPlayers", () => {
  const e = (id: string, rank: number) => ({ id, name: id, rank, value: 0 });
  const entries = [e("a", 46), e("b", 47), e("c", 47), e("d", 49), e("f", 50)];
  it("is whoever holds the rank", () => {
    expect(targetPlayers(entries, 49).map((x) => x.id)).toEqual(["d"]);
    expect(targetPlayers(entries, 47).map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("falls back to the tie covering a rank nobody holds (after a data refresh)", () => {
    expect(targetPlayers(entries, 48).map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("is empty past the end of the leaderboard", () => {
    expect(targetPlayers(entries, 60)).toEqual([]);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("stored rounds (Postgres)", () => {
  let db: pg.Pool;
  const D = "2026-11-13";

  beforeAll(async () => {
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url } });
    db = new pg.Pool({ connectionString: url });
  });
  beforeEach(async () => {
    await db.query("TRUNCATE rounds");
  });
  afterAll(async () => {
    await db?.end();
  });

  it("saves a round the first time and reads it back after", async () => {
    expect(await getStoredHoles(db, D)).toBeNull();
    const first = await getOrCreateRound(db, leaderboards, D);
    expect(first).toEqual(generateRound(leaderboards, D));
    expect(await getStoredHoles(db, D)).toEqual(generateStoredHoles(leaderboards, D));
    expect(await getOrCreateRound(db, leaderboards, D)).toEqual(first);
    expect((await db.query("SELECT count(*)::int AS n FROM rounds")).rows[0].n).toBe(1);
  });

  it("uses the stored round, not the generator, once a round exists", async () => {
    // Stand-in for a round made by an older generator.
    const old = [
      { statKey: "RBI", targetRank: 83 },
      { statKey: "ERA", targetRank: 10 },
      { statKey: "HR", targetRank: 1 },
    ];
    await db.query(`INSERT INTO rounds (round_date, holes) VALUES ($1, $2)`, [D, JSON.stringify(old)]);
    const got = await getOrCreateRound(db, leaderboards, D);
    expect(got.holes.map(({ statKey, targetRank }) => ({ statKey, targetRank }))).toEqual(old);
    expect(got.holes[0].label).toBe(leaderboards.stats.RBI.label);
    expect(await storeRoundIfMissing(db, leaderboards, D)).toBe(false);
  });

  it("creates a round only once when requests race", async () => {
    const all = await Promise.all(Array.from({ length: 5 }, () => getOrCreateRound(db, leaderboards, D)));
    for (const r of all) expect(r).toEqual(all[0]);
    expect((await db.query("SELECT count(*)::int AS n FROM rounds")).rows[0].n).toBe(1);
  });

  it("backfills every round since launch, and leaves existing ones alone", async () => {
    const kept = [{ statKey: "HR", targetRank: 1 }];
    await db.query(`INSERT INTO rounds (round_date, holes) VALUES ($1, $2)`, [D, JSON.stringify(kept)]);
    const run = () =>
      execFileSync("npx", ["tsx", "scripts/backfill-rounds.mts"], {
        env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: "" },
        encoding: "utf8",
      });
    run();
    const { rows } = await db.query(`SELECT round_date::text AS d FROM rounds ORDER BY round_date`);
    expect(rows.map((r) => r.d)).toEqual(playableDates());
    expect(await getStoredHoles(db, D)).toEqual(kept);
    expect(run()).toContain("saved 0 new");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildKothShareText,
  displayName,
  generateStoredKothRound,
  KOTH_BANDS,
  KOTH_STATS,
  kothRoundNumber,
  kothStatFor,
  kothState,
  publicKothRound,
  validKothPicks,
} from "./koth";
import { leaderboardsFor } from "./leaderboards";
import { SPORTS } from "./sport";

const dateAt = (i: number) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
const noPos = () => "";

/** Play a whole round, always picking the challenger. */
function playAll(sport: (typeof SPORTS)[number], date: string, pick: "king" | "challenger" = "challenger") {
  const data = leaderboardsFor(sport);
  const stored = generateStoredKothRound(data, date, sport);
  const picks: string[] = [];
  for (let i = 0; i < 5; i++) picks.push(kothState(data, stored, picks, noPos).next![pick].id);
  return { data, stored, picks, state: kothState(data, stored, picks, noPos) };
}

describe("King of the Hill rounds", () => {
  it("numbers rounds from Nov 1, 2026", () => {
    expect(kothRoundNumber("2026-11-01")).toBe(1);
    expect(kothRoundNumber("2026-11-15")).toBe(15);
  });

  for (const sport of SPORTS) {
    it(`${sport}: every stat exists on the leaderboards with at least 300 players`, () => {
      const data = leaderboardsFor(sport);
      for (const key of Object.keys(KOTH_STATS[sport])) expect(data.stats[key]?.entries.length).toBeGreaterThanOrEqual(300);
    });

    it(`${sport}: uses each stat once per cycle and never the same stat two days running`, () => {
      const n = Object.keys(KOTH_STATS[sport]).length;
      const keys = Array.from({ length: n * 60 }, (_, i) => kothStatFor(dateAt(i), sport));
      for (let c = 0; c < 60; c++) expect(new Set(keys.slice(c * n, c * n + n)).size).toBe(n);
      for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
    });

    it(`${sport}: chains have six different players, no tied matchups, and get closer`, () => {
      const gaps: number[][] = [[], [], [], [], []];
      for (let d = 0; d < 300; d++) {
        const date = dateAt(d);
        const { data, stored, state } = playAll(sport, date);
        expect(generateStoredKothRound(data, date, sport)).toEqual(stored);
        expect(new Set(stored.playerIds).size).toBe(6);
        const index = new Map(data.stats[stored.statKey].entries.map((e, i) => [e.id, i]));
        state.results.forEach((r, i) => {
          expect(r.king.value).not.toBe(r.challenger.value);
          gaps[i].push(Math.abs(index.get(r.king.id)! - index.get(r.challenger.id)!));
        });
      }
      // Most matchups land in their band (the rest widen it when the king is near an end of the list).
      gaps.forEach((g, i) => {
        const [lo, hi] = KOTH_BANDS[i];
        const inBand = g.filter((x) => x >= lo && x <= hi).length / g.length;
        expect(inBand).toBeGreaterThan(0.9);
      });
    });
  }
});

describe("playing a round", () => {
  it("the real winner stays on, whatever you picked", () => {
    const date = "2026-11-15";
    const a = playAll("mlb", date, "challenger");
    const b = playAll("mlb", date, "king");
    // Same matchups either way.
    expect(a.state.results.map((r) => [r.king.id, r.challenger.id])).toEqual(
      b.state.results.map((r) => [r.king.id, r.challenger.id]),
    );
    for (let i = 1; i < 5; i++) expect(a.state.results[i].king.id).toBe(a.state.results[i - 1].winnerId);
    expect(a.state.score + b.state.score).toBe(5);
  });

  it("shows only the king's number in an unplayed matchup, and none in matchup 1", () => {
    const data = leaderboardsFor("mlb");
    const stored = generateStoredKothRound(data, "2026-11-15", "mlb");
    const first = kothState(data, stored, [], noPos);
    expect(first.next!.king.value).toBeNull();
    expect(first.next!.challenger.value).toBeNull();
    const second = kothState(data, stored, [first.next!.king.id], noPos);
    expect(second.next!.king.value).not.toBeNull();
    expect(second.next!.challenger.value).toBeNull();
    expect(second.results[0].king.value).not.toBeNull();
  });

  it("lower ERA wins", () => {
    const data = leaderboardsFor("mlb");
    const date = Array.from({ length: 30 }, (_, i) => dateAt(i)).find((d) => kothStatFor(d, "mlb") === "ERA")!;
    const { state } = playAll("mlb", date);
    for (const r of state.results) {
      const w = r.winnerId === r.king.id ? r.king : r.challenger;
      const l = r.winnerId === r.king.id ? r.challenger : r.king;
      expect(Number(w.value)).toBeLessThan(Number(l.value));
    }
    expect(data.stats.ERA.lowerIsBetter).toBe(true);
  });

  it("checks picks against each matchup's two players", () => {
    const { data, stored, picks } = playAll("mlb", "2026-11-15");
    expect(validKothPicks(data, stored, picks)).toBe(true);
    expect(validKothPicks(data, stored, picks.slice(0, 2))).toBe(true);
    expect(validKothPicks(data, stored, [])).toBe(false);
    expect(validKothPicks(data, stored, [...picks, picks[0]])).toBe(false);
    expect(validKothPicks(data, stored, ["nobody"])).toBe(false);
    expect(validKothPicks(data, stored, [stored.playerIds[3]])).toBe(false); // not in matchup 1
    expect(validKothPicks(data, stored, "x")).toBe(false);
  });

  it("tells same-named players apart", () => {
    expect(displayName("griffke02", "Ken Griffey")).toBe("Ken Griffey Jr.");
    expect(displayName("ruthba01", "Babe Ruth")).toBe("Babe Ruth");
  });

  it("shares the marks and score only", () => {
    const { data, stored, state } = playAll("mlb", "2026-11-15");
    const round = publicKothRound(data, "2026-11-15", stored, "mlb");
    const text = buildKothShareText(round, state, "https://dailydugout.com/king");
    const lines = text.split("\n");
    expect(lines[0]).toBe("King of the Hill #15 · Nov 15, 2026");
    expect(lines[1]).toBe(`Career ${round.noun}`);
    expect(lines[2]).toMatch(/^[✅❌]{5} \d\/5$/u);
    for (const r of state.results) expect(text).not.toContain(r.king.name);
    expect(buildKothShareText(round, state, "u", "nba")).toContain("King of the Hill · NBA #15");
  });
});

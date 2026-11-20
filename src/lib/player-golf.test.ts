import { describe, expect, it } from "vitest";
import meta from "@/data/player-meta.json";
import { leaderboards } from "./leaderboards";
import {
  generateStoredPlayerRound,
  isValidRankGuess,
  playerGolfResult,
  playerRoundFromStored,
  scorePlayerHole,
  type PlayerMeta,
} from "./player-golf";
import { EXCLUDED_STATS, generateRound, MAX_TIE_SIZE } from "./round";
import { MAX_HOLE_SCORE, MAX_TARGET_RANK } from "./scoring";
import { buildShareText } from "./share";

const M = meta as unknown as PlayerMeta;
const nthDate = (i: number) => new Date(Date.UTC(2026, 10, 1) + i * 86_400_000).toISOString().slice(0, 10);

describe("Player mode rounds", () => {
  it("is the same for the same date and differs across dates", () => {
    expect(generateStoredPlayerRound(leaderboards, M, "2026-11-15")).toEqual(
      generateStoredPlayerRound(leaderboards, M, "2026-11-15"),
    );
    const rounds = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(generateStoredPlayerRound(leaderboards, M, nthDate(i)))));
    expect(rounds.size).toBe(30);
  });

  it("follows the rules for a year of dates", () => {
    for (let i = 0; i < 365; i++) {
      const holes = generateStoredPlayerRound(leaderboards, M, nthDate(i));
      expect(holes).toHaveLength(3);
      expect(new Set(holes.map((h) => h.statKey)).size).toBe(3);
      expect(new Set(holes.map((h) => h.playerId)).size).toBe(3);
      expect(new Set(holes.map((h) => leaderboards.stats[h.statKey].group)).size).toBe(2);
      for (const h of holes) {
        const entries = leaderboards.stats[h.statKey].entries;
        const him = entries.find((e) => e.id === h.playerId)!;
        expect(him.rank).toBeLessThanOrEqual(MAX_TARGET_RANK);
        expect(entries.filter((e) => e.rank === him.rank).length).toBeLessThanOrEqual(MAX_TIE_SIZE);
        expect(M[h.playerId]).toBeDefined();
      }
    }
  });

  it("shows the player and stat but not his rank", () => {
    const round = playerRoundFromStored(leaderboards, M, "2026-11-15", [{ statKey: "HR", playerId: "ortizda01" }]);
    expect(round.holes[0]).toEqual({
      statKey: "HR",
      label: "Home Runs",
      group: "Batting",
      qualifier: null,
      lowerIsBetter: false,
      player: { id: "ortizda01", name: "David Ortiz", years: "1997–2016", pos: "DH" },
    });
    expect(JSON.stringify(round)).not.toContain("541");
  });
});

describe("Golf stat pool", () => {
  it("never picks an excluded stat (WHIP) in either mode", () => {
    expect(leaderboards.stats.WHIP).toBeDefined(); // kept so old rounds still score
    for (let i = 0; i < 365; i++) {
      const rank = generateRound(leaderboards, nthDate(i)).holes.map((h) => h.statKey);
      const player = generateStoredPlayerRound(leaderboards, M, nthDate(i)).map((h) => h.statKey);
      for (const key of [...rank, ...player]) expect(EXCLUDED_STATS.has(key)).toBe(false);
    }
  });
});

describe("Player mode scoring", () => {
  const hr = leaderboards.stats.HR.entries;

  it("scores the distance to his rank, capped", () => {
    // David Ortiz is 17th in career home runs.
    expect(scorePlayerHole(hr, "ortizda01", 17)).toBe(0);
    expect(scorePlayerHole(hr, "ortizda01", 25)).toBe(8);
    expect(scorePlayerHole(hr, "ortizda01", 10)).toBe(7);
    expect(scorePlayerHole(hr, "nobody", 10)).toBe(MAX_HOLE_SCORE);
  });

  it("counts any rank inside his tie as exact", () => {
    // McCovey, Thomas and Williams are tied at 20th, which covers 20th–22nd.
    expect(scorePlayerHole(hr, "willite01", 20)).toBe(0);
    expect(scorePlayerHole(hr, "willite01", 22)).toBe(0);
    expect(scorePlayerHole(hr, "willite01", 23)).toBe(1);
    expect(scorePlayerHole(hr, "willite01", 18)).toBe(2);
  });

  it("builds the reveal", () => {
    const round = playerRoundFromStored(leaderboards, M, "2026-11-15", [{ statKey: "HR", playerId: "ortizda01" }]);
    const r = playerGolfResult(leaderboards, round, 0, 21);
    expect(r).toMatchObject({ score: 4, rank: 17, tied: false, value: "541" });
    expect(r.near.map((e) => e.rank)).toEqual([15, 16, 17, 18, 19]);
    expect(r.near.find((e) => e.him)?.name).toBe("David Ortiz");
    expect(r.atGuess.rank).toBe(20);
    expect(r.atGuess.players.map((p) => p.name).sort()).toEqual(["Frank Thomas", "Ted Williams", "Willie McCovey"]);
  });

  it("only accepts ranks 1–100", () => {
    expect([0, 1, 100, 101, 2.5, "5"].map(isValidRankGuess)).toEqual([false, true, true, false, false, false]);
  });

  it("labels the share text", () => {
    const text = buildShareText({ date: "2026-11-15", scores: [8, 2, 0], url: "x", mode: "player" });
    expect(text.split("\n")[0]).toBe("Baseball Golf · Player #15 · Nov 15, 2026");
  });
});

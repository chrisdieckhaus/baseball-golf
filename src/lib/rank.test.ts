import { describe, expect, it } from "vitest";
import { leaderboards } from "./leaderboards";
import {
  buildRankShareText,
  generateStoredRankRound,
  isValidOrder,
  lastName,
  RANK_MAX_SCORE,
  RANK_PLAYERS,
  RANK_POOL,
  rankRoundFromStored,
  scoreRankOrder,
} from "./rank";

const date = "2026-11-20";
const round = rankRoundFromStored(leaderboards, date, generateStoredRankRound(leaderboards, date));
const answer = scoreRankOrder(leaderboards, round, round.players.map((p) => p.id)).answer.map((a) => a.id);

describe("Stats Ranker round", () => {
  it("is the same for the same date and differs across dates", () => {
    expect(generateStoredRankRound(leaderboards, date)).toEqual(generateStoredRankRound(leaderboards, date));
    const keys = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(generateStoredRankRound(leaderboards, `2026-12-${String(i + 1).padStart(2, "0")}`))),
    );
    expect(keys.size).toBe(20);
  });

  it("picks five distinct top-300 players with distinct values, for many dates", () => {
    for (let i = 0; i < 200; i++) {
      const r = generateStoredRankRound(leaderboards, date, `t${i}`);
      const stat = leaderboards.stats[r.statKey];
      expect(r.playerIds).toHaveLength(RANK_PLAYERS);
      const entries = r.playerIds.map((id) => stat.entries.find((e) => e.id === id)!);
      expect(entries.every((e) => e && e.rank <= RANK_POOL)).toBe(true);
      expect(new Set(entries.map((e) => e.value)).size).toBe(RANK_PLAYERS);
    }
  });

  it("takes one player from each fifth of the top 300", () => {
    for (let i = 0; i < 200; i++) {
      const r = generateStoredRankRound(leaderboards, date, `b${i}`);
      const stat = leaderboards.stats[r.statKey];
      const bands = r.playerIds
        .map((id) => Math.floor((stat.entries.find((e) => e.id === id)!.rank - 1) / (RANK_POOL / RANK_PLAYERS)))
        .sort();
      expect(bands).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("doesn't show the players in band order", () => {
    let inOrder = 0;
    for (let i = 0; i < 200; i++) {
      const r = generateStoredRankRound(leaderboards, date, `s${i}`);
      const round = rankRoundFromStored(leaderboards, date, r);
      if (scoreRankOrder(leaderboards, round, r.playerIds).score === 0) inOrder++;
    }
    // A random shuffle is already right 1 time in 120.
    expect(inOrder).toBeLessThan(10);
  });

  it("shows the players alphabetically by last name", () => {
    for (let i = 0; i < 100; i++) {
      const r = rankRoundFromStored(leaderboards, date, generateStoredRankRound(leaderboards, date, `a${i}`));
      const last = r.players.map((p) => lastName(p.name));
      expect(last).toEqual([...last].sort((x, y) => x.localeCompare(y, "en")));
    }
    expect(lastName("Ken Griffey Jr.")).toBe("Griffey");
    expect(lastName("Cal Ripken")).toBe("Ripken");
  });

  it("orders lower-is-better stats ascending", () => {
    const stored = { statKey: "ERA", playerIds: leaderboards.stats.ERA.entries.slice(0, 5).map((e) => e.id).reverse() };
    const r = rankRoundFromStored(leaderboards, date, stored);
    const reveal = scoreRankOrder(leaderboards, r, stored.playerIds);
    expect(reveal.answer.map((a) => a.rank)).toEqual([...reveal.answer.map((a) => a.rank)].sort((a, b) => a! - b!));
  });
});

describe("Stats Ranker scoring", () => {
  it("scores the right order 0 and the reversed order the maximum", () => {
    expect(scoreRankOrder(leaderboards, round, answer).score).toBe(0);
    expect(scoreRankOrder(leaderboards, round, [...answer].reverse()).score).toBe(RANK_MAX_SCORE);
  });

  it("adds up how far each player is from his spot", () => {
    const swapped = [answer[1], answer[0], ...answer.slice(2)];
    const reveal = scoreRankOrder(leaderboards, round, swapped);
    expect(reveal.score).toBe(2);
    expect(reveal.guess.map((g) => g.off)).toEqual([1, 1, 0, 0, 0]);
    expect(reveal.guess.map((g) => g.dir)).toEqual([1, -1, 0, 0, 0]);
    expect(buildRankShareText(round, reveal, "u").split("\n").slice(1, 6)).toEqual(["⬇️ 1", "⬆️ 1", "✅", "✅", "✅"]);
  });

  it("validates orders", () => {
    expect(isValidOrder(round, answer)).toBe(true);
    expect(isValidOrder(round, answer.slice(1))).toBe(false);
    expect(isValidOrder(round, [answer[0], ...answer.slice(0, 4)])).toBe(false);
    expect(isValidOrder(round, [...answer.slice(1), "nobody01"])).toBe(false);
    expect(isValidOrder(round, "x")).toBe(false);
  });

  it("builds spoiler-free share text", () => {
    const text = buildRankShareText(round, scoreRankOrder(leaderboards, round, answer), "https://example.com/rank");
    expect(text).toContain("✅\n✅\n✅\n✅\n✅");
    expect(text).toContain("Perfect order!");
    for (const p of round.players) expect(text).not.toContain(p.name);
    expect(text).not.toContain(round.label);
  });
});

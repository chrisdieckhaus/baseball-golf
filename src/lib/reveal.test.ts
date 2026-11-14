import { describe, expect, it } from "vitest";
import {
  buildRevealShareText,
  generateStoredRevealRound,
  INNINGS,
  isValidGuesses,
  revealRoundNumber,
  revealState,
  SKIP,
  type RevealRound,
} from "./reveal";
import { revealData } from "./reveal-pool";

const byId = new Map(revealData.players.map((p) => [p.id, p]));

describe("Sports Revealer data", () => {
  it("has a pool of WAR leaders with nine clues each", () => {
    expect(revealData.players.length).toBeGreaterThan(100);
    for (const p of revealData.players) {
      expect(p.clues).toHaveLength(INNINGS);
      expect(p.clues.slice(4).map((c) => c.label)).toEqual([
        "Bats / Throws",
        p.type === "pitcher" ? "Position" : "Positions",
        "Awards",
        "Years active",
        "Teams",
      ]);
    }
  });

  it("orders the four stat clues from his 4th-best rank up to his best, with the rank shown", () => {
    for (const p of revealData.players) {
      const ranks = p.clues.slice(0, 4).map((c) => c.rank!);
      expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
      for (const c of p.clues.slice(0, 4)) expect(c.value).toMatch(/\(\d+(st|nd|rd|th)\)$/);
    }
  });

  it("shows switch hitters as S", () => {
    const values = revealData.players.map((p) => p.clues[4].value);
    expect(values.every((v) => /^Bats [LRS], throws [LR]$/.test(v))).toBe(true);
    expect(byId.get("rosepe01")!.clues[4].value).toBe("Bats S, throws R");
  });

  it("lists each team once, alphabetically", () => {
    const teams = byId.get("henderi01")!.clues[8].value.split(", ");
    expect(teams).toEqual([...new Set(teams)].sort());
    expect(teams).toContain("Oakland Athletics");
    expect(byId.get("henderi01")!.clues[8].value).not.toContain("→");
  });

  it("knows Rickey Henderson's best stats", () => {
    const rickey = byId.get("henderi01")!;
    expect(rickey.clues.slice(2, 4).map((c) => c.label).sort()).toEqual(["Runs", "Stolen bases"]);
    expect(rickey.clues.find((c) => c.label === "Stolen bases")!.value).toBe("1,406 (1st)");
  });
});

describe("Sports Revealer round", () => {
  it("is the same for the same date and walks the pool without repeats", () => {
    const d = "2026-11-20";
    expect(generateStoredRevealRound(revealData, d)).toEqual(generateStoredRevealRound(revealData, d));
    const seen = new Set<string>();
    const start = Date.parse("2026-11-01T00:00:00Z");
    for (let i = 0; i < revealData.players.length; i++) {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      seen.add(generateStoredRevealRound(revealData, date).playerId);
    }
    expect(seen.size).toBe(revealData.players.length);
  });

  it("keeps the players of rounds already played when the archive was added", () => {
    expect(generateStoredRevealRound(revealData, "2026-11-14").playerId).toBe("beltrca01");
    expect(generateStoredRevealRound(revealData, "2026-11-15").playerId).toBe("yastrca01");
  });

  it("numbers rounds from launch", () => {
    expect(revealRoundNumber("2026-11-01")).toBe(1);
    expect(revealRoundNumber("2026-11-14")).toBe(14);
  });

  it("gives practice rounds a player from the pool", () => {
    for (let i = 0; i < 50; i++) {
      expect(byId.has(generateStoredRevealRound(revealData, "2026-11-20", `p${i}`).playerId)).toBe(true);
    }
  });
});

describe("guessing", () => {
  const player = byId.get("henderi01")!;

  it("shows one clue to start and one more per miss or skip", () => {
    expect(revealState(player, []).clues).toHaveLength(1);
    const s = revealState(player, ["ruthba01", SKIP]);
    expect(s.clues).toHaveLength(3);
    expect(s.done).toBe(false);
    expect(s.answer).toBeNull();
  });

  it("ends on the right answer and reveals everything", () => {
    const s = revealState(player, [SKIP, player.id]);
    expect(s).toMatchObject({ solved: true, done: true });
    expect(s.clues).toHaveLength(INNINGS);
    expect(s.answer?.name).toBe("Rickey Henderson");
  });

  it("ends after nine misses", () => {
    const s = revealState(player, Array(INNINGS).fill(SKIP));
    expect(s).toMatchObject({ solved: false, done: true });
    expect(s.answer?.id).toBe(player.id);
  });

  it("rejects impossible guess lists", () => {
    expect(isValidGuesses(player, [])).toBe(true);
    expect(isValidGuesses(player, [SKIP, SKIP, "ruthba01"])).toBe(true);
    expect(isValidGuesses(player, Array(INNINGS + 1).fill(SKIP))).toBe(false);
    expect(isValidGuesses(player, ["ruthba01", "ruthba01"])).toBe(false);
    expect(isValidGuesses(player, [player.id, SKIP])).toBe(false);
    expect(isValidGuesses(player, ["<script>"])).toBe(false);
    expect(isValidGuesses(player, "skip")).toBe(false);
  });

  it("builds spoiler-free share text", () => {
    const round: RevealRound = { date: "2026-11-16", type: "hitter" };
    const guesses = ["ruthba01", SKIP, player.id];
    const text = buildRevealShareText(round, guesses, revealState(player, guesses), "https://x/reveal");
    expect(text).toBe("Sports Revealer #16 · Nov 16, 2026\n🟥⬛🟩\nGot him in the 3rd inning\nhttps://x/reveal");
    expect(text).not.toContain("Henderson");
  });
});

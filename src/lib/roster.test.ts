import { describe, expect, it } from "vitest";
import {
  buildRosterShareText,
  findTeamSeason,
  generateStoredRosterRound,
  isValidGuess,
  isValidRevealed,
  LINEUP_SIZE,
  publicRound,
  rosterResult,
  rosterRoundNumber,
  rosterState,
} from "./roster";
import { rosterData } from "./roster-pool";

const find = (team: string, year: number) => rosterData.rounds.find((r) => r.team === team && r.year === year)!;

describe("Roster Reveal data", () => {
  it("has every AL/NL team-season since 1901 with a ten-player lineup", () => {
    expect(rosterData.firstYear).toBe(1901);
    expect(rosterData.rounds.length).toBeGreaterThan(2700);
    for (const r of rosterData.rounds) {
      expect(r.lineup).toHaveLength(LINEUP_SIZE);
      expect(new Set(r.lineup.map((p) => p.id)).size).toBe(LINEUP_SIZE);
      expect(rosterData.yearTeams[String(r.year)].some(([f]) => f === r.franchise)).toBe(true);
    }
  });

  it("builds lineups: eight fielders, then DH + ace or two starters", () => {
    const sox = find("Boston Red Sox", 2004);
    expect(sox.lineup.map((p) => p.pos).sort()).toEqual(["1B", "2B", "3B", "C", "CF", "DH", "LF", "RF", "SP", "SS"]);
    const yanks = find("New York Yankees", 1927);
    expect(yanks.lineup.filter((p) => p.pos === "SP")).toHaveLength(2);
    expect(yanks.lineup.at(-1)!.name).toBe("Lou Gehrig"); // most famous last
  });

  it("lists every team for short seasons like 2020", () => {
    expect(rosterData.yearTeams["2020"]).toHaveLength(30);
    expect(find("Toronto Blue Jays", 2020).lineup.map((p) => p.name)).toContain("Vladimir Guerrero Jr.");
  });
});

describe("Roster Reveal rounds", () => {
  it("is the same for the same date, and doesn't repeat for years", () => {
    expect(generateStoredRosterRound(rosterData, "2026-11-20")).toEqual(generateStoredRosterRound(rosterData, "2026-11-20"));
    const seen = new Set<string>();
    const start = Date.parse("2026-11-01T00:00:00Z");
    for (let i = 0; i < 1000; i++) {
      const r = generateStoredRosterRound(rosterData, new Date(start + i * 86_400_000).toISOString().slice(0, 10));
      seen.add(`${r.year}-${r.franchise}`);
    }
    expect(seen.size).toBe(1000);
  });

  it("numbers rounds from Nov 1, 2026", () => {
    expect(rosterRoundNumber("2026-11-01")).toBe(1);
    expect(rosterRoundNumber("2026-11-14")).toBe(14);
  });
});

describe("playing a round", () => {
  const ts = find("Boston Red Sox", 2004);
  const round = publicRound(rosterData, ts, "2026-11-16");

  it("shows only the players revealed, and no answer, until the guess", () => {
    const s = rosterState(ts, 3, null);
    expect(s.revealed).toHaveLength(3);
    expect(s.revealed[0].name).toBe(ts.lineup[0].name);
    expect(s.answer).toBeNull();
    expect(JSON.stringify(s)).not.toContain("Boston");
    expect(JSON.stringify(round)).not.toContain(ts.lineup[0].name);
  });

  it("ends on the guess and reveals the whole lineup", () => {
    expect(rosterState(ts, 4, "BOS")).toMatchObject({ done: true, correct: true });
    const miss = rosterState(ts, 4, "NYY");
    expect(miss).toMatchObject({ done: true, correct: false });
    expect(miss.answer?.lineup).toHaveLength(LINEUP_SIZE);
    expect(rosterResult(4, true)).toBe(4);
    expect(rosterResult(4, false)).toBe(11);
  });

  it("validates reveal counts and guesses", () => {
    expect([0, 1, 10, 11, 2.5, "3"].map(isValidRevealed)).toEqual([false, true, true, false, false, false]);
    expect(isValidGuess(round, "BOS")).toBe(true);
    expect(isValidGuess(round, "WSN")).toBe(true); // the 2004 Expos (franchise WSN)
    expect(isValidGuess(round, "XXX")).toBe(false);
  });

  it("builds spoiler-free share text", () => {
    const text = buildRosterShareText(round, rosterState(ts, 4, "BOS"), "https://x/roster");
    expect(text).toBe("Roster Reveal #16 · Nov 16, 2026\n🟦🟦🟦✅\nGot it after 4 players\nhttps://x/roster");
  });

  it("finds a stored round's team-season", () => {
    expect(findTeamSeason(rosterData, { franchise: "BOS", year: 2004 }).team).toBe("Boston Red Sox");
  });
});

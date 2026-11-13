import { describe, expect, it } from "vitest";
import raw from "@/data/leaderboards.json";
import type { LeaderboardData } from "./types";
import { eligibleTargetRanks, generateRound, MAX_TIE_SIZE, todayET } from "./round";
import { formatValue, ordinal, scoreHole } from "./scoring";
import { search } from "@/components/PlayerSearch";
import { buildShareText, holeEmoji } from "./share";

const data = raw as unknown as LeaderboardData;

describe("scoreHole", () => {
  it("is the absolute rank difference", () => {
    expect(scoreHole(83, 83)).toBe(0);
    expect(scoreHole(83, 90)).toBe(7);
    expect(scoreHole(83, 70)).toBe(13);
  });
  it("caps at 150 and scores unranked as 150", () => {
    expect(scoreHole(10, 299)).toBe(150);
    expect(scoreHole(10, null)).toBe(150);
  });
});

describe("formatting", () => {
  it("formats values baseball-style", () => {
    expect(formatValue(0.3663, "rate", 3)).toBe(".366");
    expect(formatValue(1.816, "rate", 2)).toBe("1.82");
    expect(formatValue(4256, "count", 0)).toBe("4,256");
  });
  it("makes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 83, 112].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "83rd", "112th",
    ]);
  });
});

describe("leaderboards", () => {
  const top = (k: string) => data.stats[k].entries[0];
  it("match well-known career leaders", () => {
    expect(top("HR")).toMatchObject({ name: "Barry Bonds", value: 762, rank: 1 });
    expect(top("H")).toMatchObject({ name: "Pete Rose", value: 4256 });
    expect(top("AVG").name).toBe("Ty Cobb");
    expect(top("ERA").name).toBe("Ed Walsh");
    expect(top("SV")).toMatchObject({ name: "Mariano Rivera", value: 652 });
  });
  it("shares rank on ties (competition ranking)", () => {
    const w = data.stats.W.entries;
    expect(w[2].rank).toBe(3);
    expect(w[3].rank).toBe(3); // Alexander & Mathewson, 373
    expect(w[4].rank).toBe(5);
  });
  it("applies rate-stat minimums (Josh Gibson < 3,000 PA)", () => {
    expect(data.stats.AVG.entries.some((e) => e.name === "Josh Gibson")).toBe(false);
  });
});

describe("generateRound", () => {
  it("is deterministic per date", () => {
    expect(generateRound(data, "2026-11-13")).toEqual(generateRound(data, "2026-11-13"));
    expect(generateRound(data, "2026-11-13")).not.toEqual(generateRound(data, "2026-11-14"));
  });
  it("produces valid rounds across a year of dates", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    for (let d = 0; d < 365; d++) {
      const date = new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
      const { holes } = generateRound(data, date);
      expect(holes).toHaveLength(3);
      expect(new Set(holes.map((h) => h.statKey)).size).toBe(3);
      expect(new Set(holes.map((h) => h.group)).size).toBe(2); // never all one group
      for (const h of holes) {
        expect(h.targetRank).toBeGreaterThanOrEqual(1);
        expect(h.targetRank).toBeLessThanOrEqual(150);
        const holders = data.stats[h.statKey].entries.filter((e) => e.rank === h.targetRank);
        expect(holders.length).toBeGreaterThanOrEqual(1);
        expect(holders.length).toBeLessThanOrEqual(MAX_TIE_SIZE);
      }
    }
  });
  it("practice rounds are seeded by the seed, not the date", () => {
    const a = generateRound(data, "2026-11-13", "abc123");
    expect(a.practiceSeed).toBe("abc123");
    expect(a.holes).toEqual(generateRound(data, "2027-05-01", "abc123").holes);
    expect(a.holes).not.toEqual(generateRound(data, "2026-11-13").holes);
  });
  it("only targets ranks somebody holds", () => {
    expect(eligibleTargetRanks(data, "W")).not.toContain(4);
  });
});

describe("todayET", () => {
  it("rolls over at midnight Eastern, not UTC", () => {
    expect(todayET(new Date("2026-11-14T04:30:00Z"))).toBe("2026-11-13"); // 11:30pm ET
    expect(todayET(new Date("2026-11-14T05:00:00Z"))).toBe("2026-11-14"); // midnight ET
  });
});

describe("player search", () => {
  const players = [
    { id: "ruthba01", n: "Babe Ruth", y: "1914–1935", p: "OF", g: 2503, norm: "babe ruth" },
    { id: "ruthbo01", n: "Bob Ruthven", y: "1960", p: "P", g: 3, norm: "bob ruthven" },
    { id: "bondsba01", n: "Barry Bonds", y: "1986–2007", p: "OF", g: 2986, norm: "barry bonds" },
  ];
  it("matches on any part of the name", () => {
    expect(search(players, "ruth").map((p) => p.id)).toEqual(["ruthba01", "ruthbo01"]);
    expect(search(players, "babe r").map((p) => p.id)).toEqual(["ruthba01"]);
    expect(search(players, "b")).toEqual([]);
  });
});

describe("share text", () => {
  it("shows only hole scores, total and link (no spoilers)", () => {
    const text = buildShareText({
      date: "2026-11-13",
      scores: [4, 12, 0],
      url: "https://baseball-golf.vercel.app",
    });
    expect(text).toBe(
      "Baseball Golf · Nov 13, 2026\n🟩 +4  🟨 +12  ⛳ ACE\nTotal: 16\nhttps://baseball-golf.vercel.app",
    );
  });
  it("labels practice rounds and buckets scores", () => {
    const text = buildShareText({ date: "2026-11-13", practiceSeed: "abc123", scores: [35, 90, 150], url: "x" });
    expect(text.split("\n")[0]).toBe("Baseball Golf · Practice #abc123");
    expect(text).toContain("🟧 +35  🟥 +90  ⬛ +150");
    expect([0, 5, 6, 20, 21, 50, 51, 149, 150].map(holeEmoji).join("")).toBe("⛳🟩🟨🟨🟧🟧🟥🟥⬛");
  });
  it("celebrates a perfect round", () => {
    expect(buildShareText({ date: "2026-11-13", scores: [0, 0, 0], url: "x" })).toContain("perfect round");
  });
});

import { describe, expect, it } from "vitest";
import { nbaLeaderboards as data } from "./leaderboards";
import { generateStoredPlayerRound } from "./player-golf";
import { playerMetaFor } from "./player-meta";
import { generateStoredRankRound, buildRankShareText, rankRoundFromStored, scoreRankOrder } from "./rank";
import {
  buildRosterShareText,
  findTeamSeason,
  generateStoredRosterRound,
  lineupSize,
  publicRound,
  rosterState,
} from "./roster";
import { nbaRosterData } from "./roster-pool";
import { eligibleTargetRanks, generateRound, MAX_TIE_SIZE } from "./round";
import { formatValue, MAX_TARGET_RANK } from "./scoring";
import { buildShareText } from "./share";
import { apiUrl, namespaced, parseSport, seasonLabel, table } from "./sport";

const meta = playerMetaFor("nba");

function dates(n: number, from = "2026-11-01"): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < n; i++, d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const rank = (key: string, id: string) => data.stats[key].entries.find((e) => e.id === id)?.rank;
const value = (key: string, id: string) => data.stats[key].entries.find((e) => e.id === id)?.value;

describe("NBA leaderboards match Basketball-Reference", () => {
  it("has the career leaders", () => {
    expect(data.stats.PTS.entries[0].name).toBe("LeBron James");
    expect(data.stats.TRB.entries[0].name).toBe("Wilt Chamberlain");
    expect(data.stats.AST.entries[0].name).toBe("John Stockton");
    expect(data.stats.STL.entries[0].name).toBe("John Stockton");
    expect(data.stats.BLK.entries[0].name).toBe("Hakeem Olajuwon");
    expect(data.stats["3P"].entries[0].name).toBe("Stephen Curry");
    expect(data.stats.PPG.entries[0].name).toBe("Michael Jordan");
    expect(data.stats.APG.entries[0].name).toBe("Magic Johnson");
    expect(data.stats["FT%"].entries[0].name).toBe("Stephen Curry");
    expect(data.stats["3P%"].entries[0].name).toBe("Steve Kerr");
  });

  it("counts games like B-Ref: LeBron 1,622, then Robert Parish 1,611", () => {
    expect(value("G", "jamesle01")).toBe(1622);
    expect(rank("G", "parisro01")).toBe(2);
    expect(value("G", "parisro01")).toBe(1611);
  });

  it("combines ABA and NBA careers: Julius Erving is top 10 in points", () => {
    expect(value("PTS", "ervinju01")).toBe(30026);
    expect(rank("PTS", "ervinju01")).toBe(9);
  });

  it("counts steals and blocks only from 1973-74, so Bill Russell has none", () => {
    expect(rank("BLK", "russebi01")).toBeUndefined();
    expect(rank("STL", "chambwi01")).toBeUndefined();
    expect(data.stats.BLK.qualifier).toBe("Tracked since 1973–74");
  });

  it("applies the per-game and shooting minimums", () => {
    expect(data.stats.PPG.qualifier).toMatch(/400 games or 10,000 points/);
    expect(data.stats["FG%"].qualifier).toBe("Minimum 2,000 field goals made");
  });

  it("keeps ranks to 300, with competition ranking", () => {
    for (const s of Object.values(data.stats)) {
      expect(s.entries.length).toBeGreaterThanOrEqual(300);
      expect(s.entries.at(-1)!.rank).toBeLessThanOrEqual(300);
      for (let i = 1; i < s.entries.length; i++) {
        const [a, b] = [s.entries[i - 1], s.entries[i]];
        expect(b.value).toBeLessThanOrEqual(a.value);
        // Competition ranking (1, 2, 2, 4), and a shared rank means the same value.
        expect(b.rank === a.rank || b.rank === i + 1).toBe(true);
        if (b.rank === a.rank) expect(b.value).toBe(a.value);
      }
    }
  });
});

describe("NBA formatting", () => {
  it("shows per-game averages with the leading zero and shooting B-Ref style", () => {
    expect(formatValue(0.94, "average", 1)).toBe("0.9");
    expect(formatValue(30.12, "average", 1)).toBe("30.1");
    expect(formatValue(2.711, "average", 2)).toBe("2.71");
    expect(formatValue(0.6734, "rate", 3)).toBe(".673");
  });
  it("labels seasons by both years", () => {
    expect(seasonLabel("nba", 1996)).toBe("1995–96");
    expect(seasonLabel("nba", 2000)).toBe("1999–00");
    expect(seasonLabel("mlb", 1996)).toBe("1996");
  });
});

describe("NBA Golf rounds", () => {
  const all = dates(730);
  it("picks three stats: never three from one group, never two of one family", () => {
    for (const date of all) {
      const round = generateRound(data, date, "nba");
      expect(round.holes).toHaveLength(3);
      expect(new Set(round.holes.map((h) => h.group)).size).toBeGreaterThan(1);
      const families = round.holes.map((h) => data.stats[h.statKey].family);
      expect(new Set(families).size).toBe(3);
      for (const h of round.holes) {
        expect(eligibleTargetRanks(data, h.statKey)).toContain(h.targetRank);
        expect(h.targetRank).toBeLessThanOrEqual(MAX_TARGET_RANK);
        const tied = data.stats[h.statKey].entries.filter((e) => e.rank === h.targetRank);
        expect(tied.length).toBeGreaterThan(0);
        expect(tied.length).toBeLessThanOrEqual(MAX_TIE_SIZE);
      }
    }
  });
  it("differs from baseball's seed", () => {
    expect(namespaced("nba", "baseball-golf:2026-11-15")).toBe("nba:baseball-golf:2026-11-15");
    expect(namespaced("mlb", "baseball-golf:2026-11-15")).toBe("baseball-golf:2026-11-15");
  });
  it("names the game Basketball Golf in share text", () => {
    const text = buildShareText({ date: "2026-11-15", scores: [0, 4, 30], url: "https://x/nba/golf", sport: "nba" });
    expect(text.split("\n")[0]).toBe("Basketball Golf #15 · Nov 15, 2026");
    const player = buildShareText({ date: "2026-11-15", scores: [0, 4, 30], url: "u", sport: "nba", mode: "player" });
    expect(player.split("\n")[0]).toBe("Basketball Golf · Player #15 · Nov 15, 2026");
  });
});

describe("NBA Player mode rounds", () => {
  it("picks three different stats and players, each with years and a position", () => {
    for (const date of dates(365)) {
      const holes = generateStoredPlayerRound(data, meta, date, "nba");
      expect(new Set(holes.map((h) => h.statKey)).size).toBe(3);
      expect(new Set(holes.map((h) => h.playerId)).size).toBe(3);
      expect(new Set(holes.map((h) => data.stats[h.statKey].family)).size).toBe(3);
      for (const h of holes) {
        expect(meta[h.playerId]).toBeDefined();
        expect(rank(h.statKey, h.playerId)).toBeLessThanOrEqual(MAX_TARGET_RANK);
      }
    }
  });
});

describe("NBA Stats Ranker rounds", () => {
  it("picks five players with distinct values, one from each fifth of the top 100", () => {
    for (const date of dates(365)) {
      const stored = generateStoredRankRound(data, date, "nba");
      expect(stored.playerIds).toHaveLength(5);
      const ranks = stored.playerIds.map((id) => rank(stored.statKey, id)!).sort((a, b) => a - b);
      ranks.forEach((r, i) => expect(Math.ceil(r / 20)).toBe(i + 1));
      const round = rankRoundFromStored(data, date, stored);
      const reveal = scoreRankOrder(data, round, round.players.map((p) => p.id));
      const perfect = scoreRankOrder(data, round, reveal.answer.map((a) => a.id));
      expect(perfect.score).toBe(0);
    }
  });
  it("titles share text Stats Ranker · NBA", () => {
    const date = "2026-11-15";
    const round = rankRoundFromStored(data, date, generateStoredRankRound(data, date, "nba"));
    const reveal = scoreRankOrder(data, round, round.players.map((p) => p.id));
    expect(buildRankShareText(round, reveal, "u", "nba").split("\n")[0]).toBe("Stats Ranker · NBA #15 · Nov 15, 2026");
  });
});

describe("NBA Roster Reveal", () => {
  it("has every BAA/NBA/ABA team-season through 2025-26 with eight players", () => {
    const LINEUP_SIZE = lineupSize("nba");
    expect(LINEUP_SIZE).toBe(8);
    expect(nbaRosterData.firstYear).toBe(1947);
    expect(nbaRosterData.lastYear).toBe(2026);
    expect(nbaRosterData.rounds.length).toBeGreaterThan(1800);
    for (const r of nbaRosterData.rounds) {
      expect(r.lineup).toHaveLength(LINEUP_SIZE);
      expect(new Set(r.lineup.map((p) => p.id)).size).toBe(LINEUP_SIZE);
      expect(nbaRosterData.yearTeams[String(r.year)].some(([f]) => f === r.franchise)).toBe(true);
    }
  });
  it("orders the 1995-96 Bulls obscure to famous, ending with Jordan", () => {
    const bulls = nbaRosterData.rounds.find((r) => r.year === 1996 && r.franchise === "CHI")!;
    expect(bulls.record).toBe("72–10");
    expect(bulls.lineup.at(-1)!.name).toBe("Michael Jordan");
    expect(bulls.lineup.map((p) => p.name)).toEqual(expect.arrayContaining(["Scottie Pippen", "Dennis Rodman"]));
  });
  it("labels ABA teams in the picker", () => {
    expect(nbaRosterData.yearTeams["1975"]).toContainEqual(["KEN", "Kentucky Colonels (ABA)"]);
    expect(nbaRosterData.yearTeams["1975"]).toContainEqual(["BOS", "Boston Celtics"]);
  });
  it("walks a shuffle that doesn't repeat for years", () => {
    const seen = new Set<string>();
    for (const date of dates(1000)) {
      const r = generateStoredRosterRound(nbaRosterData, date, "nba");
      const key = `${r.year}-${r.franchise}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      findTeamSeason(nbaRosterData, r);
    }
  });
  it("says Air ball on a miss", () => {
    const date = "2026-11-15";
    const ts = findTeamSeason(nbaRosterData, generateStoredRosterRound(nbaRosterData, date, "nba"));
    const round = publicRound(nbaRosterData, ts, date);
    const wrong = round.teams.find(([f]) => f !== ts.franchise)![0];
    const text = buildRosterShareText(round, rosterState(ts, 3, wrong), "u", "nba");
    expect(text.split("\n")[0]).toBe("Roster Reveal · NBA #15 · Nov 15, 2026");
    expect(text).toContain("Air ball");
  });
});

describe("sport helpers", () => {
  it("keeps baseball's tables and URLs, prefixes NBA's", () => {
    expect(table("mlb", "plays")).toBe("plays");
    expect(table("nba", "roster_plays")).toBe("nba_roster_plays");
    expect(apiUrl("mlb", "/api/play", { date: "2026-11-15" })).toBe("/api/play?date=2026-11-15");
    expect(apiUrl("nba", "/api/play", { date: "2026-11-15" })).toBe("/api/play?date=2026-11-15&sport=nba");
  });
  it("parses the sport of a request", () => {
    expect(parseSport(undefined)).toBe("mlb");
    expect(parseSport(null)).toBe("mlb");
    expect(parseSport("nba")).toBe("nba");
    expect(parseSport("nfl")).toBeNull();
  });
});

describe("NBA Roster Reveal lineup size", () => {
  it("allows 1–8 reveals and scores a miss as 9", async () => {
    const { isValidRevealed, rosterResult } = await import("./roster");
    expect(isValidRevealed(8, "nba")).toBe(true);
    expect(isValidRevealed(9, "nba")).toBe(false);
    expect(isValidRevealed(10, "mlb")).toBe(true);
    expect(rosterResult(3, false, "nba")).toBe(9);
    expect(rosterResult(3, false)).toBe(11);
  });
});

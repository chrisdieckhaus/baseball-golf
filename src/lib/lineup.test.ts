import totalsFile from "@/data/number.json";
import { describe, expect, it } from "vitest";
import {
  buildLineupShareText,
  lineupBucket,
  LINEUP_SPOTS,
  LINEUP_STAT_KEYS,
  percentOfBest,
  validateLineupPicks,
  type LineupState,
} from "./lineup";
import {
  bestLineup,
  careerTotal,
  fitsSpot,
  generateLineupRound,
  lineupStatFor,
  MIN_SPOT_POOL,
  toPick,
} from "./lineup-data";


const candidateIds = Object.keys((totalsFile as unknown as { totals: Record<string, Record<string, number>> }).totals.H);
const dateAt = (i: number) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);

describe("Lineup Card rounds", () => {
  it("cycles the seven batting stats, never the same two days running", () => {
    let prev = "";
    for (let i = 0; i < 200; i++) {
      const s = lineupStatFor(dateAt(i));
      expect(LINEUP_STAT_KEYS).toContain(s);
      expect(s).not.toBe(prev);
      prev = s;
    }
    expect(new Set(Array.from({ length: 7 }, (_, i) => lineupStatFor(dateAt(i)))).size).toBe(7);
  });

  it("gives every spot a distinct rule with a big enough pool", () => {
    for (let i = 0; i < 30; i++) {
      const r = generateLineupRound(dateAt(i));
      expect(r.rules).toHaveLength(9);
      expect(new Set(r.rules.map((x) => `${x.kind}:${x.key}`)).size).toBe(9);
      expect(r.rules.some((x) => x.key === "CY")).toBe(false);
    }
  });

  it("is the same every time for a date", () => {
    expect(generateLineupRound("2026-11-28")).toEqual(generateLineupRound("2026-11-28"));
  });
});

describe("fitting a spot", () => {
  it("needs the position and the rule", () => {
    expect(fitsSpot("jeterde01", 4, { kind: "team", key: "NYY" })).toBe(true); // SS, Yankees
    expect(fitsSpot("jeterde01", 0, { kind: "team", key: "NYY" })).toBe(false); // never caught
    expect(fitsSpot("ortizda01", 8, { kind: "team", key: "BOS" })).toBe(true); // DH, Red Sox
    expect(fitsSpot("bondsba01", 5, { kind: "award", key: "MVP" })).toBe(true); // LF, MVP
  });
});

describe("the best lineup", () => {
  it("beats or ties a greedy fill and uses nobody twice", () => {
    for (let i = 0; i < 15; i++) {
      const r = generateLineupRound(dateAt(i));
      const best = bestLineup(r);
      expect(new Set(best.picks.map((p) => p.id)).size).toBe(9);
      best.picks.forEach((p, s) => {
        expect(fitsSpot(p.id, s, r.rules[s])).toBe(true);
        expect(p.value).toBe(careerTotal(r.statKey, p.id));
      });
      expect(best.total).toBe(best.picks.reduce((a, p) => a + p.value, 0));
      expect(best.total).toBeGreaterThan(0);
    }
  });

  it("is never beaten by greedy fills", () => {
    for (let i = 0; i < 15; i++) {
      const r = generateLineupRound(dateAt(i));
      const best = bestLineup(r).total;
      const greedy = (order: number[]) => {
        const used = new Set<string>();
        let sum = 0;
        for (const s of order) {
          let pick: { id: string; v: number } | null = null;
          for (const id of candidateIds) {
            if (used.has(id) || !fitsSpot(id, s, r.rules[s])) continue;
            const v = careerTotal(r.statKey, id);
            if (!pick || v > pick.v) pick = { id, v };
          }
          if (pick) {
            used.add(pick.id);
            sum += pick.v;
          }
        }
        return sum;
      };
      expect(best).toBeGreaterThanOrEqual(greedy([0, 1, 2, 3, 4, 5, 6, 7, 8]));
      expect(best).toBeGreaterThanOrEqual(greedy([8, 7, 6, 5, 4, 3, 2, 1, 0]));
    }
  });
});

describe("validating picks", () => {
  const check = { known: () => true, fits: (_id: string, spot: number) => spot !== 3 };
  it("accepts any order, one per spot", () => {
    expect(validateLineupPicks([{ id: "a", spot: 8 }, { id: "b", spot: 0 }], [], check)).toEqual({
      picks: [{ id: "a", spot: 8 }, { id: "b", spot: 0 }],
    });
  });
  it("rejects repeats, filled spots, misfits and changes", () => {
    expect(validateLineupPicks([{ id: "a", spot: 1 }, { id: "a", spot: 2 }], [], check)).toHaveProperty("error");
    expect(validateLineupPicks([{ id: "a", spot: 1 }, { id: "b", spot: 1 }], [], check)).toHaveProperty("error");
    expect(validateLineupPicks([{ id: "a", spot: 3 }], [], check)).toHaveProperty("error");
    expect(validateLineupPicks([{ id: "b", spot: 1 }], [{ id: "a", spot: 1 }], check)).toHaveProperty("error");
  });
});

describe("scoring and sharing", () => {
  it("only says 100% for a perfect lineup", () => {
    expect(percentOfBest(999, 1000)).toBe(99);
    expect(percentOfBest(1000, 1000)).toBe(100);
    expect(percentOfBest(455, 1000)).toBe(45);
    expect(lineupBucket(100)).toBe(0);
    expect(lineupBucket(95)).toBe(1);
    expect(lineupBucket(51)).toBe(5);
    expect(lineupBucket(12)).toBe(6);
  });

  it("shares squares and the total, no names", () => {
    const r = generateLineupRound("2026-11-28");
    const best = bestLineup(r);
    const picks = best.picks.map((p, i) => (i === 2 ? { ...p, value: Math.floor(p.value / 3) } : p));
    const total = picks.reduce((a, p) => a + p.value, 0);
    const state: LineupState = { picks, total, done: true, best, percent: percentOfBest(total, best.total) };
    const round = {
      date: "2026-11-28",
      statKey: r.statKey,
      label: "x",
      short: "HR",
      rules: r.rules.map((x) => ({ ...x, label: "" })),
    };
    const text = buildLineupShareText(round, state, "https://dailydugout.com/lineup");
    const lines = text.split("\n");
    expect(lines[0]).toBe("Lineup Card #28 · Nov 28, 2026");
    expect(lines[1]).toBe("🟩🟩⬜🟩🟩🟩🟩🟩🟩");
    expect(text).not.toContain(best.picks[0].name);
    expect(LINEUP_SPOTS).toHaveLength(9);
    expect(toPick(r.statKey, best.picks[0].id, 0).name).toBe(best.picks[0].name);
    expect(MIN_SPOT_POOL).toBeGreaterThan(9);
  });
});

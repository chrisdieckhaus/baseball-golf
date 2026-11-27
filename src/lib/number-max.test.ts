import { describe, expect, it } from "vitest";
import { publicNumberRound } from "./number";
import { bestMax, careerRank, maxState, validateMaxPicks } from "./number-data";
import { bestThree, buildMaxShareText, maxBucket, maxSquare, percentOfBest } from "./number-max";
import { newNumberRound } from "./number-rounds";
import { fitsSlot, slotLabel } from "./number-slots";

const dateAt = (i: number) => new Date(Date.UTC(2026, 10, 21 + i)).toISOString().slice(0, 10);

describe("bestThree", () => {
  it("doesn't spend one player on two slots, and finds the better split", () => {
    // A fits slots 0 and 1; B only slot 0; C only slot 1; D only slot 2.
    const players = [
      { id: "A", value: 100, fit: 0b011 },
      { id: "B", value: 90, fit: 0b001 },
      { id: "C", value: 10, fit: 0b010 },
      { id: "D", value: 5, fit: 0b100 },
    ];
    const best = bestThree(players);
    expect(best.total).toBe(195); // B + A + D beats A + C + D (115)
    expect(best.picks.map((p) => p?.id)).toEqual(["B", "A", "D"]);
  });
});

describe("the bonus round on real rounds", () => {
  it("has a best three that fits every slot, for both sports", () => {
    for (const sport of ["mlb", "nba"] as const) {
      for (let i = 0; i < 10; i++) {
        const date = dateAt(i);
        const stored = newNumberRound(date, sport);
        const round = publicNumberRound(date, stored, (r) => slotLabel(r, sport), sport);
        const best = bestMax(round);
        expect(new Set(best.picks.map((p) => p.id)).size).toBe(3);
        best.picks.forEach((p, s) => expect(fitsSlot(p.id, round.slots![s], sport)).toBe(true));
        expect(best.total).toBeGreaterThan(round.target / 3);
        // Playing the best three scores 100%.
        const state = maxState(round, best.picks.map((p, s) => ({ id: p.id, slot: s })));
        expect(state.done).toBe(true);
        expect(state.percent).toBe(100);
      }
    }
  });

  it("checks picks like the main round", () => {
    const date = "2026-11-27";
    const round = publicNumberRound(date, newNumberRound(date), (r) => slotLabel(r));
    const best = bestMax(round);
    const ok = validateMaxPicks(round, [{ id: best.picks[2].id, slot: 2 }], []);
    expect(ok).toEqual({ picks: [{ id: best.picks[2].id, slot: 2 }] });
    expect(validateMaxPicks(round, [{ id: "nobody00", slot: 0 }], [])).toHaveProperty("error");
    expect(
      validateMaxPicks(round, [{ id: best.picks[0].id, slot: 0 }, { id: best.picks[0].id, slot: 1 }], []),
    ).toHaveProperty("error");
    const noSlots = { ...round, slots: null };
    expect(validateMaxPicks(noSlots, [{ id: best.picks[0].id, slot: 0 }], [])).toHaveProperty("error");
  });
});

describe("scoring and sharing", () => {
  it("only says 100% when the max is matched", () => {
    expect(percentOfBest(999, 1000)).toBe(99);
    expect(percentOfBest(1000, 1000)).toBe(100);
    expect(maxBucket(100)).toBe(0);
    expect(maxBucket(91)).toBe(1);
    expect(maxBucket(10)).toBe(6);
    expect(maxSquare(10, 10)).toBe("🟩");
    expect(maxSquare(5, 10)).toBe("🟨");
    expect(maxSquare(4, 10)).toBe("⬜");
  });

  it("shares squares and the total, no names", () => {
    const date = "2026-11-27";
    const round = publicNumberRound(date, newNumberRound(date), (r) => slotLabel(r));
    const best = bestMax(round);
    const picks = best.picks.map((p, s) => ({ id: p.id, slot: s }));
    const state = maxState(round, picks);
    const text = buildMaxShareText(round, state, "https://dailydugout.com/number");
    const lines = text.split("\n");
    expect(lines[0]).toBe("Hit the Number #27 · Max · Nov 27, 2026");
    expect(lines[1]).toBe("🟩🟩🟩");
    expect(lines[2]).toContain("Maxed out!");
    for (const p of best.picks) expect(text).not.toContain(p.name);
  });
});

describe("all-time ranks", () => {
  it("ranks career totals, ties sharing a rank", () => {
    expect(careerRank("HR", 762)).toEqual({ rank: 1, tied: false }); // Bonds
    expect(careerRank("HR", 755)).toEqual({ rank: 2, tied: false }); // Aaron
    expect(careerRank("HR", 0)).toBeNull();
    expect(careerRank("PTS", 38387, "nba")?.rank).toBe(2); // Kareem, behind LeBron
    // Any total shared by several players is a tie, and the next total down ranks below all of them.
    const t = careerRank("HR", 1);
    expect(t?.tied).toBe(true);
  });

  it("comes back on bonus-round picks", () => {
    const round = publicNumberRound("2026-11-27", newNumberRound("2026-11-27"), (r) => slotLabel(r));
    const best = bestMax(round);
    const state = maxState(round, [{ id: best.picks[0].id, slot: 0 }]);
    expect(state.picks[0].rank).toBe(careerRank(round.statKey, state.picks[0].value)!.rank);
  });
});

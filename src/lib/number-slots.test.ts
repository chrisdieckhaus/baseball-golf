import { describe, expect, it } from "vitest";
import raw from "@/data/number.json";
import { findSlotBullseyes, generateNumberRound, NUMBER_SLOTS_FROM, numberStat } from "./number";
import { newNumberRound } from "./number-rounds";
import { fitsSlot, generateNumberSlots, MIN_SLOT_POOL, ruleWeight, slotLabel, slotPlayers } from "./number-slots";

const totals = (raw as unknown as { totals: Record<string, Record<string, number>> }).totals;
const dateAt = (i: number) => new Date(Date.UTC(2026, 10, 21 + i)).toISOString().slice(0, 10);

describe("Hit the Number slot rules", () => {
  it("knows who fits what (any appearance counts, teams are franchises)", () => {
    // Jeff Bagwell: 1990s Astros first baseman, Hall of Famer, All-Star, Rookie of the Year
    for (const rule of [
      { kind: "decade", key: "1990" },
      { kind: "team", key: "HOU" },
      { kind: "league", key: "NL" },
      { kind: "position", key: "1B" },
      { kind: "award", key: "HOF" },
      { kind: "award", key: "AS" },
      { kind: "award", key: "ROY" },
    ] as const)
      expect(fitsSlot("bagweje01", rule), rule.key).toBe(true);
    expect(fitsSlot("bagweje01", { kind: "team", key: "NYY" })).toBe(false);
    expect(fitsSlot("bagweje01", { kind: "decade", key: "2010" })).toBe(false);
    expect(fitsSlot("bagweje01", { kind: "league", key: "AL" })).toBe(false);
    // Babe Ruth pitched for the Red Sox and played first base now and then
    expect(fitsSlot("ruthba01", { kind: "team", key: "BOS" })).toBe(true);
    expect(fitsSlot("ruthba01", { kind: "position", key: "1B" })).toBe(true);
    // Jackie Robinson's Brooklyn Dodgers count as Dodgers
    expect(fitsSlot("robinja02", { kind: "team", key: "LAD" })).toBe(true);
    expect(fitsSlot("nobody", { kind: "award", key: "HOF" })).toBe(false);
  });

  it("leans decade rules toward recent decades", () => {
    expect(ruleWeight({ kind: "decade", key: "2020" })).toBe(1);
    expect(ruleWeight({ kind: "decade", key: "1970" })).toBeCloseTo(0.25);
    expect(ruleWeight({ kind: "decade", key: "1910" })).toBeLessThan(0.05);
    expect(ruleWeight({ kind: "team", key: "HOU" })).toBe(1);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const date = dateAt(i);
      const { statKey, target } = generateNumberRound(date);
      for (const r of generateNumberSlots(date, statKey, target)!) if (r.kind === "decade") counts[r.key] = (counts[r.key] ?? 0) + 1;
    }
    const recent = (counts["2000"] ?? 0) + (counts["2010"] ?? 0) + (counts["2020"] ?? 0);
    const early = (counts["1900"] ?? 0) + (counts["1910"] ?? 0) + (counts["1920"] ?? 0);
    expect(recent).toBeGreaterThan(early * 5);
  });

  it("labels rules", () => {
    expect(slotLabel({ kind: "decade", key: "1990" })).toBe("Played in the 1990s");
    expect(slotLabel({ kind: "team", key: "HOU" })).toBe("Played for the Astros");
    expect(slotLabel({ kind: "team", key: "BOS" })).toBe("Played for the Red Sox");
    expect(slotLabel({ kind: "league", key: "AL" })).toBe("Played in the AL");
    expect(slotLabel({ kind: "position", key: "1B" })).toBe("Played first base");
    expect(slotLabel({ kind: "award", key: "ROY" })).toBe("Rookie of the Year");
    expect(slotLabel({ kind: "award", key: "CY" })).toBe("Won a Cy Young");
  });

  it("knows MVPs, Cy Youngs and Gold Gloves", () => {
    expect(fitsSlot("bagweje01", { kind: "award", key: "MVP" })).toBe(true);
    expect(fitsSlot("bagweje01", { kind: "award", key: "GG" })).toBe(true);
    expect(fitsSlot("bagweje01", { kind: "award", key: "CY" })).toBe(false);
    expect(fitsSlot("maddugr01", { kind: "award", key: "CY" })).toBe(true);
    expect(fitsSlot("maddugr01", { kind: "award", key: "GG" })).toBe(true);
    expect(fitsSlot("jeterde01", { kind: "award", key: "MVP" })).toBe(false);
  });

  it("gives new rounds three rules of different kinds that have deep pools and a real bullseye", () => {
    for (let i = 0; i < 120; i++) {
      const date = dateAt(i);
      const { statKey, target } = generateNumberRound(date);
      const rules = generateNumberSlots(date, statKey, target);
      expect(rules, date).not.toBeNull();
      expect(new Set(rules!.map((r) => r.kind)).size).toBe(3);
      if (rules!.some((r) => r.key === "CY")) expect(numberStat(statKey)!.group).toBe("Pitching");
      expect(generateNumberSlots(date, statKey, target)).toEqual(rules); // same for everyone
      const players = slotPlayers(statKey, rules!);
      for (let s = 0; s < 3; s++) {
        const pool = players.filter((p) => p.fit & (1 << s) && (totals[statKey]?.[p.id] ?? 0) > 0).length;
        expect(pool).toBeGreaterThanOrEqual(MIN_SLOT_POOL);
      }
      expect(findSlotBullseyes(players, target, { minValue: 1 }).count).toBeGreaterThan(0);
    }
  });

  it("starts on NUMBER_SLOTS_FROM, without changing the stat or target", () => {
    expect(newNumberRound("2026-11-20").slots).toBeNull();
    const r = newNumberRound(NUMBER_SLOTS_FROM);
    expect(r.slots).toHaveLength(3);
    expect({ statKey: r.statKey, target: r.target }).toEqual(generateNumberRound(NUMBER_SLOTS_FROM));
  });
});

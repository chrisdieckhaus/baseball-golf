// NBA Hit the Number: rounds, slot rules and share text.
import { describe, expect, it } from "vitest";
import nbaRaw from "@/data/nba/number.json";
import {
  buildNumberShareText,
  findSlotBullseyes,
  generateNumberRound,
  NBA_NUMBER_STATS,
  numberSlotsOn,
  numberStat,
  publicNumberRound,
  targetsFor,
} from "./number";
import { newNumberRound } from "./number-rounds";
import { fitsSlot, MIN_SLOT_POOL, slotLabel, slotPlayers } from "./number-slots";

const dateAt = (i: number) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
const totals = (nbaRaw as unknown as { totals: Record<string, Record<string, number>> }).totals;

describe("NBA Hit the Number rounds", () => {
  it("uses NBA stats with targets in range, and never the same stat two days running", () => {
    let prev = "";
    for (let i = 0; i < 300; i++) {
      const r = generateNumberRound(dateAt(i), "nba");
      const stat = numberStat(r.statKey, "nba")!;
      expect(stat).toBeDefined();
      expect(targetsFor(stat)).toContain(r.target);
      expect(r.statKey).not.toBe(prev);
      prev = r.statKey;
    }
  });

  it("uses every NBA stat once per cycle", () => {
    const n = NBA_NUMBER_STATS.length;
    const keys = Array.from({ length: n }, (_, i) => generateNumberRound(dateAt(i), "nba").statKey);
    expect(new Set(keys).size).toBe(n);
  });

  it("doesn't change baseball's rounds", () => {
    expect(numberStat("PTS")).toBeUndefined();
    expect(numberStat("HR", "nba")).toBeUndefined();
    expect(generateNumberRound("2026-11-15")).toEqual(generateNumberRound("2026-11-15", "mlb"));
  });

  it("has slot rules on every round, each with a real pool and at least one bullseye", () => {
    expect(numberSlotsOn("2026-11-01", "nba")).toBe(true);
    for (let i = 0; i < 40; i++) {
      const date = dateAt(i);
      const r = newNumberRound(date, "nba");
      expect(r.slots, date).not.toBeNull();
      const slots = r.slots!;
      expect(new Set(slots.map((s) => s.kind)).size).toBe(3);
      const players = slotPlayers(r.statKey, slots, "nba");
      for (let s = 0; s < 3; s++) {
        expect(players.filter((p) => p.value > 0 && p.fit & (1 << s)).length).toBeGreaterThanOrEqual(MIN_SLOT_POOL);
      }
      expect(findSlotBullseyes(players, r.target, { minValue: 1, wantExample: false, stopAtFirst: true }).count).toBeGreaterThan(0);
    }
  });

  it("labels NBA rules", () => {
    expect(slotLabel({ kind: "team", key: "OKC" }, "nba")).toBe("Played for the Thunder");
    expect(slotLabel({ kind: "position", key: "C" }, "nba")).toBe("Played center");
    expect(slotLabel({ kind: "award", key: "SMOY" }, "nba")).toBe("Sixth Man of the Year");
    expect(slotLabel({ kind: "decade", key: "1990" }, "nba")).toBe("Played in the 1990s");
  });

  it("counts franchises' old names and the ABA years", () => {
    expect(fitsSlot("duranke01", { kind: "team", key: "OKC" }, "nba")).toBe(true); // Seattle SuperSonics
    expect(fitsSlot("ervinju01", { kind: "team", key: "BRK" }, "nba")).toBe(true); // New York Nets (ABA)
    expect(fitsSlot("jamesle01", { kind: "team", key: "BOS" }, "nba")).toBe(false);
    expect(fitsSlot("abdulka01", { kind: "award", key: "MVP" }, "nba")).toBe(true);
    expect(fitsSlot("curryst01", { kind: "position", key: "G" }, "nba")).toBe(true);
  });

  it("has career totals", () => {
    expect(totals.PTS.abdulka01).toBe(38387);
    expect(totals.TRB.chambwi01).toBe(23924);
    expect(totals.AST.stockjo01).toBe(15806);
  });

  it("titles the share text as NBA", () => {
    const round = publicNumberRound("2026-11-15", { statKey: "PTS", target: 50000 }, undefined, "nba");
    const text = buildNumberShareText(
      round,
      { picks: [], total: 49500, done: true, bust: false, score: 500, bullseyes: null },
      "https://dailydugout.com/nba/number",
    );
    expect(text.split("\n")[0]).toBe("Hit the Number · NBA #15 · Nov 15, 2026");
    expect(text.split("\n")[1]).toBe("49,500 / 50,000 points 🎯");
  });
});

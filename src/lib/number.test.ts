import { describe, expect, it } from "vitest";
import raw from "@/data/number.json";
import index from "../../public/players.json";
import {
  buildNumberShareText,
  findBullseyes,
  findSlotBullseyes,
  generateNumberRound,
  NUMBER_BUCKETS,
  NUMBER_STATS,
  numberBucket,
  numberBucketLimits,
  numberRoundNumber,
  numberStat,
  publicNumberRound,
  scorePicks,
  targetsFor,
  validatePicks,
} from "./number";

const dateAt = (i: number) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
const totals = (raw as unknown as { totals: Record<string, Record<string, number>> }).totals;
const ids = new Set((index as unknown as { players: { id: string }[] }).players.map((p) => p.id));

describe("Hit the Number rounds", () => {
  it("numbers rounds from Nov 1, 2026", () => {
    expect(numberRoundNumber("2026-11-01")).toBe(1);
    expect(numberRoundNumber("2026-11-15")).toBe(15);
  });

  it("is the same for everyone on a date, with a known stat and a target in its range", () => {
    for (let i = 0; i < 400; i++) {
      const r = generateNumberRound(dateAt(i));
      expect(generateNumberRound(dateAt(i))).toEqual(r);
      const stat = numberStat(r.statKey)!;
      expect(targetsFor(stat)).toContain(r.target);
    }
  });

  it("uses every stat once per ten days and never the same stat two days running", () => {
    const keys = Array.from({ length: 3650 }, (_, i) => generateNumberRound(dateAt(i)).statKey);
    for (let c = 0; c < 365; c++) {
      expect(new Set(keys.slice(c * 10, c * 10 + 10)).size).toBe(NUMBER_STATS.length);
    }
    for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
  });

  it("doesn't repeat a stat and target within a year", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 3650; i++) {
      const r = generateNumberRound(dateAt(i));
      const k = `${r.statKey}:${r.target}`;
      if (seen.has(k)) expect(i - seen.get(k)!).toBeGreaterThan(365);
      seen.set(k, i);
    }
  });

  it("has career totals for every stat, only for known players", () => {
    for (const s of NUMBER_STATS) {
      const t = totals[s.key];
      expect(Object.keys(t).length).toBeGreaterThan(1000);
      for (const id of Object.keys(t)) expect(ids.has(id)).toBe(true);
    }
    expect(totals.HR.bondsba01).toBe(762);
    expect(totals.SV.riverma01).toBe(652);
  });
});

describe("scoring", () => {
  const p = (id: string, value: number) => ({ id, name: id, years: "", value });

  it("scores the distance under the target once three players are picked", () => {
    expect(scorePicks(900, [p("a", 500), p("b", 300)])).toMatchObject({ total: 800, done: false, score: null });
    expect(scorePicks(900, [p("a", 500), p("b", 300), p("c", 75)])).toMatchObject({ done: true, bust: false, score: 25 });
    expect(scorePicks(900, [p("a", 500), p("b", 300), p("c", 100)])).toMatchObject({ score: 0 });
  });

  it("ends the round as a bust as soon as the total goes over", () => {
    expect(scorePicks(100, [p("a", 762)])).toMatchObject({ done: true, bust: true, score: null });
    expect(scorePicks(900, [p("a", 500), p("b", 401)])).toMatchObject({ done: true, bust: true });
  });

  it("validates picks", () => {
    const value = (id: string) => ({ a: 500, b: 450, c: 10, z: 0 })[id];
    expect(validatePicks(["a", "c"], 900, value)).toEqual({
      ok: true,
      picks: [
        { id: "a", slot: null },
        { id: "c", slot: null },
      ],
    });
    expect(validatePicks(["z"], 900, value).ok).toBe(true); // a 0 is a legal pick
    expect(validatePicks([], 900, value).ok).toBe(false);
    expect(validatePicks(["a", "b", "c", "z"], 900, value).ok).toBe(false);
    expect(validatePicks(["a", "a"], 900, value).ok).toBe(false);
    expect(validatePicks(["a", "nobody"], 900, value).ok).toBe(false);
    expect(validatePicks(["a", "b", "c"], 900, value).ok).toBe(false); // nothing after a bust
    expect(validatePicks("a", 900, value).ok).toBe(false);
  });

  it("validates picks on a round with slots", () => {
    const value = (id: string) => ({ a: 500, b: 450, c: 10 })[id];
    // a fits slot 0, b fits slots 1 and 2, c fits only slot 2
    const fitsMap: Record<string, number[]> = { a: [0], b: [1, 2], c: [2] };
    const slots = { fits: (id: string, slot: number) => fitsMap[id].includes(slot), slotLabel: (i: number) => `Rule ${i}` };
    expect(validatePicks([{ id: "c", slot: 2 }, { id: "a", slot: 0 }], 900, value, slots)).toEqual({
      ok: true,
      picks: [
        { id: "c", slot: 2 },
        { id: "a", slot: 0 },
      ],
    });
    expect(validatePicks([{ id: "a", slot: 1 }], 900, value, slots)).toEqual({ ok: false, error: "He doesn't fit “Rule 1.”" });
    expect(validatePicks(["a"], 900, value, slots).ok).toBe(false); // no slot
    expect(validatePicks([{ id: "a", slot: 3 }], 900, value, slots).ok).toBe(false);
    expect(validatePicks([{ id: "b", slot: 2 }, { id: "c", slot: 2 }], 900, value, slots).ok).toBe(false); // slot taken
  });
});

describe("findSlotBullseyes", () => {
  it("counts ways to fill the three slots with different players, matching brute force", () => {
    // value, slots fitted (bit mask)
    const raw: [number, number][] = [
      [0, 7], [5, 1], [5, 3], [5, 7], [5, 4], [10, 2], [10, 6], [15, 7], [15, 1], [20, 4], [30, 3], [30, 5], [45, 2], [10, 0],
    ];
    const players = raw.map(([value, fit], i) => ({ id: String(i), value, fit }));
    for (const target of [0, 10, 15, 20, 30, 45, 50, 60, 75, 200]) {
      for (const minValue of [0, 1]) {
        let brute = 0;
        for (const a of players)
          for (const b of players)
            for (const c of players) {
              if (a === b || a === c || b === c) continue;
              if (!(a.fit & 1 && b.fit & 2 && c.fit & 4)) continue;
              if (Math.min(a.value, b.value, c.value) < minValue) continue;
              if (a.value + b.value + c.value === target) brute++;
            }
        const { count, example } = findSlotBullseyes(players, target, { minValue });
        expect(count, `target ${target}, min ${minValue}`).toBe(brute);
        if (count) {
          expect(new Set(example!).size).toBe(3);
          example!.forEach((p, slot) => expect(p.fit & (1 << slot)).toBeTruthy());
          expect(example!.reduce((s, p) => s + p.value, 0)).toBe(target);
        } else expect(example).toBeNull();
      }
    }
  });
});

describe("findBullseyes", () => {
  it("counts combos of three different players, matching brute force", () => {
    const values = [0, 0, 5, 5, 5, 10, 10, 15, 20, 30, 30, 45];
    const players = values.map((value, i) => ({ id: String(i), value }));
    for (const target of [0, 10, 15, 30, 45, 60, 75, 200]) {
      let brute = 0;
      for (let i = 0; i < values.length; i++)
        for (let j = i + 1; j < values.length; j++)
          for (let k = j + 1; k < values.length; k++) if (values[i] + values[j] + values[k] === target) brute++;
      const { count, example } = findBullseyes(players, target);
      expect(count).toBe(brute);
      if (count) {
        expect(new Set(example!.map((p) => p.id)).size).toBe(3);
        expect(example!.reduce((s, p) => s + p.value, 0)).toBe(target);
      } else expect(example).toBeNull();
    }
  });

  it("shows the combo whose smallest total is largest", () => {
    const players = [70, 40, 30, 30, 10, 0].map((value, i) => ({ id: String(i), value }));
    expect(findBullseyes(players, 100).example!.map((p) => p.value)).toEqual([40, 30, 30]);
  });
});

describe("results chart and share text", () => {
  it("buckets results by how far off they were", () => {
    expect(numberBucketLimits(900)).toEqual([9, 45, 90, 225]);
    expect(numberBucketLimits(25)).toEqual([1, 2, 3, 7]);
    expect(numberBucket(0, false, 900)).toBe(0);
    expect(numberBucket(9, false, 900)).toBe(1);
    expect(numberBucket(10, false, 900)).toBe(2);
    expect(numberBucket(225, false, 900)).toBe(4);
    expect(numberBucket(226, false, 900)).toBe(5);
    expect(numberBucket(null, true, 900)).toBe(NUMBER_BUCKETS - 1);
  });

  it("shares the totals only", () => {
    const round = publicNumberRound("2026-11-15", { statKey: "HR", target: 900 });
    const p = (value: number) => ({ id: "x", name: "Secret Name", years: "", value });
    const done = { ...scorePicks(900, [p(500), p(300), p(75)]), bullseyes: null };
    expect(buildNumberShareText(round, done, "https://x/number")).toBe(
      "Hit the Number #15 · Nov 15, 2026\n875 / 900 HR 🎯\nhttps://x/number",
    );
    const bust = { ...scorePicks(1000, [p(762), p(755)]), bullseyes: null };
    expect(buildNumberShareText(publicNumberRound("2026-11-15", { statKey: "HR", target: 1000 }), bust, "u")).toContain(
      "1,517 / 1,000 HR 💥",
    );
  });
});

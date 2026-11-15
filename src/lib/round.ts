import type { Hole, LeaderboardData, Round } from "./types";
import { MAX_TARGET_RANK } from "./scoring";

export const HOLES_PER_ROUND = 3;
/** A target rank shared by more than this many players counts as a "large tie". */
export const MAX_TIE_SIZE = 3;
export const TIME_ZONE = "America/New_York";

/** Today's date (YYYY-MM-DD) in Eastern time; the round changes at midnight ET. */
export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** The first daily round (round #1). Earlier dates have no round. */
export const LAUNCH_DATE = "2026-11-01";

/** A daily round's number: #1 on LAUNCH_DATE, counting up one per day. */
export function roundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

/** A daily round exists for every date from launch through today (ET). Future rounds stay hidden. */
export function isPlayableDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= LAUNCH_DATE && date <= today;
}

/** Every daily-round date from launch through `today`, oldest first. */
export function playableDates(today: string = todayET()): string[] {
  const dates: string[] = [];
  const d = new Date(`${LAUNCH_DATE}T00:00:00Z`);
  for (let s = LAUNCH_DATE; s <= today; d.setUTCDate(d.getUTCDate() + 1), s = d.toISOString().slice(0, 10)) {
    dates.push(s);
  }
  return dates;
}

// FNV-1a string hash -> 32-bit seed
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: small deterministic PRNG so every player gets the same round
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ranks 1..MAX_TARGET_RANK that some player holds, shared by at most MAX_TIE_SIZE players. */
export function eligibleTargetRanks(data: LeaderboardData, statKey: string): number[] {
  const counts = new Map<number, number>();
  for (const e of data.stats[statKey].entries) {
    if (e.rank <= MAX_TARGET_RANK) counts.set(e.rank, (counts.get(e.rank) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n <= MAX_TIE_SIZE)
    .map(([rank]) => rank)
    .sort((a, b) => a - b);
}

/**
 * Deterministically generate a round. Daily rounds are generated once and then
 * stored (see rounds.ts), so changing this function or the data only affects
 * rounds that don't exist yet. The round is seeded by its date. Picks three
 * different stats (never all three from the same group) and a target rank for each.
 */
export function generateRound(data: LeaderboardData, date: string): Round {
  const rand = mulberry32(hashString(`baseball-golf:${date}`));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const allKeys = Object.keys(data.stats).sort();
  const holes: Hole[] = [];
  const used = new Set<string>();
  while (holes.length < HOLES_PER_ROUND) {
    const groupCounts = new Map<string, number>();
    for (const h of holes) groupCounts.set(h.group, (groupCounts.get(h.group) ?? 0) + 1);
    const candidates = allKeys.filter(
      (k) => !used.has(k) && (groupCounts.get(data.stats[k].group) ?? 0) < HOLES_PER_ROUND - 1,
    );
    const key = pick(candidates);
    used.add(key);
    const ranks = eligibleTargetRanks(data, key);
    if (ranks.length === 0) continue;
    const stat = data.stats[key];
    holes.push({
      statKey: key,
      label: stat.label,
      group: stat.group,
      qualifier: stat.qualifier,
      targetRank: pick(ranks),
    });
  }
  return { date, holes };
}

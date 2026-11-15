import type { LeaderboardEntry, StatKind } from "./types";

/** Maximum score for a single hole; also the score for an unranked guess. */
export const MAX_HOLE_SCORE = 100;

/**
 * Highest rank a new round can target. Rounds stored before Nov 15, 2026 can
 * target up to 150; they're scored with the same 100-per-hole cap.
 */
export const MAX_TARGET_RANK = 100;

/**
 * Score one hole: distance between the target rank and the guessed player's rank,
 * capped at MAX_HOLE_SCORE. An unranked guess (null) scores the maximum.
 */
export function scoreHole(targetRank: number, guessRank: number | null): number {
  if (guessRank === null) return MAX_HOLE_SCORE;
  return Math.min(Math.abs(targetRank - guessRank), MAX_HOLE_SCORE);
}

/**
 * Innings in baseball notation: thirds of an inning are written .1 and .2, so
 * 4710⅓ innings is "4,710.1" (not "4710.3").
 */
export function formatInnings(innings: number): string {
  let whole = Math.floor(innings);
  let thirds = Math.round((innings - whole) * 3);
  if (thirds === 3) {
    whole += 1;
    thirds = 0;
  }
  return `${whole.toLocaleString("en-US")}.${thirds}`;
}

export function formatValue(value: number, kind: StatKind, decimals: number): string {
  if (kind === "count") {
    // The only count stat with decimals is Innings Pitched (outs / 3).
    return decimals > 0 ? formatInnings(value) : Math.round(value).toLocaleString("en-US");
  }
  const s = value.toFixed(decimals);
  // Per-game averages keep the zero: 0.9 blocks a game, not .9
  if (kind === "average") return s;
  // Baseball convention: .366 rather than 0.366
  return s.startsWith("0.") ? s.slice(1) : s;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * The player(s) at a target rank. Usually the players who hold that rank. After a
 * data refresh, an old round's rank may no longer be held by anyone (two players
 * tied at 47th fill 47th and 48th). Then the tied group covering that position
 * is the target.
 */
export function targetPlayers(entries: LeaderboardEntry[], targetRank: number): LeaderboardEntry[] {
  const exact = entries.filter((e) => e.rank === targetRank);
  if (exact.length > 0) return exact;
  const below = entries.filter((e) => e.rank < targetRank);
  if (below.length === 0) return [];
  const groupRank = Math.max(...below.map((e) => e.rank));
  const group = entries.filter((e) => e.rank === groupRank);
  return groupRank + group.length - 1 >= targetRank ? group : [];
}

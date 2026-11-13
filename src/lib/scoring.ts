/** Maximum score for a single hole; also the score for an unranked guess. */
export const MAX_HOLE_SCORE = 150;

/** Highest rank a hole can target. */
export const MAX_TARGET_RANK = 150;

/**
 * Score one hole: distance between the target rank and the guessed player's rank,
 * capped at MAX_HOLE_SCORE. An unranked guess (null) scores the maximum.
 */
export function scoreHole(targetRank: number, guessRank: number | null): number {
  if (guessRank === null) return MAX_HOLE_SCORE;
  return Math.min(Math.abs(targetRank - guessRank), MAX_HOLE_SCORE);
}

export function formatValue(value: number, kind: "count" | "rate", decimals: number): string {
  if (kind === "count") {
    return decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString("en-US");
  }
  const s = value.toFixed(decimals);
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

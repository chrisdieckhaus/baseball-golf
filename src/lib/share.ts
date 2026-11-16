import { roundNumber } from "./round";
import { MAX_HOLE_SCORE } from "./scoring";
import { COPY, type Sport } from "./sport";

/**
 * Spoiler-free emoji for a hole score. Only the score is shared — never the stat,
 * the target rank or the player — so a posted result doesn't give the round away.
 */
export function holeEmoji(score: number): string {
  if (score === 0) return "⛳";
  if (score <= 5) return "🟩";
  if (score <= 20) return "🟨";
  if (score <= 50) return "🟧";
  if (score < MAX_HOLE_SCORE) return "🟥";
  return "⬛";
}

export function holeLabel(score: number): string {
  return score === 0 ? "ACE" : `+${score}`;
}

/**
 * Any other Baseball Golf score (a round total or an average), with the same
 * "+" as the holes: "+82", "+32.3". Averages keep one decimal, dropping ".0".
 * Zero is "0".
 */
export function scoreLabel(score: number): string {
  const n = score.toFixed(1).replace(/\.0$/, "");
  return score === 0 ? "0" : `+${n}`;
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface ShareInput {
  date: string; // YYYY-MM-DD
  scores: number[];
  url: string; // where friends can play: the site root, or the previous round's link
  /** Player mode (/golf/player) adds "Player" to the title. */
  mode?: "rank" | "player";
  /** NBA rounds are "Basketball Golf". */
  sport?: Sport;
}

/**
 * Build the text a player pastes into a group chat, e.g.
 *
 *   Baseball Golf #13 · Nov 13, 2026
 *   🟩 +4  🟨 +12  ⛳ ACE
 *   Total: +16
 *   https://dailydugout.com/golf
 */
export function buildShareText({ date, scores, url, mode = "rank", sport = "mlb" }: ShareInput): string {
  const golf = COPY[sport].golfName;
  const name = mode === "player" ? `${golf} · Player` : golf;
  const title = `${name} #${roundNumber(date)} · ${shortDate(date)}`;
  const holes = scores.map((s) => `${holeEmoji(s)} ${holeLabel(s)}`).join("  ");
  const total = scores.reduce((a, b) => a + b, 0);
  const totalLine = total === 0 ? "Total: 0 — perfect round!" : `Total: ${scoreLabel(total)}`;
  return [title, holes, totalLine, url].join("\n");
}

import { roundNumber } from "./round";
import { MAX_HOLE_SCORE } from "./scoring";

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
}

/**
 * Build the text a player pastes into a group chat, e.g.
 *
 *   Baseball Golf #13 · Nov 13, 2026
 *   🟩 +4  🟨 +12  ⛳ ACE
 *   Total: 16
 *   https://baseball-golf.vercel.app
 */
export function buildShareText({ date, scores, url }: ShareInput): string {
  const title = `Baseball Golf #${roundNumber(date)} · ${shortDate(date)}`;
  const holes = scores.map((s) => `${holeEmoji(s)} ${holeLabel(s)}`).join("  ");
  const total = scores.reduce((a, b) => a + b, 0);
  const totalLine = total === 0 ? "Total: 0 — perfect round!" : `Total: ${total}`;
  return [title, holes, totalLine, url].join("\n");
}

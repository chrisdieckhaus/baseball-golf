// Sports Revealer: a third daily game that shares Baseball Golf's data.
//
// Each day everyone gets the same mystery player, picked from the top 150 in
// career WAR. Nine clues, one per inning: his four best career stats (with their
// all-time ranks), then bats/throws, positions, awards, years active and teams.
// You get one guess per inning; a wrong guess or a skip reveals the next clue.
//
// No "server-only" import, so scripts can use this file. The answer and the
// clues not yet revealed never leave the server.
import { hashString, mulberry32 } from "./round";

export const INNINGS = 9;
/**
 * The first Sports Revealer round (#1). The game went live on Nov 14, 2026, with
 * rounds generated back to Nov 1 so its numbering matches the other games.
 */
export const REVEAL_LAUNCH_DATE = "2026-11-01";
/**
 * Where the daily walk through the shuffled pool starts. Nov 14 (the day the
 * game went live) keeps the first player in the shuffle, and Nov 1–13 take the
 * last 13, so no player repeats until the whole pool has been used.
 */
const REVEAL_ORDER_START = "2026-11-14";
export const SKIP = "skip";

export interface RevealClue {
  label: string;
  value: string;
  /** All-time rank, for the four stat clues. */
  rank?: number;
}

export interface RevealPlayer {
  id: string;
  name: string;
  type: "hitter" | "pitcher";
  warRank: number;
  war: number;
  years: string;
  clues: RevealClue[];
}

export interface RevealData {
  source: string;
  throughSeason: number;
  firstDebutYear: number;
  players: RevealPlayer[];
}

/** What gets saved for a daily round: just the player. */
export interface StoredRevealRound {
  playerId: string;
}

/** A round as the browser sees it: no answer. */
export interface RevealRound {
  date: string;
  practiceSeed?: string;
  type: RevealPlayer["type"];
}

export interface RevealState {
  /** The clues revealed so far, in inning order. */
  clues: { label: string; value: string }[];
  solved: boolean;
  done: boolean;
  /** Set once the round is over. */
  answer: { id: string; name: string; years: string; war: number; warRank: number } | null;
}

export function revealRoundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${REVEAL_LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

/**
 * Pick the player. Daily rounds walk through one fixed shuffle of the pool, so
 * nobody repeats until everyone has had a turn. A practice round is a random
 * pick seeded by its practice seed, so the same link always gives the same player.
 * Daily rounds are stored the first time they're needed (reveal-rounds.ts), so a
 * data refresh that changes the pool never changes a round that already exists.
 */
export function generateStoredRevealRound(data: RevealData, date: string, practiceSeed?: string): StoredRevealRound {
  const ids = data.players.map((p) => p.id).sort();
  if (practiceSeed) {
    const rand = mulberry32(hashString(`sports-revealer:practice:${practiceSeed}`));
    return { playerId: ids[Math.floor(rand() * ids.length)] };
  }
  const rand = mulberry32(hashString("sports-revealer:order"));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const n = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${REVEAL_ORDER_START}T00:00:00Z`)) / 86_400_000,
  );
  return { playerId: ids[((n % ids.length) + ids.length) % ids.length] };
}

export function findRevealPlayer(data: RevealData, id: string): RevealPlayer {
  const p = data.players.find((x) => x.id === id);
  if (!p) throw new Error(`Sports Revealer player "${id}" is missing from the data`);
  return p;
}

const ID_RE = /^[a-z0-9.'-]{1,16}$/;

/**
 * True if `guesses` is a possible history for this player: at most nine
 * entries, each a player id or "skip", no player twice, and the right answer
 * only as the last one (the round ends when you get it).
 */
export function isValidGuesses(player: RevealPlayer, guesses: unknown): guesses is string[] {
  if (!Array.isArray(guesses) || guesses.length > INNINGS) return false;
  if (!guesses.every((g) => typeof g === "string" && (g === SKIP || ID_RE.test(g)))) return false;
  const named = guesses.filter((g) => g !== SKIP);
  if (new Set(named).size !== named.length) return false;
  const hit = guesses.indexOf(player.id);
  return hit === -1 || hit === guesses.length - 1;
}

/** What the player sees after these guesses. */
export function revealState(player: RevealPlayer, guesses: string[]): RevealState {
  const solved = guesses.length > 0 && guesses[guesses.length - 1] === player.id;
  const done = solved || guesses.length >= INNINGS;
  const shown = done ? INNINGS : guesses.length + 1;
  return {
    clues: player.clues.slice(0, shown).map(({ label, value }) => ({ label, value })),
    solved,
    done,
    answer: done
      ? { id: player.id, name: player.name, years: player.years, war: player.war, warRank: player.warRank }
      : null,
  };
}

const INNING_NAMES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
export function inningName(n: number): string {
  return INNING_NAMES[n - 1] ?? `${n}th`;
}

/**
 * Spoiler-free share text, e.g.
 *
 *   Sports Revealer #3 · Nov 16, 2026
 *   🟥⬛🟥🟩
 *   Got him in the 4th inning
 *   https://…/reveal
 */
export function buildRevealShareText(round: RevealRound, guesses: string[], state: RevealState, url: string): string {
  const date = new Date(`${round.date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const title = round.practiceSeed
    ? `Sports Revealer · Practice #${round.practiceSeed}`
    : `Sports Revealer #${revealRoundNumber(round.date)} · ${date}`;
  const squares = guesses
    .map((g, i) => (state.solved && i === guesses.length - 1 ? "🟩" : g === SKIP ? "⬛" : "🟥"))
    .join("");
  const line = state.solved ? `Got him in the ${inningName(guesses.length)} inning` : "Struck out";
  return [title, squares, line, url].join("\n");
}

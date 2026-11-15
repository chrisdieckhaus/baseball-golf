// Roster Reveal: a daily game on the same Lahman data as the others.
//
// Each day everyone gets the same team-season. You're told the year, and the
// team's starting lineup (ten players) is revealed one at a time, most obscure
// first. Reveal as many as you like, then make one guess: the team. Fewer
// players revealed is better; a wrong guess loses the round.
//
// No "server-only" import, so scripts can use this file. The answer and the
// players not yet revealed never leave the server.
import { hashString, mulberry32 } from "./round";
import { COPY, namespaced, type Sport } from "./sport";

export const LINEUP_SIZE = 10;
/** Round #1. Rounds are numbered from Nov 1, 2026, like the other games. */
export const ROSTER_LAUNCH_DATE = "2026-11-01";

export interface LineupPlayer {
  id: string;
  name: string;
  /** Baseball: C, 1B, 2B, 3B, SS, LF, CF, RF, DH or SP. NBA: PG, SG, SF, PF or C (G/F/C before 1952). */
  pos: string;
}

export interface RosterTeamSeason {
  franchise: string;
  year: number;
  team: string;
  record: string;
  postseason: string;
  /** Most obscure first. */
  lineup: LineupPlayer[];
}

export interface RosterData {
  source: string;
  firstYear: number;
  lastYear: number;
  /** Every team that played each season, as [franchise, name that year]. */
  yearTeams: Record<string, [string, string][]>;
  rounds: RosterTeamSeason[];
}

/** What gets saved for a daily round. */
export interface StoredRosterRound {
  franchise: string;
  year: number;
}

/** A round as the browser sees it: the year and the teams to pick from, no answer. */
export interface RosterRound {
  date: string;
  year: number;
  teams: [string, string][];
}

export interface RosterState {
  /** The players revealed so far, most obscure first. */
  revealed: { name: string; pos: string }[];
  /** The franchise guessed, once the guess is in. */
  guess: string | null;
  done: boolean;
  correct: boolean;
  /** Set once the round is over. */
  answer: { team: string; record: string; postseason: string; lineup: { name: string; pos: string }[] } | null;
}

export function rosterRoundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${ROSTER_LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

const keyOf = (r: { franchise: string; year: number }) => `${r.year}-${r.franchise}`;

/**
 * Pick the team-season. Daily rounds walk through one fixed shuffle of every
 * team-season, so nothing repeats for years. Daily rounds are stored the first time they're
 * needed (roster-rounds.ts), so a data refresh never changes a round that exists.
 */
export function generateStoredRosterRound(data: RosterData, date: string, sport: Sport = "mlb"): StoredRosterRound {
  const keys = data.rounds.map(keyOf).sort();
  const rand = mulberry32(hashString(namespaced(sport, "roster-reveal:order")));
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  const n = rosterRoundNumber(date) - 1;
  const key = keys[((n % keys.length) + keys.length) % keys.length];
  const [year, franchise] = key.split("-");
  return { franchise, year: Number(year) };
}

export function findTeamSeason(data: RosterData, stored: StoredRosterRound): RosterTeamSeason {
  const r = data.rounds.find((x) => x.franchise === stored.franchise && x.year === stored.year);
  if (!r) throw new Error(`Roster Reveal team-season ${stored.year} ${stored.franchise} is missing from the data`);
  return r;
}

export function publicRound(data: RosterData, ts: RosterTeamSeason, date: string): RosterRound {
  return {
    date,
    year: ts.year,
    teams: data.yearTeams[String(ts.year)] ?? [],
  };
}

/** A reveal count the round allows: 1 (the first player shows from the start) through ten. */
export function isValidRevealed(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= LINEUP_SIZE;
}

/** A guess is one of the franchises that played that season. */
export function isValidGuess(round: RosterRound, guess: unknown): guess is string {
  return typeof guess === "string" && round.teams.some(([f]) => f === guess);
}

/** What the player sees after revealing `revealed` players, and guessing if they have. */
export function rosterState(ts: RosterTeamSeason, revealed: number, guess: string | null): RosterState {
  const done = guess !== null;
  const lineup = ts.lineup.map(({ name, pos }) => ({ name, pos }));
  return {
    revealed: lineup.slice(0, Math.max(1, Math.min(revealed, LINEUP_SIZE))),
    guess,
    done,
    correct: done && guess === ts.franchise,
    answer: done ? { team: ts.team, record: ts.record, postseason: ts.postseason, lineup } : null,
  };
}

/**
 * A finished play's result as one number, lower is better: the players revealed
 * when you got it (1–10), or 11 for a miss.
 */
export const rosterResult = (revealed: number, correct: boolean) => (correct ? revealed : LINEUP_SIZE + 1);

/**
 * Spoiler-free share text, e.g.
 *
 *   Roster Reveal #16 · Nov 16, 2026
 *   🟦🟦🟦✅
 *   Got it after 4 players
 *   https://…/roster
 */
export function buildRosterShareText(round: RosterRound, state: RosterState, url: string, sport: Sport = "mlb"): string {
  const date = new Date(`${round.date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const name = sport === "nba" ? "Roster Reveal · NBA" : "Roster Reveal";
  const title = `${name} #${rosterRoundNumber(round.date)} · ${date}`;
  const n = state.revealed.length;
  const squares = "🟦".repeat(n - 1) + (state.correct ? "✅" : "❌");
  const line = state.correct ? `Got it after ${n} ${n === 1 ? "player" : "players"}` : COPY[sport].rosterMiss;
  return [title, squares, line, url].join("\n");
}

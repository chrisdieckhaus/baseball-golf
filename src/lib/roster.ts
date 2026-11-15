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

/** Baseball's lineup: ten players. */
export const LINEUP_SIZE = 10;
/** Players in a lineup: ten for baseball, eight for the NBA (a basketball rotation is shorter). */
export const lineupSize = (sport: Sport = "mlb") => (sport === "nba" ? 8 : LINEUP_SIZE);
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
 * Rounds before this date walk the original even shuffle of every team-season;
 * from this date on, they walk an order weighted toward recent seasons. Rounds
 * are stored the first time they're needed, so this must stay after the date
 * the change shipped: the weighted order skips every team-season the even
 * shuffle used before this date, so nothing repeats.
 */
export const ROSTER_WEIGHTED_FROM = "2026-11-18";
/** A season's weight halves for every this many years before RECENCY_ANCHOR. */
export const RECENCY_HALF_LIFE = 25;
/** Fixed (not the data's last year), so a data refresh doesn't reshuffle the order. */
const RECENCY_ANCHOR = 2026;

/** The original order: one even Fisher–Yates shuffle of every team-season. */
function evenOrder(data: RosterData, sport: Sport): string[] {
  const keys = data.rounds.map(keyOf).sort();
  const rand = mulberry32(hashString(namespaced(sport, "roster-reveal:order")));
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

/**
 * Every team-season in an order tilted toward recent seasons: a weighted shuffle
 * (Efraimidis–Spirakis), where a season's weight halves every RECENCY_HALF_LIFE
 * years. About half of the first few years of rounds come from the last 25
 * seasons, and older teams still turn up. Each team-season's random draw comes
 * from its own key, so adding a new season doesn't reorder the others.
 * Team-seasons the even order used before ROSTER_WEIGHTED_FROM are left out.
 */
function weightedOrder(data: RosterData, sport: Sport): string[] {
  const used = new Set(evenOrder(data, sport).slice(0, rosterRoundNumber(ROSTER_WEIGHTED_FROM) - 1));
  const seed = namespaced(sport, "roster-reveal:recent:");
  return data.rounds
    .map(keyOf)
    .filter((k) => !used.has(k))
    .map((k) => {
      const u = (hashString(seed + k) + 0.5) / 4294967296; // (0, 1)
      const weight = 2 ** ((Number(k.split("-")[0]) - RECENCY_ANCHOR) / RECENCY_HALF_LIFE);
      // u^(1/w), compared in log space: log(u) / w. Higher comes first.
      return { k, score: Math.log(u) / weight };
    })
    .sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : 1))
    .map((x) => x.k);
}

const orderCache = new WeakMap<RosterData, Map<string, string[]>>();
function cachedOrder(data: RosterData, sport: Sport, kind: "even" | "weighted"): string[] {
  let byKind = orderCache.get(data);
  if (!byKind) orderCache.set(data, (byKind = new Map()));
  const id = `${sport}:${kind}`;
  let order = byKind.get(id);
  if (!order) byKind.set(id, (order = kind === "even" ? evenOrder(data, sport) : weightedOrder(data, sport)));
  return order;
}

/**
 * Pick the team-season. Daily rounds walk through one fixed order of every
 * team-season, so nothing repeats for years: an even shuffle before
 * ROSTER_WEIGHTED_FROM, then one weighted toward recent seasons. Daily rounds
 * are stored the first time they're needed (roster-rounds.ts), so a data
 * refresh never changes a round that exists.
 */
export function generateStoredRosterRound(data: RosterData, date: string, sport: Sport = "mlb"): StoredRosterRound {
  const weighted = date >= ROSTER_WEIGHTED_FROM;
  const keys = cachedOrder(data, sport, weighted ? "weighted" : "even");
  const n = rosterRoundNumber(date) - (weighted ? rosterRoundNumber(ROSTER_WEIGHTED_FROM) : 1);
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

/** A reveal count the round allows: 1 (the first player shows from the start) through the lineup size. */
export function isValidRevealed(n: unknown, sport: Sport = "mlb"): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= lineupSize(sport);
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
    revealed: lineup.slice(0, Math.max(1, Math.min(revealed, lineup.length))),
    guess,
    done,
    correct: done && guess === ts.franchise,
    answer: done ? { team: ts.team, record: ts.record, postseason: ts.postseason, lineup } : null,
  };
}

/**
 * A finished play's result as one number, lower is better: the players revealed
 * when you got it (1 to the lineup size), or one more than that for a miss.
 */
export const rosterResult = (revealed: number, correct: boolean, sport: Sport = "mlb") =>
  correct ? revealed : lineupSize(sport) + 1;

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

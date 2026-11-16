// King of the Hill: a daily head-to-head game on the career leaderboards.
//
// One career stat a day and a chain of five matchups. Tap the player with the
// better number. Whoever really wins (whatever you picked) becomes king and
// stays on against a new challenger. The first matchup is two challengers. The
// king's number stays face up; the challenger's is hidden until you pick. Each
// matchup pairs players closer together on the all-time leaderboard, so they get
// harder as you go. Score: matchups right, out of five.
//
// No "server-only" import, so scripts and client components can use this file.
// Values never leave the server before they're revealed.
import { hashString, mulberry32 } from "./round";
import { formatValue } from "./scoring";
import { namespaced, type Sport } from "./sport";
import type { LeaderboardData } from "./types";

export const KOTH_MATCHUPS = 5;
/** Round #1. Rounds are numbered from Nov 1, 2026, like the other games. */
export const KOTH_LAUNCH_DATE = "2026-11-01";

export function kothRoundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${KOTH_LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

/** How a stat reads in the game. `question` finishes "Who has …?"; `noun` follows "Career" in the share text. */
export interface KothStat {
  question: string;
  noun: string;
  unit: string;
}

/**
 * The stats each sport plays with, by leaderboard key. Left out on purpose:
 * career-length stats (games, innings, minutes), stats that repeat another one
 * (total bases, OPS, field goals made), and ones that aren't much fun head to
 * head (K/9, WHIP, turnovers). Keep a stat here once rounds use it.
 */
export const KOTH_STATS: Record<Sport, Record<string, KothStat>> = {
  mlb: {
    H: { question: "more career hits", noun: "hits", unit: "hits" },
    HR: { question: "more career home runs", noun: "home runs", unit: "HR" },
    RBI: { question: "more career RBIs", noun: "RBIs", unit: "RBIs" },
    R: { question: "more career runs", noun: "runs", unit: "runs" },
    "2B": { question: "more career doubles", noun: "doubles", unit: "doubles" },
    "3B": { question: "more career triples", noun: "triples", unit: "triples" },
    BB: { question: "more career walks", noun: "walks", unit: "walks" },
    SB: { question: "more career stolen bases", noun: "stolen bases", unit: "SB" },
    AVG: { question: "the higher career batting average", noun: "batting average", unit: "AVG" },
    OBP: { question: "the higher career on-base percentage", noun: "on-base percentage", unit: "OBP" },
    SLG: { question: "the higher career slugging percentage", noun: "slugging percentage", unit: "SLG" },
    W: { question: "more career wins", noun: "wins", unit: "wins" },
    SO: { question: "more career strikeouts", noun: "strikeouts", unit: "K" },
    SV: { question: "more career saves", noun: "saves", unit: "saves" },
    ERA: { question: "the lower career ERA", noun: "ERA", unit: "ERA" },
  },
  nba: {
    PTS: { question: "more career points", noun: "points", unit: "PTS" },
    TRB: { question: "more career rebounds", noun: "rebounds", unit: "REB" },
    AST: { question: "more career assists", noun: "assists", unit: "AST" },
    STL: { question: "more career steals", noun: "steals", unit: "STL" },
    BLK: { question: "more career blocks", noun: "blocks", unit: "BLK" },
    "3P": { question: "more career 3-pointers", noun: "3-pointers", unit: "3PM" },
    PPG: { question: "the higher career scoring average", noun: "points per game", unit: "PPG" },
    RPG: { question: "the higher career rebounding average", noun: "rebounds per game", unit: "RPG" },
    APG: { question: "the higher career assists average", noun: "assists per game", unit: "APG" },
    "FG%": { question: "the higher career field goal percentage", noun: "field goal percentage", unit: "FG%" },
    "FT%": { question: "the higher career free throw percentage", noun: "free throw percentage", unit: "FT%" },
    "3P%": { question: "the higher career 3-point percentage", noun: "3-point percentage", unit: "3P%" },
  },
};

/**
 * Cards show a name and position but no years, so players who share a name
 * and a position need telling apart.
 */
const DISPLAY_NAMES: Record<string, string> = {
  griffke01: "Ken Griffey Sr.",
  griffke02: "Ken Griffey Jr.",
  guerrvl01: "Vladimir Guerrero Sr.",
  guerrvl02: "Vladimir Guerrero Jr.",
  leonadu01: "Dutch (Hubert) Leonard",
  leonadu02: "Dutch (Emil) Leonard",
};
export const displayName = (id: string, name: string) => DISPLAY_NAMES[id] ?? name;

/** How far apart (in leaderboard places) each matchup's two players are, matchup 1 first. */
export const KOTH_BANDS: [number, number][] = [
  [70, 130],
  [35, 70],
  [15, 35],
  [6, 15],
  [1, 6],
];
export const KOTH_LEVELS = ["Easy", "Easy", "Medium", "Hard", "Toughest"];

/** What gets saved for a daily round: the stat and the six players, in the order they appear. */
export interface StoredKothRound {
  statKey: string;
  playerIds: string[];
}

function shuffled<T>(items: T[], seed: string): T[] {
  const a = [...items];
  const rand = mulberry32(hashString(seed));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The day's stat. Stats run in shuffled cycles (each once per cycle), and a new
 * cycle never starts with the stat the last one ended on, so no stat comes up
 * two days running.
 */
export function kothStatFor(date: string, sport: Sport = "mlb"): string {
  const keys = Object.keys(KOTH_STATS[sport]);
  const idx = Math.max(kothRoundNumber(date) - 1, 0);
  const cycle = Math.floor(idx / keys.length);
  const seed = (c: number) => namespaced(sport, `koth:stats:${c}`);
  const order = shuffled(keys, seed(cycle));
  if (cycle > 0 && order[0] === shuffled(keys, seed(cycle - 1)).at(-1)) [order[0], order[1]] = [order[1], order[0]];
  return order[idx % keys.length];
}

const shown = (data: LeaderboardData, statKey: string, value: number) => {
  const s = data.stats[statKey];
  return formatValue(value, s.kind, s.decimals);
};

/** True if a beats b in the stat (higher, or lower for ERA). */
export function beats(data: LeaderboardData, statKey: string, a: number, b: number): boolean {
  return data.stats[statKey].lowerIsBetter ? a < b : a > b;
}

/**
 * Generate the day's chain: the stat, then six players. The first starts in the
 * middle of the leaderboard (within 30 places of it); each challenger is drawn so the gap to the current
 * king (in leaderboard places) falls in that matchup's band, above or below him
 * on a coin flip. Two players in a matchup never show the same number.
 */
export function generateStoredKothRound(data: LeaderboardData, date: string, sport: Sport = "mlb"): StoredKothRound {
  const statKey = kothStatFor(date, sport);
  const stat = data.stats[statKey];
  if (!stat) throw new Error(`King of the Hill stat "${statKey}" is missing from the ${sport} leaderboards`);
  const rand = mulberry32(hashString(namespaced(sport, `koth:${date}`)));
  const entries = stat.entries;
  const used = new Set<number>();
  const pick = (idxs: number[]) => {
    const i = idxs[Math.floor(rand() * idxs.length)];
    used.add(i);
    return i;
  };
  const range = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let i = Math.max(lo, 0); i <= Math.min(hi, entries.length - 1); i++) out.push(i);
    return out;
  };

  // Every later matchup needs room both above and below the king, or a king near
  // the top of the list could never be beaten. So a new king is never placed
  // closer to either end than the remaining matchups' minimum gaps add up to.
  const reserveAfter = (k: number) => KOTH_BANDS.slice(k + 1).reduce((s, [lo]) => s + lo, 0);
  const middle = Math.floor(entries.length / 2);
  let king = pick(range(middle - 30, middle + 30));
  const chain = [king];
  for (const [k, [lo, hi]] of KOTH_BANDS.entries()) {
    const reserve = reserveAfter(k);
    const kingShown = shown(data, statKey, entries[king].value);
    const ok = (i: number) =>
      !used.has(i) && shown(data, statKey, entries[i].value) !== kingShown && i >= reserve && i <= entries.length - 1 - reserve;
    const side = (better: boolean, l: number, h: number) =>
      range(better ? king - h : king + l, better ? king - l : king + h).filter(ok);
    const up = rand() < 0.5; // up = a better spot on the leaderboard
    let options = side(up, lo, hi);
    if (!options.length) options = side(!up, lo, hi);
    for (let w = 1; !options.length && w < 5; w++) {
      options = [...side(true, Math.max(1, lo - w * 5), hi + w * 10), ...side(false, Math.max(1, lo - w * 5), hi + w * 10)];
    }
    if (!options.length) options = range(0, entries.length - 1).filter(ok);
    const challenger = pick(options);
    chain.push(challenger);
    if (beats(data, statKey, entries[challenger].value, entries[king].value)) king = challenger;
  }
  return { statKey, playerIds: chain.map((i) => entries[i].id) };
}

/** A player card. `value` is only filled in once it's been revealed. */
export interface KothCard {
  id: string;
  name: string;
  pos: string;
  value: string | null;
}

export interface KothResult {
  king: KothCard;
  challenger: KothCard;
  winnerId: string;
  pickedId: string;
  ok: boolean;
}

export interface KothState {
  results: KothResult[];
  /** The matchup to play next (the king's value shown after matchup 1), or null when done. */
  next: { king: KothCard; challenger: KothCard } | null;
  score: number;
  done: boolean;
}

/** The round as the browser first sees it. */
export interface KothRound {
  date: string;
  statKey: string;
  question: string;
  noun: string;
  unit: string;
  qualifier: string | null;
}

export function publicKothRound(data: LeaderboardData, date: string, stored: StoredKothRound, sport: Sport = "mlb"): KothRound {
  const stat = data.stats[stored.statKey];
  const words = KOTH_STATS[sport][stored.statKey];
  if (!stat || !words) throw new Error(`King of the Hill round ${date} uses unknown stat "${stored.statKey}"`);
  return { date, statKey: stat.key, ...words, qualifier: stat.qualifier };
}

/**
 * Plays the chain forward with the picks so far and returns what the browser may
 * see: each finished matchup with both values, and the next matchup with only
 * the king's value (none in matchup 1). `pos` gives a player's position.
 * A player who's dropped off the stored leaderboard after a data refresh loses.
 */
export function kothState(
  data: LeaderboardData,
  stored: StoredKothRound,
  picks: string[],
  pos: (id: string) => string,
): KothState {
  const stat = data.stats[stored.statKey];
  const byId = new Map(stat.entries.map((e) => [e.id, e]));
  const worst = stat.lowerIsBetter ? Infinity : -Infinity;
  const valueOf = (id: string) => byId.get(id)?.value ?? worst;
  const card = (id: string, reveal: boolean): KothCard => {
    const e = byId.get(id);
    return {
      id,
      name: displayName(id, e?.name ?? id),
      pos: pos(id),
      value: reveal ? (e ? shown(data, stored.statKey, e.value) : "—") : null,
    };
  };

  const results: KothResult[] = [];
  let king = stored.playerIds[0];
  for (let i = 0; i < KOTH_MATCHUPS; i++) {
    const challenger = stored.playerIds[i + 1];
    if (i >= picks.length) {
      return {
        results,
        next: { king: card(king, i > 0), challenger: card(challenger, false) },
        score: results.filter((r) => r.ok).length,
        done: false,
      };
    }
    const kingWins = beats(data, stored.statKey, valueOf(king), valueOf(challenger));
    const winner = kingWins ? king : challenger;
    results.push({
      king: card(king, true),
      challenger: card(challenger, true),
      winnerId: winner,
      pickedId: picks[i],
      ok: picks[i] === winner,
    });
    king = winner;
  }
  return { results, next: null, score: results.filter((r) => r.ok).length, done: true };
}

/** Checks the picks so far: 1–5 of them, each one of the two players in its matchup. */
export function validKothPicks(data: LeaderboardData, stored: StoredKothRound, picks: unknown): picks is string[] {
  if (!Array.isArray(picks) || picks.length < 1 || picks.length > KOTH_MATCHUPS) return false;
  if (!picks.every((p) => typeof p === "string")) return false;
  const stat = data.stats[stored.statKey];
  const byId = new Map(stat.entries.map((e) => [e.id, e.value]));
  const worst = stat.lowerIsBetter ? Infinity : -Infinity;
  let king = stored.playerIds[0];
  for (let i = 0; i < picks.length; i++) {
    const challenger = stored.playerIds[i + 1];
    if (picks[i] !== king && picks[i] !== challenger) return false;
    if (!beats(data, stored.statKey, byId.get(king) ?? worst, byId.get(challenger) ?? worst)) king = challenger;
  }
  return true;
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Spoiler-free share text:
 *
 *   King of the Hill #15 · Nov 15, 2026
 *   Career home runs
 *   ✅✅❌✅✅ 4/5
 *   https://dailydugout.com/king
 */
export function buildKothShareText(round: KothRound, state: KothState, url: string, sport: Sport = "mlb"): string {
  const name = sport === "nba" ? "King of the Hill · NBA" : "King of the Hill";
  const marks = state.results.map((r) => (r.ok ? "✅" : "❌")).join("");
  return [
    `${name} #${kothRoundNumber(round.date)} · ${shortDate(round.date)}`,
    `Career ${round.noun}`,
    `${marks} ${state.score}/${KOTH_MATCHUPS}`,
    url,
  ].join("\n");
}

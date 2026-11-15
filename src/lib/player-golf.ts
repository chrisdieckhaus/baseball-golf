// Baseball Golf, Player mode (/golf/player): the original game flipped. Each
// hole names a player and a career stat; you say where he ranks all-time.
// Score = how many ranks you miss by, capped at MAX_HOLE_SCORE, like Rank mode.
// A guess anywhere inside his tie counts as exact.
//
// No "server-only" import, so scripts can use this file. The answers (ranks and
// values) never leave the server before a guess.
import { HOLES_PER_ROUND, MAX_TIE_SIZE, hashString, mulberry32 } from "./round";
import { formatValue, MAX_HOLE_SCORE, MAX_TARGET_RANK, targetPlayers } from "./scoring";
import type { LeaderboardData, LeaderboardEntry, StatGroup } from "./types";

/** Round #1. Rounds are numbered from Nov 1, 2026, like the other games. */
export const PLAYER_GOLF_LAUNCH_DATE = "2026-11-01";
/** How many ranks above and below him the reveal shows. */
export const NEAR_RANKS = 2;

/** What gets saved for a daily round: each hole's stat and player. */
export interface StoredPlayerHole {
  statKey: string;
  playerId: string;
}

/** Years active and primary position, by player id (src/data/player-meta.json). */
export type PlayerMeta = Record<string, [years: string, pos: string]>;

/** A hole as the browser sees it before guessing: the player and the stat, no rank. */
export interface PlayerHole {
  statKey: string;
  label: string;
  group: StatGroup;
  qualifier: string | null;
  lowerIsBetter: boolean;
  player: { id: string; name: string; years: string; pos: string };
}

export interface PlayerRound {
  date: string;
  holes: PlayerHole[];
}

export interface PlayerGolfResult {
  hole: number;
  /** The rank guessed, 1–MAX_TARGET_RANK. */
  guess: number;
  score: number;
  /** His rank now; null only if a data refresh dropped him off the stored leaderboard. */
  rank: number | null;
  tied: boolean;
  value: string | null;
  /** The leaderboard around him, best first. */
  near: { rank: number; name: string; value: string; him: boolean }[];
  /** Who holds the guessed rank (a tie covers the ranks after it), if anyone. */
  atGuess: { rank: number; players: { name: string; value: string }[] };
}

/**
 * Pick the round from its date: three different stats, never all three batting
 * or all three pitching, and for each a player ranked 1st–100th who isn't in a
 * tie of more than MAX_TIE_SIZE and isn't used on another hole. Only players
 * with years and a position on file are picked, so every hole can show them.
 * Daily rounds are stored the first time they're needed (player-golf-rounds.ts),
 * so changing this only affects rounds that don't exist yet.
 */
export function generateStoredPlayerRound(data: LeaderboardData, meta: PlayerMeta, date: string): StoredPlayerHole[] {
  const rand = mulberry32(hashString(`baseball-golf-player:${date}`));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const keys = Object.keys(data.stats).sort();
  const holes: StoredPlayerHole[] = [];
  const usedStats = new Set<string>();
  const usedPlayers = new Set<string>();
  while (holes.length < HOLES_PER_ROUND) {
    const groupCounts = new Map<string, number>();
    for (const h of holes) {
      const g = data.stats[h.statKey].group;
      groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
    }
    const candidates = keys.filter(
      (k) => !usedStats.has(k) && (groupCounts.get(data.stats[k].group) ?? 0) < HOLES_PER_ROUND - 1,
    );
    if (candidates.length === 0) throw new Error(`Couldn't build a Player round for ${date}`);
    const key = pick(candidates);
    usedStats.add(key);
    const entries = data.stats[key].entries;
    const tieSize = new Map<number, number>();
    for (const e of entries) tieSize.set(e.rank, (tieSize.get(e.rank) ?? 0) + 1);
    const eligible = entries.filter(
      (e) => e.rank <= MAX_TARGET_RANK && tieSize.get(e.rank)! <= MAX_TIE_SIZE && !usedPlayers.has(e.id) && meta[e.id],
    );
    if (eligible.length === 0) continue;
    const p = pick(eligible);
    usedPlayers.add(p.id);
    holes.push({ statKey: key, playerId: p.id });
  }
  return holes;
}

/** The playable round: names and labels from the current data, no ranks. */
export function playerRoundFromStored(
  data: LeaderboardData,
  meta: PlayerMeta,
  date: string,
  stored: StoredPlayerHole[],
): PlayerRound {
  return {
    date,
    holes: stored.map(({ statKey, playerId }) => {
      const stat = data.stats[statKey];
      if (!stat) throw new Error(`Player round ${date} uses stat "${statKey}", which is missing from the leaderboards`);
      const entry = stat.entries.find((e) => e.id === playerId);
      const [years, pos] = meta[playerId] ?? ["", ""];
      return {
        statKey,
        label: stat.label,
        group: stat.group,
        qualifier: stat.qualifier,
        lowerIsBetter: stat.lowerIsBetter,
        player: { id: playerId, name: entry?.name ?? playerId, years, pos },
      };
    }),
  };
}

export const isValidRankGuess = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_TARGET_RANK;

/** Distance from the guess to his tie group's ranks (a 3-way tie at 20th covers 20th–22nd), capped. */
export function scorePlayerHole(entries: LeaderboardEntry[], playerId: string, guess: number): number {
  const him = entries.find((e) => e.id === playerId);
  if (!him) return MAX_HOLE_SCORE;
  const n = entries.filter((e) => e.rank === him.rank).length;
  const lo = him.rank;
  const hi = him.rank + n - 1;
  const d = guess < lo ? lo - guess : guess > hi ? guess - hi : 0;
  return Math.min(d, MAX_HOLE_SCORE);
}

/** Score a guess and build the reveal, against the current leaderboards. */
export function playerGolfResult(
  data: LeaderboardData,
  round: PlayerRound,
  holeIndex: number,
  guess: number,
): PlayerGolfResult {
  const hole = round.holes[holeIndex];
  const stat = data.stats[hole.statKey];
  const fmt = (v: number) => formatValue(v, stat.kind, stat.decimals);
  const him = stat.entries.find((e) => e.id === hole.player.id) ?? null;
  const near = him
    ? stat.entries
        .filter((e) => e.rank >= him.rank - NEAR_RANKS && e.rank <= him.rank + NEAR_RANKS)
        .map((e) => ({ rank: e.rank, name: e.name, value: fmt(e.value), him: e.id === him.id }))
    : [];
  const holders = targetPlayers(stat.entries, guess);
  return {
    hole: holeIndex,
    guess,
    score: scorePlayerHole(stat.entries, hole.player.id, guess),
    rank: him?.rank ?? null,
    tied: him ? stat.entries.filter((e) => e.rank === him.rank).length > 1 : false,
    value: him ? fmt(him.value) : null,
    near,
    atGuess: {
      rank: holders[0]?.rank ?? guess,
      players: holders.map((e) => ({ name: e.name, value: fmt(e.value) })),
    },
  };
}

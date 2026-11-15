import "server-only";
import rawMeta from "@/data/player-meta.json";
import { getDb } from "./db";
import { leaderboards } from "./leaderboards";
import {
  generateStoredPlayerRound,
  playerGolfResult,
  playerRoundFromStored,
  PLAYER_GOLF_LAUNCH_DATE,
  type PlayerGolfResult,
  type PlayerMeta,
  type PlayerRound,
} from "./player-golf";
import type { StoredPlayerPlay } from "./player-golf-plays";
import { getOrCreateStoredPlayerRound } from "./player-golf-rounds";
import { isValidDate, todayET } from "./round";

export const playerMeta = rawMeta as unknown as PlayerMeta;

const cache = new Map<string, PlayerRound>();

/** A daily Player mode round exists for every date from round #1 through today (ET). */
export function isPlayablePlayerDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= PLAYER_GOLF_LAUNCH_DATE && date <= today;
}

/** The daily round, stored the first time it's needed. Without a database it's generated. */
export async function getPlayerRound(date: string): Promise<PlayerRound> {
  const cached = cache.get(date);
  if (cached) return cached;
  const generated = () =>
    playerRoundFromStored(leaderboards, playerMeta, date, generateStoredPlayerRound(leaderboards, playerMeta, date));
  const db = getDb();
  if (!db) return generated();
  try {
    const stored = await getOrCreateStoredPlayerRound(db, leaderboards, playerMeta, date);
    const round = playerRoundFromStored(leaderboards, playerMeta, date, stored);
    cache.set(date, round);
    return round;
  } catch (e) {
    console.error(`[player-golf] Couldn't load the round for ${date}; generating it instead.`, e);
    return generated();
  }
}

export function scorePlayerGuess(round: PlayerRound, hole: number, guess: number): PlayerGolfResult {
  return playerGolfResult(leaderboards, round, hole, guess);
}

/**
 * Rebuild the results of a saved play. The reveal comes from the current data;
 * the score stays the one saved when it was played.
 */
export function playerResultsFromPlay(round: PlayerRound, play: StoredPlayerPlay): (PlayerGolfResult | null)[] {
  return round.holes.map((_, i) => {
    const g = play.guesses[i];
    if (g === null || g === undefined) return null;
    const r = playerGolfResult(leaderboards, round, i, g);
    return { ...r, score: play.holeScores[i] ?? r.score };
  });
}

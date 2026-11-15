import "server-only";
import { getDb } from "./db";
import { leaderboardsFor } from "./leaderboards";
import {
  generateStoredPlayerRound,
  playerGolfResult,
  playerRoundFromStored,
  PLAYER_GOLF_LAUNCH_DATE,
  type PlayerGolfResult,
  type PlayerRound,
} from "./player-golf";
import { playerMetaFor } from "./player-meta";
import type { StoredPlayerPlay } from "./player-golf-plays";
import { getOrCreateStoredPlayerRound } from "./player-golf-rounds";
import { isValidDate, todayET } from "./round";
import type { Sport } from "./sport";

const cache = new Map<string, PlayerRound>(); // keyed by `${sport}:${date}`

/** A daily Player mode round exists for every date from round #1 through today (ET). */
export function isPlayablePlayerDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= PLAYER_GOLF_LAUNCH_DATE && date <= today;
}

/** The daily round, stored the first time it's needed. Without a database it's generated. */
export async function getPlayerRound(date: string, sport: Sport = "mlb"): Promise<PlayerRound> {
  const key = `${sport}:${date}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = leaderboardsFor(sport);
  const meta = playerMetaFor(sport);
  const generated = () => playerRoundFromStored(data, meta, date, generateStoredPlayerRound(data, meta, date, sport));
  const db = getDb();
  if (!db) return generated();
  try {
    const stored = await getOrCreateStoredPlayerRound(db, data, meta, date, sport);
    const round = playerRoundFromStored(data, meta, date, stored);
    cache.set(key, round);
    return round;
  } catch (e) {
    console.error(`[player-golf] Couldn't load the ${sport} round for ${date}; generating it instead.`, e);
    return generated();
  }
}

export function scorePlayerGuess(round: PlayerRound, hole: number, guess: number, sport: Sport = "mlb"): PlayerGolfResult {
  return playerGolfResult(leaderboardsFor(sport), round, hole, guess);
}

/**
 * Rebuild the results of a saved play. The reveal comes from the current data;
 * the score stays the one saved when it was played.
 */
export function playerResultsFromPlay(
  round: PlayerRound,
  play: StoredPlayerPlay,
  sport: Sport = "mlb",
): (PlayerGolfResult | null)[] {
  return round.holes.map((_, i) => {
    const g = play.guesses[i];
    if (g === null || g === undefined) return null;
    const r = playerGolfResult(leaderboardsFor(sport), round, i, g);
    return { ...r, score: play.holeScores[i] ?? r.score };
  });
}

import "server-only";
import { getDb } from "./db";
import { leaderboardsFor } from "./leaderboards";
import { generateStoredRankRound, rankRoundFromStored, RANK_LAUNCH_DATE, type RankRound } from "./rank";
import { getOrCreateStoredRankRound } from "./rank-rounds";
import { isValidDate, todayET } from "./round";
import type { Sport } from "./sport";

const cache = new Map<string, RankRound>(); // keyed by `${sport}:${date}`

/** A daily Stats Ranker round exists for every date from its launch through today (ET). */
export function isPlayableRankDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= RANK_LAUNCH_DATE && date <= today;
}

/** The daily round, stored the first time it's needed. */
export async function getRankRound(date: string, sport: Sport = "mlb"): Promise<RankRound> {
  const key = `${sport}:${date}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = leaderboardsFor(sport);
  const generated = () => rankRoundFromStored(data, date, generateStoredRankRound(data, date, sport));
  const db = getDb();
  if (!db) return generated();
  try {
    const round = rankRoundFromStored(data, date, await getOrCreateStoredRankRound(db, data, date, sport));
    cache.set(key, round);
    return round;
  } catch (e) {
    console.error(`[rank-rounds] Couldn't load the ${sport} round for ${date}; generating it instead.`, e);
    return generated();
  }
}

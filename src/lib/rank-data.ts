import "server-only";
import { getDb } from "./db";
import { leaderboards } from "./leaderboards";
import { generateStoredRankRound, rankRoundFromStored, RANK_LAUNCH_DATE, type RankRound } from "./rank";
import { getOrCreateStoredRankRound } from "./rank-rounds";
import { isValidDate, todayET } from "./round";

const cache = new Map<string, RankRound>();

/** A daily Stats Ranker round exists for every date from its launch through today (ET). */
export function isPlayableRankDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= RANK_LAUNCH_DATE && date <= today;
}

/** The daily round, stored the first time it's needed. */
export async function getRankRound(date: string): Promise<RankRound> {
  const cached = cache.get(date);
  if (cached) return cached;
  const db = getDb();
  if (!db) return rankRoundFromStored(leaderboards, date, generateStoredRankRound(leaderboards, date));
  try {
    const round = rankRoundFromStored(leaderboards, date, await getOrCreateStoredRankRound(db, leaderboards, date));
    cache.set(date, round);
    return round;
  } catch (e) {
    console.error(`[rank-rounds] Couldn't load the round for ${date}; generating it instead.`, e);
    return rankRoundFromStored(leaderboards, date, generateStoredRankRound(leaderboards, date));
  }
}

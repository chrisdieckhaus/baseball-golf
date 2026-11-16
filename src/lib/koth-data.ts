import "server-only";
import { getDb } from "./db";
import { generateStoredKothRound, KOTH_LAUNCH_DATE, kothState, publicKothRound, type KothRound, type KothState, type StoredKothRound } from "./koth";
import { getOrCreateStoredKothRound } from "./koth-rounds";
import { leaderboardsFor } from "./leaderboards";
import { playerMetaFor } from "./player-meta";
import { isValidDate, todayET } from "./round";
import type { Sport } from "./sport";

const cache = new Map<string, StoredKothRound>(); // keyed by `${sport}:${date}`

/** A daily round exists for every date from round #1 through today (ET). */
export function isPlayableKothDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= KOTH_LAUNCH_DATE && date <= today;
}

/** The daily round, stored the first time it's needed. */
export async function getKothRound(date: string, sport: Sport = "mlb"): Promise<{ round: KothRound; stored: StoredKothRound }> {
  const data = leaderboardsFor(sport);
  const key = `${sport}:${date}`;
  let stored = cache.get(key);
  if (!stored) {
    const db = getDb();
    if (!db) stored = generateStoredKothRound(data, date, sport);
    else {
      try {
        stored = await getOrCreateStoredKothRound(db, data, date, sport);
        cache.set(key, stored);
      } catch (e) {
        console.error(`[koth-rounds] Couldn't load the ${sport} round for ${date}; generating it instead.`, e);
        stored = generateStoredKothRound(data, date, sport);
      }
    }
  }
  return { round: publicKothRound(data, date, stored, sport), stored };
}

/** What the browser sees for a round after these picks. */
export function kothStateFor(stored: StoredKothRound, picks: string[], sport: Sport = "mlb"): KothState {
  const meta = playerMetaFor(sport);
  return kothState(leaderboardsFor(sport), stored, picks, (id) => meta[id]?.[1] ?? "");
}

import "server-only";
import { getDb } from "./db";
import {
  findTeamSeason,
  generateStoredRosterRound,
  publicRound,
  ROSTER_LAUNCH_DATE,
  type RosterRound,
  type RosterTeamSeason,
  type StoredRosterRound,
} from "./roster";
import { rosterDataFor } from "./roster-pool";
import { getOrCreateStoredRosterRound } from "./roster-rounds";
import { isValidDate, todayET } from "./round";
import type { Sport } from "./sport";

const cache = new Map<string, StoredRosterRound>(); // keyed by `${sport}:${date}`

/** A daily Roster Reveal round exists for every date from round #1 through today (ET). */
export function isPlayableRosterDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= ROSTER_LAUNCH_DATE && date <= today;
}

async function storedFor(date: string, sport: Sport): Promise<StoredRosterRound> {
  const key = `${sport}:${date}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const data = rosterDataFor(sport);
  const db = getDb();
  if (!db) return generateStoredRosterRound(data, date, sport);
  try {
    const stored = await getOrCreateStoredRosterRound(db, data, date, sport);
    cache.set(key, stored);
    return stored;
  } catch (e) {
    console.error(`[roster-rounds] Couldn't load the ${sport} round for ${date}; generating it instead.`, e);
    return generateStoredRosterRound(data, date, sport);
  }
}

/** The round for the browser plus the team-season (server only). */
export async function getRosterRound(
  date: string,
  sport: Sport = "mlb",
): Promise<{ round: RosterRound; teamSeason: RosterTeamSeason }> {
  const data = rosterDataFor(sport);
  const teamSeason = findTeamSeason(data, await storedFor(date, sport));
  return { round: publicRound(data, teamSeason, date), teamSeason };
}

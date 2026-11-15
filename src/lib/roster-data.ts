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
import { rosterData } from "./roster-pool";
import { getOrCreateStoredRosterRound } from "./roster-rounds";
import { isValidDate, todayET } from "./round";

const cache = new Map<string, StoredRosterRound>();

/** A daily Roster Reveal round exists for every date from round #1 through today (ET). */
export function isPlayableRosterDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= ROSTER_LAUNCH_DATE && date <= today;
}

async function storedFor(date: string): Promise<StoredRosterRound> {
  const cached = cache.get(date);
  if (cached) return cached;
  const db = getDb();
  if (!db) return generateStoredRosterRound(rosterData, date);
  try {
    const stored = await getOrCreateStoredRosterRound(db, rosterData, date);
    cache.set(date, stored);
    return stored;
  } catch (e) {
    console.error(`[roster-rounds] Couldn't load the round for ${date}; generating it instead.`, e);
    return generateStoredRosterRound(rosterData, date);
  }
}

/** The round for the browser plus the team-season (server only). */
export async function getRosterRound(date: string): Promise<{ round: RosterRound; teamSeason: RosterTeamSeason }> {
  const teamSeason = findTeamSeason(rosterData, await storedFor(date));
  return { round: publicRound(rosterData, teamSeason, date), teamSeason };
}

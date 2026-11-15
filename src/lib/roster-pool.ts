// The Roster Reveal team-seasons and lineups (the answers). Server-only in
// practice: import it only from server code (roster-data.ts, API routes,
// scripts). It doesn't import "server-only" so scripts/backfill-rounds.mts can
// use it. Built by scripts/build_roster_data.py.
import raw from "@/data/roster.json";
import nbaRaw from "@/data/nba/roster.json";
import type { RosterData } from "./roster";
import type { Sport } from "./sport";

/** Baseball's team-seasons. */
export const rosterData = raw as unknown as RosterData;
export const nbaRosterData = nbaRaw as unknown as RosterData;

export const rosterDataFor = (sport: Sport): RosterData => (sport === "nba" ? nbaRosterData : rosterData);

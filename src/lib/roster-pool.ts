// The Roster Reveal team-seasons and lineups (the answers). Server-only in
// practice: import it only from server code (roster-data.ts, API routes,
// scripts). It doesn't import "server-only" so scripts/backfill-rounds.mts can
// use it. Built by scripts/build_roster_data.py.
import raw from "@/data/roster.json";
import type { RosterData } from "./roster";

export const rosterData = raw as unknown as RosterData;

// The career leaderboards (the answers). Server-only in practice: import it only
// from server code (src/lib/data.ts, API routes, scripts). It doesn't import
// "server-only" so that scripts/backfill-rounds.mts can use it outside Next.js.
//
// Every stored round refers to a stat by key, so a stat must stay in this file
// even if it's later dropped from the pool of stats new rounds can pick.
import raw from "@/data/leaderboards.json";
import type { LeaderboardData } from "./types";

export const leaderboards = raw as unknown as LeaderboardData;

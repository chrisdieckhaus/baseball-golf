// The NBA kill switch. NBA pages and APIs exist only while the NBA_ENABLED
// environment variable is "1" or "true". Unset (the default) hides every NBA page
// (404), refuses NBA API calls, and removes the MLB | NBA switch from the nav.
//
// Set it per environment in Vercel (Project → Settings → Environment Variables)
// and redeploy for a change to take effect. The NBA data is built from
// Basketball-Reference, so it should stay off in public production until it's
// licensed (see research/nba-expansion-research.md in the project docs).
import type { Sport } from "./sport";

export function isNbaEnabled(): boolean {
  const v = process.env.NBA_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export const isSportEnabled = (sport: Sport) => sport === "mlb" || isNbaEnabled();

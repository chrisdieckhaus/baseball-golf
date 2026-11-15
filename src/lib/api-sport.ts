import "server-only";
import { isSportEnabled } from "./nba-flag";
import { parseSport, type Sport } from "./sport";

/**
 * The sport an API request is for: `sport` in the query string (GET) or the JSON
 * body (POST). Missing means baseball. An unknown sport is a 400; NBA while the
 * kill switch is off is a 404, as if the NBA games didn't exist.
 */
export function requestSport(value: unknown): { sport: Sport; error?: undefined } | { sport?: undefined; error: Response } {
  const sport = parseSport(value);
  if (!sport) return { error: Response.json({ error: "Unknown sport" }, { status: 400 }) };
  if (!isSportEnabled(sport)) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  return { sport };
}

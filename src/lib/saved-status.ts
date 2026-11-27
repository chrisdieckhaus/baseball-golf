// This browser's saved results from the database, by date, as they read in a
// list ("Score +34", "In progress · 1/3"). Used by the archives and the homepage.
import "server-only";
import { golfStatus, numberStatus, type Status } from "./archive-status";
import { getDb } from "./db";
import type { GameKey } from "./local-status";
import { getNumberProgress } from "./number-plays";
import { readPlayerId } from "./player-cookie";
import { getPlayerGolfProgress } from "./player-golf-plays";
import { getPlayerProgress } from "./plays";
import type { Sport } from "./sport";

/** Every saved result of one game for this browser's player, keyed by date. Empty without a database or a player cookie. */
export async function loadSavedStatuses(game: GameKey, sport: Sport, log = "[saved-status]"): Promise<Record<string, Status>> {
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return {};
  try {
    if (game === "golf") {
      const progress = await getPlayerProgress(db, me, sport);
      return Object.fromEntries([...progress].map(([date, p]) => [date, golfStatus(p.holesPlayed, p.totalScore)]));
    }
    if (game === "player") {
      const progress = await getPlayerGolfProgress(db, me, sport);
      return Object.fromEntries([...progress].map(([date, p]) => [date, golfStatus(p.holesPlayed, p.totalScore)]));
    }
    const progress = await getNumberProgress(db, me);
    return Object.fromEntries(
      [...progress].filter(([, p]) => p.ids.length > 0).map(([date, p]) => [date, numberStatus(p.ids.length, p.done, p.bust, p.score)]),
    );
  } catch (e) {
    console.error(`${log} Couldn't load this player's ${sport} plays`, e);
    return {};
  }
}

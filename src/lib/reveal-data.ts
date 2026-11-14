import "server-only";
import { getDb } from "./db";
import { findRevealPlayer, generateStoredRevealRound, REVEAL_LAUNCH_DATE, type RevealPlayer, type RevealRound } from "./reveal";
import { revealData } from "./reveal-pool";
import { getOrCreateStoredRevealRound } from "./reveal-rounds";
import { isValidDate, todayET } from "./round";

const cache = new Map<string, string>();

/** A daily Sports Revealer round exists for every date from its launch through today (ET). */
export function isPlayableRevealDate(date: unknown, today: string = todayET()): date is string {
  return typeof date === "string" && isValidDate(date) && date >= REVEAL_LAUNCH_DATE && date <= today;
}

async function playerIdFor(date: string, practiceSeed?: string): Promise<string> {
  if (practiceSeed) return generateStoredRevealRound(revealData, date, practiceSeed).playerId;
  const cached = cache.get(date);
  if (cached) return cached;
  const db = getDb();
  if (!db) return generateStoredRevealRound(revealData, date).playerId;
  try {
    const { playerId } = await getOrCreateStoredRevealRound(db, revealData, date);
    cache.set(date, playerId);
    return playerId;
  } catch (e) {
    console.error(`[reveal-rounds] Couldn't load the round for ${date}; generating it instead.`, e);
    return generateStoredRevealRound(revealData, date).playerId;
  }
}

/** The round for the browser plus the mystery player (server only). */
export async function getRevealRound(
  date: string,
  practiceSeed?: string,
): Promise<{ round: RevealRound; player: RevealPlayer }> {
  const player = findRevealPlayer(revealData, await playerIdFor(date, practiceSeed));
  return {
    round: { date, ...(practiceSeed ? { practiceSeed } : {}), type: player.type },
    player,
  };
}

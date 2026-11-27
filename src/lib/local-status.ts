// A round's result as this browser saved it in localStorage. The archives and
// the homepage use it for rounds the database doesn't have (played before
// plays were saved, or while the database was down). Browser only: call it
// after hydration. No "use client" so server code can import the types.
import { golfStatus, numberStatus, type Status } from "./archive-status";
import { namespaced, type Sport } from "./sport";

/** Every daily game. "player" is Baseball Golf's Player mode. */
export type GameKey = "golf" | "player" | "number";

/** Where each game's rounds live (before the sport's base path). */
export const GAME_PATHS: Record<GameKey, string> = {
  golf: "/golf",
  player: "/golf/player",
  number: "/number",
};

function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** This browser's result for a round, from what the game saved in localStorage. */
export function localStatus(game: GameKey, date: string, sport: Sport): Status {
  const read = (key: string) => readKey(namespaced(sport, key));
  if (game === "golf" || game === "player") {
    const saved = read(game === "golf" ? `baseball-golf:${date}` : `baseball-golf-player:${date}`) as ({ score?: number } | null)[] | null;
    if (!Array.isArray(saved) || saved.length === 0) return null;
    const played = saved.filter((r) => typeof r?.score === "number");
    const total = played.length === saved.length ? played.reduce((sum, r) => sum + r!.score!, 0) : null;
    return golfStatus(played.length, total, saved.length);
  }
  {
    const saved = read(`hit-the-number:${date}`) as {
      picks?: unknown[];
      done?: boolean;
      bust?: boolean;
      score?: number | null;
    } | null;
    if (!saved?.picks?.length) return null;
    return numberStatus(saved.picks.length, Boolean(saved.done), Boolean(saved.bust), saved.score ?? null);
  }
}

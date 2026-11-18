// A round's result as this browser saved it in localStorage. The archives and
// the homepage use it for rounds the database doesn't have (played before
// plays were saved, or while the database was down). Browser only: call it
// after hydration. No "use client" so server code can import the types.
import { golfStatus, kothStatus, numberStatus, rankStatus, rosterStatus, type Status } from "./archive-status";
import { namespaced, type Sport } from "./sport";

/** Every daily game. "player" is Baseball Golf's Player mode. */
export type GameKey = "golf" | "player" | "rank" | "roster" | "number" | "king";

/** Where each game's rounds live (before the sport's base path). */
export const GAME_PATHS: Record<GameKey, string> = {
  golf: "/golf",
  player: "/golf/player",
  rank: "/rank",
  roster: "/roster",
  number: "/number",
  king: "/king",
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
  if (game === "rank") {
    const saved = read(`stats-ranker:${date}`) as {
      reveal?: { score?: number };
    } | null;
    const score = saved?.reveal?.score;
    return typeof score === "number" ? rankStatus(score) : null;
  }
  if (game === "king") {
    const saved = read(`king-of-the-hill:${date}`) as { results?: unknown[]; done?: boolean; score?: number } | null;
    if (!saved?.results?.length) return null;
    return kothStatus(saved.results.length, Boolean(saved.done), saved.score ?? null);
  }
  if (game === "number") {
    const saved = read(`hit-the-number:${date}`) as {
      picks?: unknown[];
      done?: boolean;
      bust?: boolean;
      score?: number | null;
    } | null;
    if (!saved?.picks?.length) return null;
    return numberStatus(saved.picks.length, Boolean(saved.done), Boolean(saved.bust), saved.score ?? null);
  }
  const saved = read(`roster-reveal:${date}`) as { revealed?: unknown[]; done?: boolean; correct?: boolean } | null;
  if (!saved?.revealed) return null;
  return rosterStatus(saved.revealed.length, Boolean(saved.correct), Boolean(saved.done));
}

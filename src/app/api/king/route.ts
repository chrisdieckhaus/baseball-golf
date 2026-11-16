import { requestSport } from "@/lib/api-sport";
import { getDb } from "@/lib/db";
import { KOTH_MATCHUPS, validKothPicks, type StoredKothRound } from "@/lib/koth";
import { getKothRound, isPlayableKothDate, kothStateFor } from "@/lib/koth-data";
import { getKothPlay, getKothStats, recordKothPicks, type KothPlay } from "@/lib/koth-plays";
import { leaderboardsFor } from "@/lib/leaderboards";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { todayET } from "@/lib/round";
import type { Sport } from "@/lib/sport";

const noStore = { "Cache-Control": "private, no-store" };

async function withStats(stored: StoredKothRound, play: KothPlay, date: string, playerId: string, sport: Sport) {
  const state = kothStateFor(stored, play.picks, sport);
  const db = getDb();
  const stats = db && state.done ? await getKothStats(db, date, playerId, state.score, sport) : null;
  return { state, stats };
}

/** This browser's saved play on a daily round: { play: { state, stats } | null }. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { sport, error } = requestSport(params.get("sport"));
  if (error) return error;
  const date = params.get("date");
  if (!isPlayableKothDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const play = await getKothPlay(db, me, date, sport);
  if (!play || play.picks.length === 0) return Response.json({ play: null }, { headers: noStore });
  const { stored } = await getKothRound(date, sport);
  return Response.json({ play: await withStats(stored, play, date, me, sport) }, { headers: noStore });
}

/**
 * Make a pick. Body: { date, picks }, the player picked in each matchup so far,
 * the new one last. Returns every finished matchup with both numbers, the next
 * matchup (king's number only) and, after five, the score and how it compares.
 * Saved plays only grow: if the saved picks don't start the list, the saved play
 * comes back unchanged.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, picks, sport: rawSport } = (body ?? {}) as Record<string, unknown>;
  const { sport, error } = requestSport(rawSport);
  if (error) return error;
  if (!isPlayableKothDate(date)) return Response.json({ error: "There's no round for that date" }, { status: 400 });

  const { stored } = await getKothRound(date, sport);
  if (!validKothPicks(leaderboardsFor(sport), stored, picks)) {
    return Response.json({ error: "Invalid picks" }, { status: 400 });
  }
  const state = kothStateFor(stored, picks, sport);
  const play: KothPlay = { picks, score: state.done ? state.score : null, done: picks.length === KOTH_MATCHUPS };

  const db = getDb();
  if (!db) return Response.json({ state, stats: null });
  try {
    const me = await ensurePlayerId();
    const saved = await recordKothPicks(db, { playerId: me, roundDate: date, play, isLive: date === todayET() }, sport);
    return Response.json(await withStats(stored, saved, date, me, sport));
  } catch (e) {
    console.error("[api/king] Couldn't save the play", e);
    return Response.json({ state, stats: null });
  }
}

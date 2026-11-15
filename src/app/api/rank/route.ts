import { requestSport } from "@/lib/api-sport";
import { getDb } from "@/lib/db";
import { getRankPlay, getRankStats, recordRankPlay } from "@/lib/game-plays";
import { leaderboardsFor } from "@/lib/leaderboards";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { isValidOrder, scoreRankOrder } from "@/lib/rank";
import { getRankRound, isPlayableRankDate } from "@/lib/rank-data";
import { isValidDate, todayET } from "@/lib/round";

const noStore = { "Cache-Control": "private, no-store" };

/** This browser's saved play on a daily round, if any: { play: { order, reveal, stats } | null }. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { sport, error } = requestSport(params.get("sport"));
  if (error) return error;
  const date = params.get("date");
  if (!isPlayableRankDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const play = await getRankPlay(db, me, date, sport);
  if (!play) return Response.json({ play: null }, { headers: noStore });
  const round = await getRankRound(date, sport);
  const stats = await getRankStats(db, date, me, play.score, sport);
  return Response.json(
    { play: { order: play.order, reveal: scoreRankOrder(leaderboardsFor(sport), round, play.order), stats } },
    { headers: noStore },
  );
}

/**
 * Score a submitted order. One shot: a daily round's first order is saved for
 * this browser, and a later submission gets that saved play back instead.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, order, sport: rawSport } = (body ?? {}) as Record<string, unknown>;
  const { sport, error } = requestSport(rawSport);
  if (error) return error;
  const leaderboards = leaderboardsFor(sport);

  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!isPlayableRankDate(date)) {
    return Response.json({ error: "There's no round for that date" }, { status: 400 });
  }

  const round = await getRankRound(date, sport);
  if (!isValidOrder(round, order)) {
    return Response.json({ error: "Order must contain each of the round's players once" }, { status: 400 });
  }
  const reveal = scoreRankOrder(leaderboards, round, order);

  const db = getDb();
  if (!db) return Response.json({ order, reveal });
  try {
    const me = await ensurePlayerId();
    const { created, play } = await recordRankPlay(db, {
      playerId: me,
      roundDate: date,
      order,
      score: reveal.score,
      isLive: date === todayET(),
    }, sport);
    const stats = await getRankStats(db, date, me, play.score, sport);
    if (!created) {
      // Already played (another tab or device with this browser's id): the saved play stands.
      return Response.json({ order: play.order, reveal: scoreRankOrder(leaderboards, round, play.order), stats });
    }
    return Response.json({ order, reveal, stats });
  } catch (e) {
    console.error("[api/rank] Couldn't save the play", e);
  }
  return Response.json({ order, reveal });
}

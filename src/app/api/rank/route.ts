import { getDb } from "@/lib/db";
import { getRankPlay, recordRankPlay } from "@/lib/game-plays";
import { leaderboards } from "@/lib/leaderboards";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { isValidOrder, scoreRankOrder } from "@/lib/rank";
import { getRankRound, isPlayableRankDate } from "@/lib/rank-data";
import { isValidDate, isValidSeed, practiceEnabled, todayET } from "@/lib/round";

const noStore = { "Cache-Control": "private, no-store" };

/** This browser's saved play on a daily round, if any: { play: { order, reveal } | null }. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!isPlayableRankDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const play = await getRankPlay(db, me, date);
  if (!play) return Response.json({ play: null }, { headers: noStore });
  const round = await getRankRound(date);
  return Response.json(
    { play: { order: play.order, reveal: scoreRankOrder(leaderboards, round, play.order) } },
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
  const { date, seed, order } = (body ?? {}) as Record<string, unknown>;

  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  let practiceSeed: string | undefined;
  if (seed !== undefined && seed !== null) {
    if (!practiceEnabled()) return Response.json({ error: "Practice rounds are turned off" }, { status: 400 });
    if (!isValidSeed(seed)) return Response.json({ error: "Invalid practice round" }, { status: 400 });
    practiceSeed = seed;
  } else if (!isPlayableRankDate(date)) {
    return Response.json({ error: "There's no round for that date" }, { status: 400 });
  }

  const round = await getRankRound(date, practiceSeed);
  if (!isValidOrder(round, order)) {
    return Response.json({ error: "Order must contain each of the round's players once" }, { status: 400 });
  }
  const reveal = scoreRankOrder(leaderboards, round, order);

  const db = getDb();
  if (practiceSeed || !db) return Response.json({ order, reveal });
  try {
    const me = await ensurePlayerId();
    const { created, play } = await recordRankPlay(db, {
      playerId: me,
      roundDate: date,
      order,
      score: reveal.score,
      isLive: date === todayET(),
    });
    if (!created) {
      // Already played (another tab or device with this browser's id): the saved play stands.
      return Response.json({ order: play.order, reveal: scoreRankOrder(leaderboards, round, play.order) });
    }
  } catch (e) {
    console.error("[api/rank] Couldn't save the play", e);
  }
  return Response.json({ order, reveal });
}

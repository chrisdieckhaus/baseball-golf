import { leaderboards } from "@/lib/leaderboards";
import { isValidOrder, scoreRankOrder } from "@/lib/rank";
import { getRankRound, isPlayableRankDate } from "@/lib/rank-data";
import { isValidDate, isValidSeed, practiceEnabled } from "@/lib/round";

/** Score a submitted order. One shot: the client locks the round after this. */
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
  return Response.json({ reveal: scoreRankOrder(leaderboards, round, order) });
}

import { getDailyRound, resultsFromPlay } from "@/lib/data";
import { getDb } from "@/lib/db";
import { readPlayerId } from "@/lib/player-cookie";
import { getPlay, getRoundStats } from "@/lib/plays";
import { HOLES_PER_ROUND, isPlayableDate } from "@/lib/round";
import type { PlayState } from "@/lib/types";

/** This browser's saved progress on a daily round, plus its percentile once finished. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!isPlayableDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  const headers = { "Cache-Control": "private, no-store" };
  const empty: PlayState = { results: Array(HOLES_PER_ROUND).fill(null), stats: null };

  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ ...empty, enabled: Boolean(db) }, { headers });

  const play = await getPlay(db, me, date);
  if (!play) return Response.json({ ...empty, enabled: true }, { headers });

  const state: PlayState = {
    results: resultsFromPlay(await getDailyRound(date), play),
    stats: play.totalScore === null ? null : await getRoundStats(db, date, me, play.totalScore),
  };
  return Response.json({ ...state, enabled: true }, { headers });
}

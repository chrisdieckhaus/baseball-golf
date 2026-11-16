import { getDb } from "@/lib/db";
import { validatePicks, type NumberRound } from "@/lib/number";
import { careerTotal, getNumberRound, isPlayableNumberDate, numberState } from "@/lib/number-data";
import { getNumberPlay, getNumberStats, recordNumberPicks, type NumberPlay } from "@/lib/number-plays";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { todayET } from "@/lib/round";

// Hit the Number is baseball only.
const notFound = () => Response.json({ error: "Not found" }, { status: 404 });
const noStore = { "Cache-Control": "private, no-store" };

async function withStats(round: NumberRound, play: NumberPlay, playerId: string) {
  const state = numberState(round, play.ids);
  const db = getDb();
  const stats =
    db && state.done
      ? await getNumberStats(db, round.date, playerId, { score: state.score, bust: state.bust }, round.target)
      : null;
  return { state, stats };
}

/** This browser's saved play on a daily round: { play: { state, stats } | null }. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("sport") && params.get("sport") !== "mlb") return notFound();
  const date = params.get("date");
  if (!isPlayableNumberDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const play = await getNumberPlay(db, me, date);
  if (!play || play.ids.length === 0) return Response.json({ play: null }, { headers: noStore });
  const round = await getNumberRound(date);
  return Response.json({ play: await withStats(round, play, me) }, { headers: noStore });
}

/**
 * Make a pick. Body: { date, picks }, every pick so far in order, the new one
 * last. Returns each pick's career total, the running total and, once the round
 * is done, the result. Saved plays only grow: if the saved picks don't start the
 * list (another tab got ahead), the saved play comes back unchanged.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, picks, sport } = (body ?? {}) as Record<string, unknown>;
  if (sport !== undefined && sport !== null && sport !== "mlb") return notFound();
  if (!isPlayableNumberDate(date)) return Response.json({ error: "There's no round for that date" }, { status: 400 });

  const round = await getNumberRound(date);
  const checked = validatePicks(picks, round.target, (id) => careerTotal(round.statKey, id));
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  const state = numberState(round, checked.ids);
  const play: NumberPlay = { ids: checked.ids, total: state.total, done: state.done, bust: state.bust, score: state.score };

  const db = getDb();
  if (!db) return Response.json({ state, stats: null });
  try {
    const me = await ensurePlayerId();
    const saved = await recordNumberPicks(db, { playerId: me, roundDate: date, play, isLive: date === todayET() });
    return Response.json(await withStats(round, saved, me));
  } catch (e) {
    console.error("[api/number] Couldn't save the play", e);
    return Response.json({ state, stats: null });
  }
}

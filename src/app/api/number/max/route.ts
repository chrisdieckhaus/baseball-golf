import { requestSport } from "@/lib/api-sport";
import { getDb } from "@/lib/db";
import type { NumberRound } from "@/lib/number";
import { getNumberRound, getPracticeRound, isPlayableNumberDate, maxState, validateMaxPicks } from "@/lib/number-data";
import { getMaxPlay, getMaxStats, recordMaxPicks, type MaxPlay } from "@/lib/number-max-plays";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { todayET } from "@/lib/round";

// Hit the Number's bonus round ("Max it out"). The page only opens it once the
// main round is done; the API doesn't need to enforce that (it's about spoilers,
// not cheating).
const noStore = { "Cache-Control": "private, no-store" };
const playPicks = (play: MaxPlay) => play.ids.map((id, i) => ({ id, slot: play.slots[i] }));

async function withStats(round: NumberRound, play: MaxPlay, playerId: string) {
  const state = maxState(round, playPicks(play));
  const db = getDb();
  const stats = db && state.done ? await getMaxStats(db, round.date, playerId, { total: state.total }, round.sport) : null;
  return { state, stats };
}

/** This browser's saved bonus round: { play: { state, stats } | null }. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { sport, error } = requestSport(params.get("sport"));
  if (error) return error;
  const date = params.get("date");
  if (!isPlayableNumberDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const round = await getNumberRound(date, sport);
  if (round.previewSlots || !round.slots) return Response.json({ play: null }, { headers: noStore });
  const play = await getMaxPlay(db, me, date, sport);
  if (!play || play.ids.length === 0) return Response.json({ play: null }, { headers: noStore });
  return Response.json({ play: await withStats(round, play, me) }, { headers: noStore });
}

/**
 * Make a pick. Body: { date (or practice), picks, sport? }, every pick so far as
 * { id, slot } in the order made, the new one last. Returns each pick's total and,
 * once all three slots are filled, the best three and how you compare.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, picks, practice, ...rest } = (body ?? {}) as Record<string, unknown>;
  const { sport, error } = requestSport(rest.sport);
  if (error) return error;

  let round: NumberRound;
  if (practice !== undefined) {
    const p = typeof practice === "string" ? getPracticeRound(practice, sport) : null;
    if (!p) return Response.json({ error: "Not found" }, { status: 404 });
    round = p;
  } else {
    if (!isPlayableNumberDate(date)) return Response.json({ error: "There's no round for that date" }, { status: 400 });
    round = await getNumberRound(date, sport);
  }

  const db = getDb();
  const saveable = db && !round.previewSlots && !round.practice;
  const me = saveable ? await ensurePlayerId() : null;
  const saved = db && me ? await getMaxPlay(db, me, round.date, sport) : null;
  if (saved?.done) return Response.json(await withStats(round, saved, me!));

  const checked = validateMaxPicks(round, picks, saved ? playPicks(saved) : []);
  if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });
  const state = maxState(round, checked.picks);
  if (!db || !me) return Response.json({ state, stats: null });
  try {
    const play: MaxPlay = {
      ids: checked.picks.map((p) => p.id),
      slots: checked.picks.map((p) => p.slot),
      total: state.total,
      done: state.done,
      percent: state.percent,
    };
    const stored = await recordMaxPicks(db, { playerId: me, roundDate: round.date, play, isLive: round.date === todayET() }, sport);
    return Response.json(await withStats(round, stored, me));
  } catch (e) {
    console.error("[api/number/max] Couldn't save the play", e);
    return Response.json({ state, stats: null });
  }
}

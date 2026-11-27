import { getDb } from "@/lib/db";
import { validateLineupPicks, type LineupRound } from "@/lib/lineup";
import {
  fitsSpot,
  getLineupRound,
  getPracticeRound,
  isKnownPlayer,
  isPlayableLineupDate,
  lineupState,
} from "@/lib/lineup-data";
import { getLineupPlay, getLineupStats, recordLineupPicks, type LineupPlay } from "@/lib/lineup-plays";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { todayET } from "@/lib/round";

const noStore = { "Cache-Control": "private, no-store" };
const playPicks = (play: LineupPlay) => play.ids.map((id, i) => ({ id, spot: play.spots[i] }));

async function withStats(round: LineupRound, play: LineupPlay, playerId: string) {
  const state = lineupState(round, playPicks(play));
  const db = getDb();
  const stats = db && state.done ? await getLineupStats(db, round.date, playerId, { total: state.total }) : null;
  return { state, stats };
}

/** This browser's saved card on a daily round: { play: { state, stats } | null }. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? undefined;
  if (!isPlayableLineupDate(date, todayET())) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const round = await getLineupRound(date);
  if (round.preview) return Response.json({ play: null }, { headers: noStore });
  const play = await getLineupPlay(db, me, date);
  if (!play || play.ids.length === 0) return Response.json({ play: null }, { headers: noStore });
  return Response.json({ play: await withStats(round, play, me) }, { headers: noStore });
}

/**
 * Make a pick. Body: { date, picks } (or { practice, picks } on previews), every
 * pick so far as { id, spot } in the order made, the new one last. Returns each
 * pick's career total and, once all nine spots are filled, the best lineup and
 * how you compare. Saved cards only grow and a finished card doesn't change.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, picks, practice } = (body ?? {}) as Record<string, unknown>;

  let round: LineupRound;
  if (practice !== undefined) {
    const p = getPracticeRound(String(practice));
    if (!p) return Response.json({ error: "Not found" }, { status: 404 });
    round = p;
  } else {
    if (typeof date !== "string" || !isPlayableLineupDate(date, todayET())) {
      return Response.json({ error: "There's no round for that date" }, { status: 400 });
    }
    round = await getLineupRound(date);
  }

  const db = getDb();
  const saveable = db && !round.preview && !round.practice;
  const me = saveable ? await ensurePlayerId() : null;
  const saved = db && me ? await getLineupPlay(db, me, round.date) : null;
  // A finished card doesn't change: send it back as it is.
  if (saved?.done) return Response.json(await withStats(round, saved, me!));

  const checked = validateLineupPicks(picks, saved ? playPicks(saved) : [], {
    known: isKnownPlayer,
    fits: (id, spot) => fitsSpot(id, spot, round.rules[spot]),
  });
  if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });

  const state = lineupState(round, checked.picks);
  if (!db || !me) return Response.json({ state, stats: null });
  try {
    const play: LineupPlay = {
      ids: checked.picks.map((p) => p.id),
      spots: checked.picks.map((p) => p.spot),
      total: state.total,
      done: state.done,
      percent: state.percent,
    };
    const stored = await recordLineupPicks(db, { playerId: me, roundDate: round.date, play, isLive: round.date === todayET() });
    return Response.json(await withStats(round, stored, me));
  } catch (e) {
    console.error("[api/lineup] Couldn't save the card", e);
    return Response.json({ state, stats: null });
  }
}

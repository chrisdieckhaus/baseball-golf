import { requestSport } from "@/lib/api-sport";
import { getDb } from "@/lib/db";
import { getRosterPlay, getRosterStats, recordRosterGuess, recordRosterReveal } from "@/lib/game-plays";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { isValidGuess, isValidRevealed, rosterResult, rosterState } from "@/lib/roster";
import { getRosterRound, isPlayableRosterDate } from "@/lib/roster-data";
import { isValidDate, todayET } from "@/lib/round";

const noStore = { "Cache-Control": "private, no-store" };

/** This browser's saved play on a daily round: { play: { state, stats } | null }. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { sport, error } = requestSport(params.get("sport"));
  if (error) return error;
  const date = params.get("date");
  if (!isPlayableRosterDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const play = await getRosterPlay(db, me, date, sport);
  if (!play) return Response.json({ play: null }, { headers: noStore });
  const { teamSeason } = await getRosterRound(date, sport);
  const state = rosterState(teamSeason, play.revealed, play.guess);
  const stats = play.done
    ? await getRosterStats(db, date, me, rosterResult(play.revealed, play.correct), sport)
    : null;
  return Response.json({ play: { state, stats } }, { headers: noStore });
}

/**
 * Reveal more players, or make the one guess.
 *
 * Body: { date, revealed, guess? }. Without a guess, returns the first
 * `revealed` players. With a guess, ends the round and returns the answer.
 * Daily rounds are saved for this browser: reveals only go up, the score uses
 * the most players ever revealed, and a second guess gets the saved play back.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, revealed, guess, sport: rawSport } = (body ?? {}) as Record<string, unknown>;
  const { sport, error } = requestSport(rawSport);
  if (error) return error;

  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!isPlayableRosterDate(date)) {
    return Response.json({ error: "There's no round for that date" }, { status: 400 });
  }

  const { round, teamSeason } = await getRosterRound(date, sport);
  if (!isValidRevealed(revealed)) return Response.json({ error: "Invalid reveal count" }, { status: 400 });
  if (guess !== undefined && guess !== null && !isValidGuess(round, guess)) {
    return Response.json({ error: "That team didn't play that season" }, { status: 400 });
  }
  const theGuess = typeof guess === "string" ? guess : null;

  const db = getDb();
  if (!db) return Response.json({ state: rosterState(teamSeason, revealed, theGuess), stats: null });

  try {
    const me = await ensurePlayerId();
    const isLive = date === todayET();
    const play = theGuess
      ? (await recordRosterGuess(db, {
          playerId: me,
          roundDate: date,
          revealed,
          guess: theGuess,
          answer: teamSeason.franchise,
          isLive,
        }, sport)).play
      : await recordRosterReveal(db, { playerId: me, roundDate: date, revealed, isLive }, sport);
    const state = rosterState(teamSeason, play.revealed, play.guess);
    const stats = play.done
      ? await getRosterStats(db, date, me, rosterResult(play.revealed, play.correct), sport)
      : null;
    return Response.json({ state, stats });
  } catch (e) {
    console.error("[api/roster] Couldn't save the play", e);
    return Response.json({ state: rosterState(teamSeason, revealed, theGuess), stats: null });
  }
}

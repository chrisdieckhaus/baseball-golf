import { getDb } from "@/lib/db";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { isValidRankGuess } from "@/lib/player-golf";
import { getPlayerRound, isPlayablePlayerDate, playerResultsFromPlay, scorePlayerGuess } from "@/lib/player-golf-data";
import { getPlayerGolfPlay, recordPlayerGolfGuess } from "@/lib/player-golf-plays";
import { getRoundStats } from "@/lib/plays";
import { HOLES_PER_ROUND, todayET } from "@/lib/round";

const noStore = { "Cache-Control": "private, no-store" };

/** This browser's saved progress on a Player mode round: { results, stats }. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!isPlayablePlayerDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const empty = { results: Array(HOLES_PER_ROUND).fill(null), stats: null };
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json(empty, { headers: noStore });
  const play = await getPlayerGolfPlay(db, me, date);
  if (!play) return Response.json(empty, { headers: noStore });
  const round = await getPlayerRound(date);
  return Response.json(
    {
      results: playerResultsFromPlay(round, play),
      stats: play.totalScore === null ? null : await getRoundStats(db, date, me, play.totalScore, "player_golf_plays"),
    },
    { headers: noStore },
  );
}

/** Body: { date, hole, guess }. Scores one hole's guess (a rank, 1–100) and saves it. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, hole, guess } = (body ?? {}) as Record<string, unknown>;
  if (!isPlayablePlayerDate(date)) return Response.json({ error: "There's no round for that date" }, { status: 400 });
  if (typeof hole !== "number" || !Number.isInteger(hole) || hole < 0 || hole >= HOLES_PER_ROUND) {
    return Response.json({ error: "Invalid hole" }, { status: 400 });
  }
  if (!isValidRankGuess(guess)) return Response.json({ error: "Pick a rank from 1 to 100" }, { status: 400 });

  const round = await getPlayerRound(date);
  const result = scorePlayerGuess(round, hole, guess);

  const db = getDb();
  if (!db) return Response.json({ result, stats: null });

  const me = await ensurePlayerId();
  const outcome = await recordPlayerGolfGuess(db, {
    playerId: me,
    roundDate: date,
    hole,
    guess,
    score: result.score,
    isLive: date === todayET(),
  });
  const total = outcome.play.totalScore;
  const stats = total === null ? null : await getRoundStats(db, date, me, total, "player_golf_plays");
  if (!outcome.ok) {
    // e.g. the hole was already played in another tab: send back the saved state instead.
    return Response.json(
      { error: "That hole has already been played", state: { results: playerResultsFromPlay(round, outcome.play), stats } },
      { status: 409 },
    );
  }
  return Response.json({ result, stats });
}

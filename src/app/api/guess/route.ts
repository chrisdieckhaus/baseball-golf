import { getRound, resultsFromPlay, scoreGuess } from "@/lib/data";
import { requestSport } from "@/lib/api-sport";
import { getDb } from "@/lib/db";
import { ensurePlayerId } from "@/lib/player-cookie";
import { getRoundStats, recordGuess } from "@/lib/plays";
import { HOLES_PER_ROUND, isPlayableDate, isValidDate, todayET } from "@/lib/round";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, hole, playerId, playerName, sport: rawSport } = (body ?? {}) as Record<string, unknown>;
  const { sport, error } = requestSport(rawSport);
  if (error) return error;

  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!isPlayableDate(date)) {
    // No peeking at future daily rounds, and no rounds from before launch.
    return Response.json({ error: "There's no round for that date" }, { status: 400 });
  }
  if (typeof hole !== "number" || !Number.isInteger(hole) || hole < 0 || hole >= HOLES_PER_ROUND) {
    return Response.json({ error: "Invalid hole" }, { status: 400 });
  }
  if (typeof playerId !== "string" || !/^[a-z0-9.'-]{1,20}$/i.test(playerId)) {
    return Response.json({ error: "Invalid player" }, { status: 400 });
  }
  const name = typeof playerName === "string" ? playerName.slice(0, 80) : playerId;

  const round = await getRound(date, sport);
  const result = scoreGuess(round, hole, playerId, name, sport);

  // Deployments without a database stay stateless.
  const db = getDb();
  if (!db) return Response.json({ result, stats: null });

  const me = await ensurePlayerId();
  const outcome = await recordGuess(db, {
    playerId: me,
    roundDate: date,
    hole,
    guessId: playerId,
    guessName: result.guess.name,
    score: result.score,
    isLive: date === todayET(),
  }, sport);

  if (!outcome.ok) {
    // e.g. the hole was already played in another tab: send back the saved state instead.
    const message =
      outcome.reason === "player_reused"
        ? "You've already used that player this round"
        : "That hole has already been played";
    const total = outcome.play.totalScore;
    return Response.json(
      {
        error: message,
        state: {
          results: resultsFromPlay(round, outcome.play, sport),
          stats: total === null ? null : await getRoundStats(db, date, me, total, "plays", sport),
        },
      },
      { status: 409 },
    );
  }

  const total = outcome.play.totalScore;
  return Response.json({ result, stats: total === null ? null : await getRoundStats(db, date, me, total, "plays", sport) });
}

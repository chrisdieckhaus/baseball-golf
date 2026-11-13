import { resultsFromPlay, scoreGuess } from "@/lib/data";
import { getDb } from "@/lib/db";
import { ensurePlayerId } from "@/lib/player-cookie";
import { getRoundStats, recordGuess } from "@/lib/plays";
import { HOLES_PER_ROUND, isValidDate, isValidSeed, practiceEnabled, todayET } from "@/lib/round";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, seed, hole, playerId, playerName } = (body ?? {}) as Record<string, unknown>;

  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  let practiceSeed: string | undefined;
  if (seed !== undefined && seed !== null) {
    if (!practiceEnabled()) {
      return Response.json({ error: "Practice rounds are turned off" }, { status: 400 });
    }
    if (!isValidSeed(seed)) {
      return Response.json({ error: "Invalid practice round" }, { status: 400 });
    }
    practiceSeed = seed;
  } else if (date > todayET()) {
    // Don't let anyone peek at future daily rounds.
    return Response.json({ error: "That round isn't available yet" }, { status: 400 });
  }
  if (typeof hole !== "number" || !Number.isInteger(hole) || hole < 0 || hole >= HOLES_PER_ROUND) {
    return Response.json({ error: "Invalid hole" }, { status: 400 });
  }
  if (typeof playerId !== "string" || !/^[a-z0-9.'-]{1,20}$/i.test(playerId)) {
    return Response.json({ error: "Invalid player" }, { status: 400 });
  }
  const name = typeof playerName === "string" ? playerName.slice(0, 80) : playerId;

  const result = scoreGuess(date, practiceSeed, hole, playerId, name);

  // Practice rounds, and deployments without a database, stay stateless.
  const db = getDb();
  if (practiceSeed || !db) return Response.json({ result, stats: null });

  const me = await ensurePlayerId();
  const outcome = await recordGuess(db, {
    playerId: me,
    roundDate: date,
    hole,
    guessId: playerId,
    guessName: result.guess.name,
    score: result.score,
    isLive: date === todayET(),
  });

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
          results: resultsFromPlay(date, outcome.play),
          stats: total === null ? null : await getRoundStats(db, date, me, total),
        },
      },
      { status: 409 },
    );
  }

  const total = outcome.play.totalScore;
  return Response.json({ result, stats: total === null ? null : await getRoundStats(db, date, me, total) });
}

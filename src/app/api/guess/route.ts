import { scoreGuess } from "@/lib/data";
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

  return Response.json(scoreGuess(date, practiceSeed, hole, playerId, name));
}

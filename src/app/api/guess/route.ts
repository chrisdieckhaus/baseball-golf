import { getRound, scoreGuess } from "@/lib/data";
import { HOLES_PER_ROUND, isValidDate, todayET } from "@/lib/round";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, hole, playerId, playerName } = (body ?? {}) as Record<string, unknown>;

  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  // Don't let anyone peek at future rounds.
  if (date > todayET()) {
    return Response.json({ error: "That round isn't available yet" }, { status: 400 });
  }
  if (typeof hole !== "number" || !Number.isInteger(hole) || hole < 0 || hole >= HOLES_PER_ROUND) {
    return Response.json({ error: "Invalid hole" }, { status: 400 });
  }
  if (typeof playerId !== "string" || !/^[a-z0-9.'-]{1,20}$/i.test(playerId)) {
    return Response.json({ error: "Invalid player" }, { status: 400 });
  }
  const name = typeof playerName === "string" ? playerName.slice(0, 80) : playerId;

  getRound(date); // validates the round can be generated
  return Response.json(scoreGuess(date, hole, playerId, name));
}

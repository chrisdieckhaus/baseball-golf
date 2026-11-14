import { isValidGuesses, revealState } from "@/lib/reveal";
import { getRevealRound, isPlayableRevealDate } from "@/lib/reveal-data";
import { isValidDate, isValidSeed, practiceEnabled } from "@/lib/round";

/**
 * Check a round's guesses so far and return what they unlock: the clues
 * revealed, whether it's solved, and the answer once the round is over.
 * The browser sends its whole guess list each time; the server keeps no state.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, seed, guesses } = (body ?? {}) as Record<string, unknown>;

  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  let practiceSeed: string | undefined;
  if (seed !== undefined && seed !== null) {
    if (!practiceEnabled()) return Response.json({ error: "Practice rounds are turned off" }, { status: 400 });
    if (!isValidSeed(seed)) return Response.json({ error: "Invalid practice round" }, { status: 400 });
    practiceSeed = seed;
  } else if (!isPlayableRevealDate(date)) {
    return Response.json({ error: "There's no round for that date" }, { status: 400 });
  }

  const { player } = await getRevealRound(date, practiceSeed);
  if (!isValidGuesses(player, guesses)) {
    return Response.json({ error: "Invalid guesses" }, { status: 400 });
  }
  return Response.json({ state: revealState(player, guesses) });
}

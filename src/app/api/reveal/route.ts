import { getDb } from "@/lib/db";
import { getRevealPlay, recordRevealGuesses } from "@/lib/game-plays";
import { ensurePlayerId, readPlayerId } from "@/lib/player-cookie";
import { isValidGuesses, revealState, SKIP } from "@/lib/reveal";
import { getRevealRound, isPlayableRevealDate } from "@/lib/reveal-data";
import { isValidDate, isValidSeed, practiceEnabled, todayET } from "@/lib/round";

const noStore = { "Cache-Control": "private, no-store" };

/** This browser's saved play on a daily round: { play: { guesses, names, state } | null }. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!isPlayableRevealDate(date)) return Response.json({ error: "Invalid date" }, { status: 400 });
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return Response.json({ play: null }, { headers: noStore });
  const play = await getRevealPlay(db, me, date);
  if (!play || play.guesses.length === 0) return Response.json({ play: null }, { headers: noStore });
  const { player } = await getRevealRound(date);
  return Response.json(
    { play: { guesses: play.guesses, names: play.names, state: revealState(player, play.guesses) } },
    { headers: noStore },
  );
}

/**
 * Check a round's guesses so far and return what they unlock: the clues
 * revealed, whether it's solved, and the answer once the round is over.
 * The browser sends its whole guess list (and the names, for display). Daily
 * rounds are saved for this browser; if the list doesn't extend the saved one
 * (say, two tabs), the saved play comes back instead.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { date, seed, guesses, names } = (body ?? {}) as Record<string, unknown>;

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
  const state = revealState(player, guesses);
  const nameList = guesses.map((g, i) => {
    const n = Array.isArray(names) ? names[i] : undefined;
    return g === SKIP ? "" : typeof n === "string" ? n.slice(0, 80) : g;
  });

  const db = getDb();
  if (practiceSeed || !db || guesses.length === 0) return Response.json({ guesses, names: nameList, state });
  try {
    const me = await ensurePlayerId();
    const { saved, play } = await recordRevealGuesses(db, {
      playerId: me,
      roundDate: date,
      guesses,
      names: nameList,
      solved: state.solved,
      done: state.done,
      isLive: date === todayET(),
    });
    if (!saved) {
      return Response.json({ guesses: play.guesses, names: play.names, state: revealState(player, play.guesses) });
    }
  } catch (e) {
    console.error("[api/reveal] Couldn't save the play", e);
  }
  return Response.json({ guesses, names: nameList, state });
}

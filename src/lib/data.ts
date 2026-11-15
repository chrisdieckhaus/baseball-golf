import "server-only";
import type { GuessResult, PlayState, Round } from "./types";
import type { StoredPlay } from "./plays";
import { getDb } from "./db";
import { leaderboards } from "./leaderboards";
import { generateRound } from "./round";
import { getOrCreateRound } from "./rounds";
import { formatValue, scoreHole, targetPlayers } from "./scoring";

export { leaderboards };

// A stored round never changes and the data only changes with a deploy, so each
// server instance keeps the rounds it has read.
const roundCache = new Map<string, Round>();

/**
 * The daily round for a date. Its stats and target ranks are read from the
 * database, and saved there the first time it's needed, so the round stays the
 * same even if the generator changes. Without a database (local dev), it's
 * generated on the fly.
 */
export async function getDailyRound(date: string): Promise<Round> {
  const cached = roundCache.get(date);
  if (cached) return cached;
  const db = getDb();
  if (!db) return generateRound(leaderboards, date);
  try {
    const round = await getOrCreateRound(db, leaderboards, date);
    roundCache.set(date, round);
    return round;
  } catch (e) {
    // Keep the game up if the database is briefly unreachable. Not cached, so the
    // stored round is used again as soon as the database is back.
    console.error(`[rounds] Couldn't load the round for ${date}; generating it instead.`, e);
    return generateRound(leaderboards, date);
  }
}

/** The daily round for a date. */
export function getRound(date: string): Promise<Round> {
  return getDailyRound(date);
}

/** Score a guess for one hole, against the current leaderboards. */
export function scoreGuess(round: Round, holeIndex: number, playerId: string, playerName: string): GuessResult {
  const hole = round.holes[holeIndex];
  const stat = leaderboards.stats[hole.statKey];
  const fmt = (v: number) => formatValue(v, stat.kind, stat.decimals);

  const guessEntry = stat.entries.find((e) => e.id === playerId) ?? null;
  const targets = targetPlayers(stat.entries, hole.targetRank);
  const hit = targets.some((e) => e.id === playerId);

  return {
    hole: holeIndex,
    score: hit ? 0 : scoreHole(hole.targetRank, guessEntry ? guessEntry.rank : null),
    guess: {
      id: playerId,
      name: guessEntry?.name ?? playerName,
      rank: guessEntry?.rank ?? null,
      value: guessEntry ? fmt(guessEntry.value) : null,
    },
    target: {
      rank: hole.targetRank,
      players: targets.map((e) => ({ name: e.name, value: fmt(e.value) })),
    },
  };
}

/**
 * Rebuild the reveal for each saved guess. Ranks and values come from the current
 * leaderboards, but the score is the one saved when the guess was made, so a
 * finished round's score never changes after a data refresh.
 */
export function resultsFromPlay(round: Round, play: StoredPlay | null): PlayState["results"] {
  return round.holes.map((_, i) => {
    const id = play?.guessIds[i];
    if (!id) return null;
    const result = scoreGuess(round, i, id, play!.guessNames[i] ?? id);
    const saved = play!.holeScores[i];
    return saved === null || saved === undefined ? result : { ...result, score: saved };
  });
}

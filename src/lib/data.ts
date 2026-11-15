import "server-only";
import type { GuessResult, PlayState, Round } from "./types";
import type { StoredPlay } from "./plays";
import { getDb } from "./db";
import { leaderboards, leaderboardsFor } from "./leaderboards";
import type { Sport } from "./sport";
import { generateRound } from "./round";
import { getOrCreateRound } from "./rounds";
import { formatValue, scoreHole, targetPlayers } from "./scoring";

export { leaderboards };

// A stored round never changes and the data only changes with a deploy, so each
// server instance keeps the rounds it has read.
const roundCache = new Map<string, Round>(); // keyed by `${sport}:${date}`

/**
 * The daily round for a date. Its stats and target ranks are read from the
 * database, and saved there the first time it's needed, so the round stays the
 * same even if the generator changes. Without a database (local dev), it's
 * generated on the fly.
 */
export async function getDailyRound(date: string, sport: Sport = "mlb"): Promise<Round> {
  const cacheKey = `${sport}:${date}`;
  const cached = roundCache.get(cacheKey);
  if (cached) return cached;
  const data = leaderboardsFor(sport);
  const db = getDb();
  if (!db) return generateRound(data, date, sport);
  try {
    const round = await getOrCreateRound(db, data, date, sport);
    roundCache.set(cacheKey, round);
    return round;
  } catch (e) {
    // Keep the game up if the database is briefly unreachable. Not cached, so the
    // stored round is used again as soon as the database is back.
    console.error(`[rounds] Couldn't load the ${sport} round for ${date}; generating it instead.`, e);
    return generateRound(data, date, sport);
  }
}

/** The daily round for a date. */
export function getRound(date: string, sport: Sport = "mlb"): Promise<Round> {
  return getDailyRound(date, sport);
}

/** Score a guess for one hole, against the current leaderboards. */
export function scoreGuess(
  round: Round,
  holeIndex: number,
  playerId: string,
  playerName: string,
  sport: Sport = "mlb",
): GuessResult {
  const hole = round.holes[holeIndex];
  const stat = leaderboardsFor(sport).stats[hole.statKey];
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
export function resultsFromPlay(round: Round, play: StoredPlay | null, sport: Sport = "mlb"): PlayState["results"] {
  return round.holes.map((_, i) => {
    const id = play?.guessIds[i];
    if (!id) return null;
    const result = scoreGuess(round, i, id, play!.guessNames[i] ?? id, sport);
    const saved = play!.holeScores[i];
    return saved === null || saved === undefined ? result : { ...result, score: saved };
  });
}

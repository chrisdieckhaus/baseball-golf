import "server-only";
import raw from "@/data/leaderboards.json";
import type { GuessResult, LeaderboardData, PlayState } from "./types";
import type { StoredPlay } from "./plays";
import { generateRound } from "./round";
import { formatValue, scoreHole } from "./scoring";

export const leaderboards = raw as unknown as LeaderboardData;

export function getRound(date: string, practiceSeed?: string) {
  return generateRound(leaderboards, date, practiceSeed);
}

/** Score a guess for one hole of a round (the daily round, or a practice round if seeded). */
export function scoreGuess(
  date: string,
  practiceSeed: string | undefined,
  holeIndex: number,
  playerId: string,
  playerName: string,
): GuessResult {
  const hole = getRound(date, practiceSeed).holes[holeIndex];
  const stat = leaderboards.stats[hole.statKey];
  const fmt = (v: number) => formatValue(v, stat.kind, stat.decimals);

  const guessEntry = stat.entries.find((e) => e.id === playerId) ?? null;
  const targets = stat.entries.filter((e) => e.rank === hole.targetRank);

  return {
    hole: holeIndex,
    score: scoreHole(hole.targetRank, guessEntry ? guessEntry.rank : null),
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

/** Rebuild the full reveal for each saved guess (stat values, the pin, etc.) from the leaderboards. */
export function resultsFromPlay(date: string, play: StoredPlay | null): PlayState["results"] {
  const holes = getRound(date).holes;
  return holes.map((_, i) => {
    const id = play?.guessIds[i];
    return id ? scoreGuess(date, undefined, i, id, play!.guessNames[i] ?? id) : null;
  });
}

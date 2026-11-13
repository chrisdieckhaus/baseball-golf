import "server-only";
import raw from "@/data/leaderboards.json";
import type { GuessResult, LeaderboardData } from "./types";
import { generateRound } from "./round";
import { formatValue, scoreHole } from "./scoring";

export const leaderboards = raw as unknown as LeaderboardData;

export function getRound(date: string) {
  return generateRound(leaderboards, date);
}

/** Score a guess for one hole of a date's round. */
export function scoreGuess(date: string, holeIndex: number, playerId: string, playerName: string): GuessResult {
  const hole = getRound(date).holes[holeIndex];
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

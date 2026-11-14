export type StatGroup = "Batting" | "Pitching";

export interface LeaderboardEntry {
  id: string;
  name: string;
  rank: number;
  value: number;
}

export interface Leaderboard {
  key: string;
  label: string;
  group: StatGroup;
  kind: "count" | "rate";
  decimals: number;
  lowerIsBetter: boolean;
  qualifier: string | null;
  entries: LeaderboardEntry[];
}

export interface LeaderboardData {
  source: string;
  throughSeason: number;
  maxRank: number;
  stats: Record<string, Leaderboard>;
}

/** A hole as shown to the player before guessing (no answers). */
export interface Hole {
  statKey: string;
  label: string;
  group: StatGroup;
  qualifier: string | null;
  targetRank: number;
}

export interface Round {
  date: string; // YYYY-MM-DD, America/New_York
  practiceSeed?: string; // set for practice (random, non-daily) rounds
  holes: Hole[];
}

export interface GuessResult {
  hole: number;
  score: number;
  guess: {
    id: string;
    name: string;
    rank: number | null; // null = unranked (or outside the stored top ranks)
    value: string | null;
  };
  target: {
    rank: number;
    players: { name: string; value: string }[];
  };
}

/** Compact player record served to the browser for autocomplete. */
export interface PlayerIndexEntry {
  id: string;
  n: string; // name
  y: string; // years active
  p: string; // primary position
  g: number; // games (used to rank suggestions)
}

/** How a finished round compares with everyone else who finished it on its day. */
export interface RoundStats {
  others: number; // other players who finished (guests included)
  worse: number; // of those, how many scored worse
  tied: number;
  percentBeaten: number | null; // null when nobody else has finished yet
  finishers: number; // everyone who has finished this round, the player included
  holeAverages: number[]; // average score on each hole among those finishers
  roundAverage: number; // average round total among those finishers
}

/** A player's saved progress on a round, as returned by GET /api/play. */
export interface PlayState {
  results: (GuessResult | null)[];
  stats: RoundStats | null; // set once the round is finished
}

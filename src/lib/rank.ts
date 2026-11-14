// Stats Ranker: a second daily game that shares Baseball Golf's data.
//
// Each day everyone gets the same stat and the same five players, shown in a
// shuffled order. You put them in order (best first) and submit once. Your score
// is how far off each player is from his true spot, added up. 0 is perfect.
//
// No "server-only" import, so scripts can use this file. The answers (values)
// never leave the server: the browser only gets names and ids.
import { hashString, mulberry32 } from "./round";
import { formatValue } from "./scoring";
import type { LeaderboardData, StatGroup } from "./types";

export const RANK_PLAYERS = 5;
/** Players are picked from this many ranks of the stat's leaderboard. */
export const RANK_POOL = 100;
/** The worst possible score: the order exactly reversed. */
export const RANK_MAX_SCORE = Math.floor((RANK_PLAYERS * RANK_PLAYERS) / 2);
/** The first Stats Ranker round (#1). */
export const RANK_LAUNCH_DATE = "2026-11-14";

export function rankRoundNumber(date: string): number {
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${RANK_LAUNCH_DATE}T00:00:00Z`)) / 86_400_000;
  return Math.round(days) + 1;
}

/** What gets saved for a daily round: the stat and the five player ids, in the order shown. */
export interface StoredRankRound {
  statKey: string;
  playerIds: string[];
}

/** A round as the browser sees it: no values, no ranks. */
export interface RankRound {
  date: string;
  practiceSeed?: string;
  statKey: string;
  label: string;
  group: StatGroup;
  qualifier: string | null;
  lowerIsBetter: boolean;
  players: { id: string; name: string }[];
}

export interface RankReveal {
  score: number;
  /**
   * The player's guessed order, with how far off each one was and which way he
   * needed to move: -1 = up (should be higher in the list), 1 = down, 0 = right.
   */
  guess: { id: string; name: string; off: number; dir: -1 | 0 | 1 }[];
  /** The true order, best first. */
  answer: { id: string; name: string; value: string; rank: number | null }[];
}

/**
 * Pick the stat and five players: one from each fifth of the stat's top
 * RANK_POOL (ranks 1–20, 21–40, 41–60, 61–80, 81–100), so every round
 * spans the leaderboard. They're shown alphabetically by last name (see
 * rankRoundFromStored); the stored order is shuffled so it doesn't follow the bands.
 */
export function generateStoredRankRound(data: LeaderboardData, date: string, practiceSeed?: string): StoredRankRound {
  const seedString = practiceSeed ? `stats-ranker:practice:${practiceSeed}` : `stats-ranker:${date}`;
  const rand = mulberry32(hashString(seedString));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const keys = Object.keys(data.stats).sort();
  const bandSize = RANK_POOL / RANK_PLAYERS;

  for (;;) {
    const statKey = pick(keys);
    const entries = data.stats[statKey].entries;
    const values = new Set<number>();
    const picked: string[] = [];
    for (let band = 0; band < RANK_PLAYERS; band++) {
      const lo = band * bandSize + 1;
      const hi = (band + 1) * bandSize;
      // Tied players share a rank, so they always land in the same band; the value
      // check is just a guard so there's exactly one right order.
      const candidates = entries.filter((e) => e.rank >= lo && e.rank <= hi && !values.has(e.value));
      if (candidates.length === 0) break;
      const e = pick(candidates);
      values.add(e.value);
      picked.push(e.id);
    }
    if (picked.length < RANK_PLAYERS) continue; // stat too short; try another

    // Fisher–Yates: show them in a random order.
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    return { statKey, playerIds: picked };
  }
}

/** Rebuild the playable round from what's stored, with names and labels from the current data. */
export function rankRoundFromStored(
  data: LeaderboardData,
  date: string,
  stored: StoredRankRound,
  practiceSeed?: string,
): RankRound {
  const stat = data.stats[stored.statKey];
  if (!stat) throw new Error(`Rank round ${date} uses stat "${stored.statKey}", which is missing from the leaderboards`);
  const names = playerNames(data);
  return {
    date,
    ...(practiceSeed ? { practiceSeed } : {}),
    statKey: stat.key,
    label: stat.label,
    group: stat.group,
    qualifier: stat.qualifier,
    lowerIsBetter: stat.lowerIsBetter,
    // Shown alphabetically by last name, so the starting order gives nothing away.
    players: stored.playerIds
      .map((id) => ({ id, name: names.get(id) ?? id }))
      .sort((a, b) => compareByLastName(a.name, b.name)),
  };
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i;

/** "Ken Griffey Jr." -> "Griffey". */
export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1];
}

function compareByLastName(a: string, b: string): number {
  return lastName(a).localeCompare(lastName(b), "en") || a.localeCompare(b, "en");
}

let nameCache: { data: LeaderboardData; names: Map<string, string> } | null = null;
function playerNames(data: LeaderboardData): Map<string, string> {
  if (nameCache?.data === data) return nameCache.names;
  const names = new Map<string, string>();
  for (const stat of Object.values(data.stats)) for (const e of stat.entries) names.set(e.id, e.name);
  nameCache = { data, names };
  return names;
}

/**
 * Score a submitted order against the current leaderboards.
 *
 * Each player's true spot is where his value sorts among the five. If a data
 * refresh ever makes two of them tie, either order counts as right for that
 * pair. A player who's dropped out of the stored leaderboard (possible for rate
 * stats after a refresh) sorts last.
 */
export function scoreRankOrder(data: LeaderboardData, round: RankRound, order: string[]): RankReveal {
  const stat = data.stats[round.statKey];
  const byId = new Map(stat.entries.map((e) => [e.id, e]));
  const names = new Map(round.players.map((p) => [p.id, p.name]));

  // Higher sortKey = better. Missing players get -Infinity (last).
  const sortKey = (id: string) => {
    const e = byId.get(id);
    if (!e) return -Infinity;
    return stat.lowerIsBetter ? -e.value : e.value;
  };
  const answerIds = [...round.players.map((p) => p.id)].sort((a, b) => sortKey(b) - sortKey(a));

  // The span of correct spots for each player: [first, last] among anyone he ties.
  const span = (id: string): [number, number] => {
    const k = sortKey(id);
    const first = answerIds.findIndex((x) => sortKey(x) === k);
    let last = first;
    while (last + 1 < answerIds.length && sortKey(answerIds[last + 1]) === k) last++;
    return [first, last];
  };

  const guess = order.map((id, pos) => {
    const [first, last] = span(id);
    const off = pos < first ? first - pos : pos > last ? pos - last : 0;
    const dir: -1 | 0 | 1 = off === 0 ? 0 : pos > last ? -1 : 1;
    return { id, name: names.get(id) ?? id, off, dir };
  });

  const fmt = (v: number) => formatValue(v, stat.kind, stat.decimals);
  return {
    score: guess.reduce((s, g) => s + g.off, 0),
    guess,
    answer: answerIds.map((id) => {
      const e = byId.get(id);
      return { id, name: names.get(id) ?? id, value: e ? fmt(e.value) : "—", rank: e?.rank ?? null };
    }),
  };
}

/** True if `order` is exactly the round's five players, each once. */
export function isValidOrder(round: RankRound, order: unknown): order is string[] {
  if (!Array.isArray(order) || order.length !== round.players.length) return false;
  const ids = new Set(round.players.map((p) => p.id));
  return new Set(order).size === order.length && order.every((id) => typeof id === "string" && ids.has(id));
}

/**
 * Spoiler-free share text: one line per spot, in the order you submitted,
 * showing which way each player needed to move. e.g.
 *
 *   Stats Ranker #3 · Nov 16, 2026
 *   ⬇️ 1
 *   ⬆️ 1
 *   ✅
 *   ✅
 *   ✅
 *   Off by 2
 *   https://…/rank
 */
export function rankShareLine(g: { off: number; dir: -1 | 0 | 1 }): string {
  if (g.off === 0) return "✅";
  return `${g.dir < 0 ? "⬆️" : "⬇️"} ${g.off}`;
}

export function buildRankShareText(round: RankRound, reveal: RankReveal, url: string): string {
  const date = new Date(`${round.date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const title = round.practiceSeed
    ? `Stats Ranker · Practice #${round.practiceSeed}`
    : `Stats Ranker #${rankRoundNumber(round.date)} · ${date}`;
  const line = reveal.score === 0 ? "Perfect order!" : `Off by ${reveal.score}`;
  return [title, ...reveal.guess.map(rankShareLine), line, url].join("\n");
}

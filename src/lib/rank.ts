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
export const RANK_POOL = 300;
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
  /** The player's guessed order, with how far off each one was. */
  guess: { id: string; name: string; off: number }[];
  /** The true order, best first. */
  answer: { id: string; name: string; value: string; rank: number | null }[];
}

/**
 * Pick the stat and five players. Picks five random players from the stat's top
 * RANK_POOL with distinct values, so there's exactly one right order.
 * (Smarter selection — spread of ranks, eras, recognizability — comes later.)
 */
export function generateStoredRankRound(data: LeaderboardData, date: string, practiceSeed?: string): StoredRankRound {
  const seedString = practiceSeed ? `stats-ranker:practice:${practiceSeed}` : `stats-ranker:${date}`;
  const rand = mulberry32(hashString(seedString));
  const keys = Object.keys(data.stats).sort();

  for (;;) {
    const statKey = keys[Math.floor(rand() * keys.length)];
    const pool = data.stats[statKey].entries.filter((e) => e.rank <= RANK_POOL);
    const picked: string[] = [];
    const values = new Set<number>();
    // Partial Fisher–Yates over a copy, skipping players who'd tie a value already picked.
    const deck = [...pool];
    for (let i = 0; i < deck.length && picked.length < RANK_PLAYERS; i++) {
      const j = i + Math.floor(rand() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
      if (values.has(deck[i].value)) continue;
      values.add(deck[i].value);
      picked.push(deck[i].id);
    }
    if (picked.length === RANK_PLAYERS) return { statKey, playerIds: picked };
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
    players: stored.playerIds.map((id) => ({ id, name: names.get(id) ?? id })),
  };
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
    return { id, name: names.get(id) ?? id, off };
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
 * Spoiler-free share text, e.g.
 *
 *   Stats Ranker #3 · Nov 16, 2026
 *   🟩🟩🟨🟧🟩
 *   Off by 4
 *   https://…/rank
 */
export function rankEmoji(off: number): string {
  if (off === 0) return "🟩";
  if (off === 1) return "🟨";
  if (off === 2) return "🟧";
  return "🟥";
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
  return [title, reveal.guess.map((g) => rankEmoji(g.off)).join(""), line, url].join("\n");
}

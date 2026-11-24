// Hit the Number's slot rules: "Played in the 1990s", "Played for the Astros",
// "Played in the AL", "Played first base", "Hall of Famer"...
//
// Any appearance qualifies (one game at first base makes a first baseman), and
// teams are franchises (the Brooklyn Dodgers count as Dodgers). The data comes
// from scripts/build_number_slots.py.
//
// No "server-only" import, so scripts/backfill-rounds.mts can use this file.
// It still must never be imported by client components: it holds every total.
import slotData from "../data/number-slots.json";
import raw from "../data/number.json";
import index from "../../public/players.json";
import { findSlotBullseyes, NUMBER_PICKS, numberStat, type SlotKind, type SlotRule } from "./number";
import { hashString, mulberry32 } from "./round";

interface SlotData {
  firstDecade: number;
  teams: { key: string; name: string }[];
  leagues: string[];
  positions: string[];
  awards: string[];
  /** id -> [decades, teams, leagues, positions, awards] bit masks */
  players: Record<string, [number, number, number, number, number]>;
}

const data = slotData as unknown as SlotData;
const totals = (raw as unknown as { totals: Record<string, Record<string, number>> }).totals;
/** Every pickable player, most games first (the order bullseye examples prefer). */
const playerIds = (index as unknown as { players: { id: string }[] }).players.map((p) => p.id);

const KIND_FIELD: Record<SlotKind, number> = { decade: 0, team: 1, league: 2, position: 3, award: 4 };

const POSITION_LABELS: Record<string, string> = {
  C: "Played catcher",
  "1B": "Played first base",
  "2B": "Played second base",
  "3B": "Played third base",
  SS: "Played shortstop",
  OF: "Played the outfield",
  DH: "Played DH",
};
const AWARD_LABELS: Record<string, string> = {
  HOF: "Hall of Famer",
  AS: "All-Star",
  ROY: "Rookie of the Year",
  MVP: "Won an MVP",
  CY: "Won a Cy Young",
  GG: "Won a Gold Glove",
};
/** Awards that only make sense for one kind of stat. */
const AWARD_GROUP: Record<string, "Batting" | "Pitching"> = { CY: "Pitching" };
const teamName = new Map(data.teams.map((t) => [t.key, t.name]));

/** The rule as the player reads it. */
export function slotLabel(rule: SlotRule): string {
  switch (rule.kind) {
    case "decade":
      return `Played in the ${rule.key}s`;
    case "team":
      return `Played for the ${teamName.get(rule.key) ?? rule.key}`;
    case "league":
      return `Played in the ${rule.key}`;
    case "position":
      return POSITION_LABELS[rule.key] ?? `Played ${rule.key}`;
    case "award":
      return AWARD_LABELS[rule.key] ?? rule.key;
  }
}

/** The bit for a rule within its kind's mask, or -1 if the rule is unknown. */
function ruleBit(rule: SlotRule): number {
  switch (rule.kind) {
    case "decade": {
      const year = Number(rule.key);
      return Number.isInteger(year) && year >= data.firstDecade ? (year - data.firstDecade) / 10 : -1;
    }
    case "team":
      return data.teams.findIndex((t) => t.key === rule.key);
    case "league":
      return data.leagues.indexOf(rule.key);
    case "position":
      return data.positions.indexOf(rule.key);
    case "award":
      return data.awards.indexOf(rule.key);
  }
}

/** Does this player fit the rule? */
export function fitsSlot(id: string, rule: SlotRule): boolean {
  const masks = data.players[id];
  const bit = ruleBit(rule);
  return Boolean(masks && bit >= 0 && masks[KIND_FIELD[rule.kind]] & (2 ** bit));
}

/**
 * Every rule a round can use. League rules (AL/NL) were dropped: nearly
 * everyone fits one. Pitching stats skip positions (pitchers rarely
 * play elsewhere); Cy Young is for pitching stats only.
 */
function rulesByKind(group: "Batting" | "Pitching"): [SlotKind, SlotRule[]][] {
  const decades: SlotRule[] = [];
  for (let y = 1900; y <= LATEST_DECADE; y += 10) decades.push({ kind: "decade", key: String(y) });
  const out: [SlotKind, SlotRule[]][] = [
    ["decade", decades],
    ["team", data.teams.map((t) => ({ kind: "team" as const, key: t.key }))],
    [
      "award",
      data.awards
        .filter((key) => (AWARD_GROUP[key] ?? group) === group)
        .map((key) => ({ kind: "award" as const, key })),
    ],
  ];
  if (group === "Batting") out.push(["position", data.positions.map((key) => ({ kind: "position" as const, key }))]);
  return out;
}

/**
 * Decade rules lean toward recent decades: a decade's chance halves every this
 * many years before the 2020s. The 2010s come up about 3/4 as often as the
 * 2020s, the 1990s about 2/5, the 1910s about 1/20.
 */
export const DECADE_HALF_LIFE = 25;
const LATEST_DECADE = 2020;

/** How likely a rule is to be drawn within its kind. */
export function ruleWeight(rule: SlotRule): number {
  return rule.kind === "decade" ? 0.5 ** ((LATEST_DECADE - Number(rule.key)) / DECADE_HALF_LIFE) : 1;
}

/** Each slot needs at least this many players with some of the stat. */
export const MIN_SLOT_POOL = 25;
const MAX_TRIES = 400;

/** Every player who fits at least one slot, with his total and a bit mask of the slots he fits. */
export function slotPlayers(statKey: string, rules: SlotRule[]): { id: string; value: number; fit: number }[] {
  const t = totals[statKey] ?? {};
  const out: { id: string; value: number; fit: number }[] = [];
  for (const id of playerIds) {
    let fit = 0;
    rules.forEach((r, i) => {
      if (fitsSlot(id, r)) fit |= 1 << i;
    });
    if (fit) out.push({ id, value: t[id] ?? 0, fit });
  }
  return out;
}

/**
 * The slot rules for a new round: three rules of three different kinds, in a
 * shuffled order, picked so that each slot has at least MIN_SLOT_POOL players
 * with some of the stat and at least one exact combo of three real totals
 * exists. Same date, stat and target, same rules. Null if nothing works.
 */
export function generateNumberSlots(date: string, statKey: string, target: number): SlotRule[] | null {
  const stat = numberStat(statKey);
  if (!stat) return null;
  const rand = mulberry32(hashString(`number:slots:${date}`));
  // A weighted draw: decades lean recent (ruleWeight), everything else is even.
  const pick = (items: SlotRule[]) => {
    const weights = items.map(ruleWeight);
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i];
    return items[items.length - 1];
  };
  const kinds = rulesByKind(stat.group);
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // Three different kinds, in random order.
    const order = [...kinds];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const rules = order.slice(0, NUMBER_PICKS).map(([, options]) => pick(options));
    const players = slotPlayers(statKey, rules);
    const pools = [0, 0, 0];
    for (const p of players) {
      if (p.value <= 0) continue;
      for (let i = 0; i < NUMBER_PICKS; i++) if (p.fit & (1 << i)) pools[i]++;
    }
    if (pools.some((n) => n < MIN_SLOT_POOL)) continue;
    const exact = findSlotBullseyes(players, target, { minValue: 1, wantExample: false, stopAtFirst: true });
    if (exact.count > 0) return rules;
  }
  return null;
}

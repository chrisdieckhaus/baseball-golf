// The sports the games can be played with. Baseball ("mlb") is the original;
// every game also has an NBA version under /nba.
//
// Baseball keeps every name it had before NBA was added: its routes, database
// tables, round seeds and localStorage keys are unchanged, so existing rounds,
// plays and shared links don't move. NBA gets an "nba" prefix on each.
//
// No "server-only" import: client components and scripts use this file too.

export type Sport = "mlb" | "nba";
export const SPORTS: Sport[] = ["mlb", "nba"];

export const isSport = (s: unknown): s is Sport => s === "mlb" || s === "nba";

/** Reads a `sport` value from a request (query string or JSON body). Missing means baseball. */
export function parseSport(s: unknown): Sport | null {
  if (s === undefined || s === null || s === "") return "mlb";
  return isSport(s) ? s : null;
}

/** Where a sport's pages live: "" for baseball (/golf), "/nba" for NBA (/nba/golf). */
export const basePath = (sport: Sport) => (sport === "nba" ? "/nba" : "");

/** A sport's database table: baseball's tables keep their names, NBA's are "nba_<name>". */
export type GameTable =
  | "plays"
  | "rounds"
  | "player_golf_rounds"
  | "player_golf_plays"
  | "number_rounds"
  | "number_plays"
  | "number_max_plays";
export const table = (sport: Sport, name: GameTable) => (sport === "nba" ? `nba_${name}` : name);

/** A seed or storage key in a sport's namespace: unchanged for baseball, "nba:" in front for NBA. */
export const namespaced = (sport: Sport, key: string) => (sport === "nba" ? `nba:${key}` : key);

/** Adds `sport=nba` to an API URL for NBA; baseball's URLs don't change. */
export function apiUrl(sport: Sport, path: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params);
  if (sport === "nba") q.set("sport", "nba");
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export interface SportCopy {
  /** Short name in the sport switch. */
  short: string;
  /** Baseball Golf's name for this sport. */
  golfName: string;
  /** "Baseball", "Basketball": the first word of the Golf title. */
  golfWord: string;
  /** "a daily baseball game" in page descriptions. */
  noun: string;
}

export const COPY: Record<Sport, SportCopy> = {
  mlb: { short: "MLB", golfName: "Baseball Golf", golfWord: "Baseball", noun: "baseball" },
  nba: { short: "NBA", golfName: "Basketball Golf", golfWord: "Basketball", noun: "basketball" },
};

/** How a season reads: baseball "1996"; NBA "1995–96" (data years are the year a season ended). */
export const seasonLabel = (sport: Sport, year: number) =>
  sport === "nba" ? `${year - 1}–${String(year).slice(-2)}` : String(year);

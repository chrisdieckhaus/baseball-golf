import type { Pool } from "pg";
import { TIME_ZONE } from "./round";

/** One game's play table, for the /stats page. */
interface GameSource {
  name: string;
  sport: "Baseball" | "Basketball";
  table: string;
  /** Stats Ranker plays are saved in one shot, so they have no started_at. */
  hasStartedAt: boolean;
}

const SOURCES: GameSource[] = [
  { name: "Baseball Golf", sport: "Baseball", table: "plays", hasStartedAt: true },
  { name: "Golf: Player mode", sport: "Baseball", table: "player_golf_plays", hasStartedAt: true },
  { name: "Stats Ranker", sport: "Baseball", table: "rank_plays", hasStartedAt: false },
  { name: "Roster Reveal", sport: "Baseball", table: "roster_plays", hasStartedAt: true },
  { name: "King of the Hill", sport: "Baseball", table: "koth_plays", hasStartedAt: true },
  { name: "Hit the Number", sport: "Baseball", table: "number_plays", hasStartedAt: true },
  { name: "Basketball Golf", sport: "Basketball", table: "nba_plays", hasStartedAt: true },
  { name: "Golf: Player mode", sport: "Basketball", table: "nba_player_golf_plays", hasStartedAt: true },
  { name: "Stats Ranker", sport: "Basketball", table: "nba_rank_plays", hasStartedAt: false },
  { name: "Roster Reveal", sport: "Basketball", table: "nba_roster_plays", hasStartedAt: true },
  { name: "King of the Hill", sport: "Basketball", table: "nba_koth_plays", hasStartedAt: true },
];

export interface GameUsage {
  name: string;
  sport: GameSource["sport"];
  /** Finished plays, by the day (ET) they were finished. Archive plays count. */
  today: number;
  yesterday: number;
  last7Days: number;
  allTime: number;
  /** Started today (ET) and not finished yet. */
  unfinishedToday: number;
}

export interface UsageStats {
  today: string;
  games: GameUsage[];
  /** Different browsers that finished at least one game today. */
  playersToday: number;
}

const day = (col: string) => `(${col} AT TIME ZONE '${TIME_ZONE}')::date`;

/** Submission counts for every game. `today` is YYYY-MM-DD in Eastern time. */
export async function getUsageStats(db: Pool, today: string): Promise<UsageStats> {
  const games = await Promise.all(
    SOURCES.map(async (s): Promise<GameUsage> => {
      const unfinished = s.hasStartedAt
        ? `count(*) FILTER (WHERE completed_at IS NULL AND ${day("started_at")} = $1::date)`
        : "0";
      const { rows } = await db.query(
        `SELECT
           count(*) FILTER (WHERE ${day("completed_at")} = $1::date) AS today,
           count(*) FILTER (WHERE ${day("completed_at")} = $1::date - 1) AS yesterday,
           count(*) FILTER (WHERE ${day("completed_at")} > $1::date - 7
                              AND ${day("completed_at")} <= $1::date) AS last7,
           count(*) FILTER (WHERE completed_at IS NOT NULL) AS all_time,
           ${unfinished} AS unfinished
         FROM ${s.table}`,
        [today],
      );
      const r = rows[0];
      return {
        name: s.name,
        sport: s.sport,
        today: Number(r.today),
        yesterday: Number(r.yesterday),
        last7Days: Number(r.last7),
        allTime: Number(r.all_time),
        unfinishedToday: Number(r.unfinished),
      };
    }),
  );

  const union = SOURCES.map(
    (s) => `SELECT player_id FROM ${s.table} WHERE ${day("completed_at")} = $1::date`,
  ).join(" UNION ");
  const { rows } = await db.query(`SELECT count(*) AS n FROM (${union}) AS t`, [today]);

  return { today, games, playersToday: Number(rows[0].n) };
}

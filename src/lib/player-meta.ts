// Years active and primary position of every ranked player, per sport. Like
// leaderboards.ts, no "server-only" import so scripts/backfill-rounds.mts can use it.
import raw from "@/data/player-meta.json";
import nbaRaw from "@/data/nba/player-meta.json";
import type { PlayerMeta } from "./player-golf";
import type { Sport } from "./sport";

export const playerMetaFor = (sport: Sport): PlayerMeta =>
  (sport === "nba" ? nbaRaw : raw) as unknown as PlayerMeta;

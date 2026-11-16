"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/archive.module.css";
import { golfStatus, numberStatus, rankStatus, rosterStatus, type Status } from "@/lib/archive-status";
import { basePath, namespaced, type Sport } from "@/lib/sport";

type GameKey = "golf" | "player" | "rank" | "roster" | "number";

/** Where each game's rounds live. "player" is Baseball Golf's Player mode. */
const PATHS: Record<GameKey, string> = {
  golf: "/golf",
  player: "/golf/player",
  rank: "/rank",
  roster: "/roster",
  number: "/number",
};

interface Props {
  game: GameKey;
  sport?: Sport;
  /** Previous daily rounds, newest first. */
  rounds: { date: string; number: number; label: string }[];
  /** This browser's saved plays from the database, by date. */
  saved: Record<string, Status>;
}


function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** This browser's result for a round, from what the game saved in localStorage. */
function statusFor(game: GameKey, date: string, sport: Sport): Status {
  const read = (key: string) => readKey(namespaced(sport, key));
  if (game === "golf" || game === "player") {
    const saved = read(game === "golf" ? `baseball-golf:${date}` : `baseball-golf-player:${date}`) as ({ score?: number } | null)[] | null;
    if (!Array.isArray(saved) || saved.length === 0) return null;
    const played = saved.filter((r) => typeof r?.score === "number");
    const total = played.length === saved.length ? played.reduce((sum, r) => sum + r!.score!, 0) : null;
    return golfStatus(played.length, total, saved.length);
  }
  if (game === "rank") {
    const saved = read(`stats-ranker:${date}`) as {
      reveal?: { score?: number };
    } | null;
    const score = saved?.reveal?.score;
    return typeof score === "number" ? rankStatus(score) : null;
  }
  if (game === "number") {
    const saved = read(`hit-the-number:${date}`) as {
      picks?: unknown[];
      done?: boolean;
      bust?: boolean;
      score?: number | null;
    } | null;
    if (!saved?.picks?.length) return null;
    return numberStatus(saved.picks.length, Boolean(saved.done), Boolean(saved.bust), saved.score ?? null);
  }
  const saved = read(`roster-reveal:${date}`) as { revealed?: unknown[]; done?: boolean; correct?: boolean } | null;
  if (!saved?.revealed) return null;
  return rosterStatus(saved.revealed.length, Boolean(saved.correct), Boolean(saved.done));
}

/**
 * The list of previous rounds for any of the games. Each row's
 * status comes from this browser's saved plays in the database, or, for rounds
 * played before plays were saved, from localStorage after the page loads.
 */
export default function LocalArchive({ game, sport = "mlb", rounds, saved }: Props) {
  const [statuses, setStatuses] = useState<Record<string, Status>>(saved);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after hydration
    setStatuses(Object.fromEntries(rounds.map((r) => [r.date, saved[r.date] ?? statusFor(game, r.date, sport)])));
  }, [game, rounds, saved, sport]);

  if (rounds.length === 0) return <p className={styles.empty}>No previous rounds yet. Check back tomorrow.</p>;

  return (
    <ol className={styles.list}>
      {rounds.map((r) => {
        const s = statuses[r.date];
        return (
          <li key={r.date}>
            <Link href={`${basePath(sport)}${PATHS[game]}?date=${r.date}`} className={styles.row}>
              <span className={styles.num}>#{r.number}</span>
              <span className={styles.date}>{r.label}</span>
              {s?.kind === "done" ? (
                <span className={styles.done}>
                  {s.text} {s.score !== undefined && <strong>{s.score}</strong>}
                </span>
              ) : s?.kind === "partial" ? (
                <span className={styles.partial}>{s.text}</span>
              ) : (
                <span className={styles.play}>Play →</span>
              )}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

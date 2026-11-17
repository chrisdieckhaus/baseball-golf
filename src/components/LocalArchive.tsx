"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/archive.module.css";
import type { Status } from "@/lib/archive-status";
import { GAME_PATHS as PATHS, localStatus as statusFor, type GameKey } from "@/lib/local-status";
import { basePath, type Sport } from "@/lib/sport";

interface Props {
  game: GameKey;
  sport?: Sport;
  /** Previous daily rounds, newest first. */
  rounds: { date: string; number: number; label: string }[];
  /** This browser's saved plays from the database, by date. */
  saved: Record<string, Status>;
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
                <span className={`${styles.done} ${s.bust ? styles.bust : ""}`}>
                  {s.text && `${s.text} `}
                  {s.score !== undefined && <strong>{s.score}</strong>}
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

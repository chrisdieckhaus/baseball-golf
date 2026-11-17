"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Status } from "@/lib/archive-status";
import { localStatus, type GameKey } from "@/lib/local-status";
import type { Sport } from "@/lib/sport";
import styles from "@/views/HomePage.module.css";

export interface DayGame {
  key: GameKey;
  name: string;
  pitch: string;
  /** The game's round number for this day. */
  number: number;
  /** The day's round. */
  href: string;
  archive: string;
  /** This browser's result from the database, if any. */
  saved: Status;
}

function Result({ status, isToday }: { status: Status; isToday: boolean }) {
  if (status?.kind === "done") {
    return (
      <span className={`${styles.result} ${status.bust || status.text === "Missed" ? styles.bust : ""}`}>
        {status.text && <span className={styles.resultText}>{status.text}</span>}
        {status.score !== undefined && <strong>{status.score}</strong>}
      </span>
    );
  }
  if (status?.kind === "partial") return <span className={styles.partial}>{status.text.replace("In progress · ", "")} · Finish →</span>;
  return <span className={styles.play}>{isToday ? "Play →" : "Play this round →"}</span>;
}

/**
 * The homepage's game cards for one day. Each shows the result saved in the
 * database, or, failing that, what this browser saved in localStorage (read
 * after hydration, like the archives).
 */
export default function DayResults({
  games,
  date,
  sport,
  isToday,
}: {
  games: DayGame[];
  date: string;
  sport: Sport;
  isToday: boolean;
}) {
  const [statuses, setStatuses] = useState<Status[]>(() => games.map((g) => g.saved));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after hydration
    setStatuses(games.map((g) => g.saved ?? localStatus(g.key, date, sport)));
  }, [games, date, sport]);

  const done = statuses.filter((s) => s?.kind === "done").length;

  return (
    <>
      <p className={styles.summary}>
        {done === games.length ? (
          <>
            <strong>All {games.length} done.</strong> {isToday ? "See you tomorrow." : ""}
          </>
        ) : (
          <>
            <strong>
              {done} of {games.length}
            </strong>{" "}
            played
          </>
        )}
      </p>
      <div className={styles.meter} aria-hidden>
        {statuses.map((s, i) => (
          <span key={games[i].key} className={s?.kind === "done" ? styles.pipDone : s?.kind === "partial" ? styles.pipPartial : styles.pip} />
        ))}
      </div>
      <ul className={styles.cards}>
        {games.map((g, i) => {
          const s = statuses[i];
          return (
            <li key={g.key} className={`${styles.card} ${s?.kind === "done" ? styles.cardDone : ""}`}>
              <Link href={g.href} className={styles.cardLink}>
                <span className={styles.cardHead}>
                  <span className={styles.name}>{g.name}</span>
                  <span className={styles.num}>#{g.number}</span>
                </span>
                <span className={styles.pitch}>{g.pitch}</span>
                <span className={styles.cardFoot}>
                  <Result status={s} isToday={isToday} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className={styles.archives}>
        Past rounds:{" "}
        {games.map((g, i) => (
          <span key={g.key}>
            {i > 0 && " · "}
            <Link href={g.archive}>{g.name.replace(/: Player$/, " (Player)")}</Link>
          </span>
        ))}
      </p>
    </>
  );
}

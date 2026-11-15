"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/archive/archive.module.css";

type GameKey = "rank" | "roster";

interface Props {
  game: GameKey;
  /** Previous daily rounds, newest first. */
  rounds: { date: string; number: number; label: string }[];
  /** This browser's saved plays from the database, by date. */
  saved: Record<string, Status>;
}

export type Status = { kind: "done" | "partial"; text: string; score?: number } | null;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** How Roster Reveal progress reads in the list. */
export function rosterStatus(revealed: number, correct: boolean, done: boolean): Status {
  if (done) return { kind: "done", text: correct ? `Got it after ${revealed}` : "Missed" };
  return { kind: "partial", text: `In progress · ${revealed} revealed` };
}

/** This browser's result for a round, from what the game saved in localStorage. */
function statusFor(game: GameKey, date: string): Status {
  if (game === "rank") {
    const saved = read(`stats-ranker:${date}`) as {
      reveal?: { score?: number };
    } | null;
    const score = saved?.reveal?.score;
    return typeof score === "number" ? { kind: "done", text: "Score", score } : null;
  }
  const saved = read(`roster-reveal:${date}`) as { revealed?: unknown[]; done?: boolean; correct?: boolean } | null;
  if (!saved?.revealed) return null;
  return rosterStatus(saved.revealed.length, Boolean(saved.correct), Boolean(saved.done));
}

/**
 * The list of previous rounds for Stats Ranker or Roster Reveal. Each row's
 * status comes from this browser's saved plays in the database, or, for rounds
 * played before plays were saved, from localStorage after the page loads.
 */
export default function LocalArchive({ game, rounds, saved }: Props) {
  const [statuses, setStatuses] = useState<Record<string, Status>>(saved);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after hydration
    setStatuses(Object.fromEntries(rounds.map((r) => [r.date, saved[r.date] ?? statusFor(game, r.date)])));
  }, [game, rounds, saved]);

  if (rounds.length === 0) return <p className={styles.empty}>No previous rounds yet. Check back tomorrow.</p>;

  return (
    <ol className={styles.list}>
      {rounds.map((r) => {
        const s = statuses[r.date];
        return (
          <li key={r.date}>
            <Link href={`/${game}?date=${r.date}`} className={styles.row}>
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

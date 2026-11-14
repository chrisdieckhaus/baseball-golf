"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { inningName } from "@/lib/reveal";
import styles from "@/app/archive/archive.module.css";

type GameKey = "rank" | "reveal";

interface Props {
  game: GameKey;
  /** Previous daily rounds, newest first. */
  rounds: { date: string; number: number; label: string }[];
}

type Status = { kind: "done" | "partial"; text: string; score?: number } | null;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
  const saved = read(`sports-revealer:${date}`) as {
    guesses?: string[];
    state?: { done?: boolean; solved?: boolean };
  } | null;
  const n = saved?.guesses?.length ?? 0;
  if (!saved?.state || n === 0) return null;
  if (saved.state.done) {
    return {
      kind: "done",
      text: saved.state.solved ? `Solved in the ${inningName(n)}` : "Struck out",
    };
  }
  return { kind: "partial", text: `In progress · ${inningName(n + 1)} inning` };
}

/**
 * The list of previous rounds for Stats Ranker or Sports Revealer. Those games
 * keep results in the browser, so each row's status comes from localStorage
 * after the page loads.
 */
export default function LocalArchive({ game, rounds }: Props) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after hydration
    setStatuses(Object.fromEntries(rounds.map((r) => [r.date, statusFor(game, r.date)])));
  }, [game, rounds]);

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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/archive/archive.module.css";
import { HOLES_PER_ROUND } from "@/lib/round";

type GameKey = "golf" | "rank" | "roster";

/** Where each game's rounds live: Baseball Golf is at the site root. */
const PATHS: Record<GameKey, string> = { golf: "/", rank: "/rank", roster: "/roster" };

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

/** How Baseball Golf progress reads in the list. */
export function golfStatus(holesPlayed: number, totalScore: number | null, holes = HOLES_PER_ROUND): Status {
  if (totalScore !== null) return { kind: "done", text: "Score", score: totalScore };
  if (holesPlayed > 0) return { kind: "partial", text: `In progress · ${holesPlayed}/${holes}` };
  return null;
}

/** How a Stats Ranker result reads in the list, in the game's own words: "Off by 3" or "Perfect". */
export function rankStatus(score: number): Status {
  return score === 0 ? { kind: "done", text: "Perfect" } : { kind: "done", text: "Off by", score };
}

/** How Roster Reveal progress reads in the list. */
export function rosterStatus(revealed: number, correct: boolean, done: boolean): Status {
  if (done) return { kind: "done", text: correct ? `Got it after ${revealed}` : "Missed" };
  return { kind: "partial", text: `In progress · ${revealed} revealed` };
}

/** This browser's result for a round, from what the game saved in localStorage. */
function statusFor(game: GameKey, date: string): Status {
  if (game === "golf") {
    const saved = read(`baseball-golf:${date}`) as ({ score?: number } | null)[] | null;
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
  const saved = read(`roster-reveal:${date}`) as { revealed?: unknown[]; done?: boolean; correct?: boolean } | null;
  if (!saved?.revealed) return null;
  return rosterStatus(saved.revealed.length, Boolean(saved.correct), Boolean(saved.done));
}

/**
 * The list of previous rounds for any of the games. Each row's
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
            <Link href={`${PATHS[game]}?date=${r.date}`} className={styles.row}>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import type { GuessResult, PlayerIndexEntry, Round } from "@/lib/types";
import { MAX_HOLE_SCORE, ordinal } from "@/lib/scoring";
import PlayerSearch from "./PlayerSearch";
import styles from "./Game.module.css";

const storageKey = (date: string) => `baseball-golf:${date}`;

function loadSaved(date: string): (GuessResult | null)[] | null {
  try {
    const raw = localStorage.getItem(storageKey(date));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(date: string, results: (GuessResult | null)[]) {
  try {
    localStorage.setItem(storageKey(date), JSON.stringify(results));
  } catch {
    // storage unavailable (private mode etc.) — progress just won't persist
  }
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function Game({ round }: { round: Round }) {
  const [results, setResults] = useState<(GuessResult | null)[]>(() => round.holes.map(() => null));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore today's progress after hydration. localStorage isn't available during
  // server rendering, so this has to happen in an effect to avoid a hydration mismatch.
  useEffect(() => {
    const saved = loadSaved(round.date);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && saved.length === round.holes.length) setResults(saved);
  }, [round.date, round.holes.length]);

  const current = results.findIndex((r) => r === null);
  const finished = current === -1;
  const usedIds = useMemo(() => new Set(results.filter(Boolean).map((r) => r!.guess.id)), [results]);
  const total = results.reduce((sum, r) => sum + (r?.score ?? 0), 0);

  async function guess(holeIndex: number, player: PlayerIndexEntry) {
    if (usedIds.has(player.id)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: round.date, hole: holeIndex, playerId: player.id, playerName: player.n }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const next = results.slice();
      next[holeIndex] = data as GuessResult;
      setResults(next);
      save(round.date, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.game}>
      <p className={styles.date}>{formatDate(round.date)}</p>

      <ol className={styles.holes}>
        {round.holes.map((hole, i) => {
          const result = results[i];
          const isCurrent = i === current;
          const locked = !result && !isCurrent;
          return (
            <li
              key={hole.statKey}
              className={`${styles.hole} ${isCurrent ? styles.holeCurrent : ""} ${locked ? styles.holeLocked : ""}`}
            >
              <div className={styles.holeHead}>
                <span className={styles.holeNum}>Hole {i + 1}</span>
                <span className={styles.holeGroup}>{hole.group}</span>
              </div>
              <h2 className={styles.prompt}>
                <span className={styles.rank}>{ordinal(hole.targetRank)}</span> all-time in career{" "}
                <span className={styles.stat}>{hole.label}</span>
              </h2>
              {hole.qualifier && <p className={styles.qualifier}>{hole.qualifier}</p>}

              {isCurrent && (
                <>
                  <PlayerSearch
                    key={`search-${i}`}
                    usedIds={usedIds}
                    disabled={pending}
                    onSubmit={(p) => guess(i, p)}
                  />
                  {error && <p className={styles.error}>{error}</p>}
                </>
              )}

              {result && (
                <div className={styles.result}>
                  <div className={styles.resultRows}>
                    <p>
                      <span className={styles.resultLabel}>Your pick</span>
                      <strong>{result.guess.name}</strong>{" "}
                      {result.guess.rank !== null ? (
                        <>
                          — {ordinal(result.guess.rank)} ({result.guess.value})
                        </>
                      ) : (
                        <span className={styles.muted}>— not in the top 300 (or didn&apos;t qualify)</span>
                      )}
                    </p>
                    <p>
                      <span className={styles.resultLabel}>The pin · {ordinal(result.target.rank)}</span>
                      {result.target.players.map((p, j) => (
                        <span key={p.name}>
                          {j > 0 && ", "}
                          <strong>{p.name}</strong> ({p.value})
                        </span>
                      ))}
                      {result.target.players.length > 1 && <span className={styles.muted}> — tied</span>}
                    </p>
                  </div>
                  <div className={`${styles.score} ${result.score === 0 ? styles.ace : ""}`}>
                    <span className={styles.scoreNum}>{result.score === 0 ? "ACE" : `+${result.score}`}</span>
                    {result.score === MAX_HOLE_SCORE && <span className={styles.scoreNote}>max</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.card} aria-label="Scorecard">
        <table className={styles.cardTable}>
          <thead>
            <tr>
              <th scope="row">Hole</th>
              {round.holes.map((_, i) => (
                <th key={i} scope="col">
                  {i + 1}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Score</th>
              {results.map((r, i) => (
                <td key={i}>{r ? r.score : "–"}</td>
              ))}
              <td className={styles.total}>{results.some(Boolean) ? total : "–"}</td>
            </tr>
          </tbody>
        </table>
        {finished && (
          <p className={styles.final}>
            Round complete: <strong>{total}</strong>
            {total === 0 ? " — a perfect round!" : ". Come back tomorrow for a new course."}
          </p>
        )}
      </div>
    </section>
  );
}

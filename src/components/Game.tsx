"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GuessResult, PlayerIndexEntry, PlayState, Round, RoundStats } from "@/lib/types";
import { MAX_HOLE_SCORE, ordinal } from "@/lib/scoring";
import { buildShareText, holeLabel } from "@/lib/share";
import { formatRoundDate, LAUNCH_DATE, roundNumber } from "@/lib/round";
import DayNav from "./DayNav";
import { GolfCompare } from "./CompareStats";
import PlayerSearch from "./PlayerSearch";
import ShareButton from "./ShareButton";
import styles from "./Game.module.css";

/** Progress is saved per round, by date. */
const storageKey = (round: Round) => `baseball-golf:${round.date}`;

function loadSaved(key: string): (GuessResult | null)[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key: string, results: (GuessResult | null)[]) {
  try {
    localStorage.setItem(key, JSON.stringify(results));
  } catch {
    // storage unavailable (private mode etc.) — progress just won't persist
  }
}

function GolfShare({ round, isToday, results }: { round: Round; isToday: boolean; results: GuessResult[] }) {
  // Previous rounds link to that exact round; today's round links to the game.
  const getText = () =>
    buildShareText({
      date: round.date,
      scores: results.map((r) => r.score),
      url: isToday ? `${window.location.origin}/golf` : `${window.location.origin}/golf?date=${round.date}`,
    });
  return (
    <ShareButton getText={getText} label="Share result" className={styles.shareBtn} />
  );
}

/** An average to one decimal place, dropping a trailing ".0" (12.4, 89). */
function formatNumber(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export default function Game({
  round,
  isToday,
  today,
}: {
  round: Round;
  isToday: boolean; // today's daily round (not a previous round)
  today: string;
}) {
  const key = storageKey(round);
  const [results, setResults] = useState<(GuessResult | null)[]>(() => round.holes.map(() => null));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RoundStats | null>(null);
  const [synced, setSynced] = useState(false);

  // Restore progress after hydration. localStorage isn't available during server
  // rendering, so this has to happen in an effect to avoid a hydration mismatch.
  // Daily rounds then load the saved state from the server, which is the source of truth
  // (it's what enforces one guess per hole) and also provides the percentile.
  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && saved.length === round.holes.length) setResults(saved);

    let cancelled = false;
    fetch(`/api/play?date=${round.date}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PlayState>) : null))
      .then((state) => {
        if (cancelled || !state) return;
        // Keep browser-only progress (from before the server tracked rounds) if the server has none.
        if (state.results.some(Boolean)) {
          setResults(state.results);
          save(key, state.results);
        }
        setStats(state.stats);
      })
      .catch(() => {
        // Offline or server error: keep whatever was saved in this browser.
      })
      .finally(() => {
        // Ready to play once this browser's saved play (if any) is in.
        if (!cancelled) setSynced(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, round.date, round.holes.length]);

  const current = results.findIndex((r) => r === null);
  const finished = current === -1;
  const usedIds = useMemo(() => new Set(results.filter(Boolean).map((r) => r!.guess.id)), [results]);
  const total = results.reduce((sum, r) => sum + (r?.score ?? 0), 0);
  // Averages of everyone who has finished, shown in the scorecard once this round is finished.
  const holeAverages = finished ? stats?.holeAverages : undefined;

  async function guess(holeIndex: number, player: PlayerIndexEntry) {
    if (usedIds.has(player.id)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: round.date,
          hole: holeIndex,
          playerId: player.id,
          playerName: player.n,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.state) {
        // The server already has this hole (e.g. played in another tab): show what it has.
        const state = data.state as PlayState;
        setResults(state.results);
        save(key, state.results);
        setStats(state.stats);
        setError(data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const next = results.slice();
      next[holeIndex] = data.result as GuessResult;
      setResults(next);
      save(key, next);
      if (data.stats) setStats(data.stats as RoundStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.game}>
      <div className={styles.dateBar}>
        <p className={styles.date}>
          #{roundNumber(round.date)} · {formatRoundDate(round.date)}
        </p>
        <Link href="/golf/archive" className={styles.archiveLink}>
          Play previous rounds
        </Link>
      </div>

      <ol className={`${styles.holes} ${synced ? "" : "syncing"}`} aria-busy={!synced}>
        {round.holes.map((hole, i) => {
          const result = results[i];
          const isCurrent = i === current;
          // Holes appear one at a time: the next hole shows up once the current one is played.
          if (!result && !isCurrent) return null;
          return (
            <li
              key={hole.statKey}
              className={`${styles.hole} ${isCurrent ? styles.holeCurrent : ""}`}
            >
              <p className={styles.kicker}>
                Hole {i + 1} · {hole.group}
              </p>
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
                    disabled={pending || !synced}
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
                    <span className={styles.scoreNum}>{holeLabel(result.score)}</span>
                    {result.score === MAX_HOLE_SCORE && <span className={styles.scoreNote}>max</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.card} aria-label="Scorecard">
        {finished && (
          <p className={styles.headline}>
            {total === 0 ? "Perfect round!" : `Total: ${total}`}
            <span> / {MAX_HOLE_SCORE * round.holes.length} max</span>
          </p>
        )}
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
                <td key={i}>{r ? holeLabel(r.score) : "–"}</td>
              ))}
              <td className={styles.total}>{results.some(Boolean) ? total : "–"}</td>
            </tr>
            {holeAverages && stats && (
              <tr className={styles.avgRow}>
                <th scope="row">Avg</th>
                {holeAverages.map((a, i) => (
                  <td key={i}>{formatNumber(a)}</td>
                ))}
                {/* The round average is in the compare panel below. */}
                <td className={styles.total} />
              </tr>
            )}
          </tbody>
        </table>
        {finished && stats && <GolfCompare stats={stats} isToday={isToday} />}
        {finished && <GolfShare round={round} isToday={isToday} results={results as GuessResult[]} />}
      </div>

      <nav className={styles.links}>
        {finished ? (
          // Finished the round: step to the day before or after.
          <DayNav path="/golf" date={round.date} today={today} firstDate={LAUNCH_DATE} className={styles.linkBtn} />
        ) : !isToday ? (
          <Link href="/golf">Today&apos;s round</Link>
        ) : null}
      </nav>
    </section>
  );
}

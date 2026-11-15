"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GuessResult, PlayerIndexEntry, PlayState, Round, RoundStats } from "@/lib/types";
import { MAX_HOLE_SCORE, ordinal } from "@/lib/scoring";
import { buildShareText } from "@/lib/share";
import { roundNumber } from "@/lib/round";
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
  // Previous rounds link to that exact round; today's round links to the site.
  const getText = () =>
    buildShareText({
      date: round.date,
      scores: results.map((r) => r.score),
      url: isToday ? window.location.origin : `${window.location.origin}/?date=${round.date}`,
    });
  return (
    <div className={styles.share}>
      <ShareButton getText={getText} label="Share score" className={styles.shareBtn} />
    </div>
  );
}

function PercentileLine({ stats, isToday }: { stats: RoundStats; isToday: boolean }) {
  // Everyone who has finished this round counts, whether they played it on its day or later.
  const who = isToday ? "who finished today" : stats.others === 1 ? "who's finished this round" : "who've finished this round";
  if (stats.percentBeaten === null) {
    return (
      <p className={styles.percentile}>
        You&apos;re the first to finish this round. Check back later to see how you stack up.
      </p>
    );
  }
  const others = stats.others.toLocaleString("en-US");
  return (
    <p className={styles.percentile}>
      You beat <strong>{stats.percentBeaten}%</strong> of the {others} other {stats.others === 1 ? "player" : "players"}{" "}
      {who}
      {stats.tied > 0 && <> (tied with {stats.tied.toLocaleString("en-US")})</>}.
    </p>
  );
}

/** An average to one decimal place, dropping a trailing ".0" (12.4, 89). */
function formatNumber(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
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

export default function Game({
  round,
  isToday,
}: {
  round: Round;
  isToday: boolean; // today's daily round (not a previous round)
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
          Round #{roundNumber(round.date)} · {formatDate(round.date)}
        </p>
        <Link href="/archive" className={styles.archiveBtn}>
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
            {holeAverages && stats && (
              <tr className={styles.avgRow}>
                <th scope="row">Avg</th>
                {holeAverages.map((a, i) => (
                  <td key={i}>{formatNumber(a)}</td>
                ))}
                <td className={styles.total}>{formatNumber(stats.roundAverage)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {finished && (
          <p className={styles.final}>
            Round complete: <strong>{total}</strong>
            {total === 0
              ? " — a perfect round!"
              : isToday
                ? ". Come back tomorrow for a new course."
                : "."}
          </p>
        )}
        {finished && stats && <PercentileLine stats={stats} isToday={isToday} />}
        {finished && <GolfShare round={round} isToday={isToday} results={results as GuessResult[]} />}
      </div>
    </section>
  );
}

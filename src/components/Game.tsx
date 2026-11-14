"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GuessResult, PlayerIndexEntry, PlayState, Round, RoundStats } from "@/lib/types";
import { MAX_HOLE_SCORE, ordinal } from "@/lib/scoring";
import { buildShareText } from "@/lib/share";
import { roundNumber } from "@/lib/round";
import PlayerSearch from "./PlayerSearch";
import styles from "./Game.module.css";

/** Progress is saved per round: the date for daily rounds, the seed for practice rounds. */
const storageKey = (round: Round) =>
  round.practiceSeed ? `baseball-golf:practice:${round.practiceSeed}` : `baseball-golf:${round.date}`;

function newPracticeSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

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

/** Phones and tablets get the native share sheet; desktops copy to the clipboard. */
function prefersShareSheet(): boolean {
  return (
    typeof navigator.share === "function" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: fall back to a hidden textarea.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

type ShareStatus = "idle" | "copied" | "failed";

function ShareButton({ round, isToday, results }: { round: Round; isToday: boolean; results: GuessResult[] }) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  async function share() {
    // Practice and previous rounds link to that exact round; today's round links to the site.
    const url = round.practiceSeed
      ? `${window.location.origin}/?seed=${round.practiceSeed}`
      : isToday
        ? window.location.origin
        : `${window.location.origin}/?date=${round.date}`;
    const text = buildShareText({
      date: round.date,
      practiceSeed: round.practiceSeed,
      scores: results.map((r) => r.score),
      url,
    });

    if (prefersShareSheet()) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user closed the sheet
        // otherwise fall through to copying
      }
    }

    if (await copyText(text)) {
      setStatus("copied");
      setFallbackText(null);
      setTimeout(() => setStatus("idle"), 2000);
    } else {
      // Couldn't reach the clipboard: show the text so it can be copied by hand.
      setStatus("failed");
      setFallbackText(text);
    }
  }

  return (
    <div className={styles.share}>
      <button className={styles.shareBtn} onClick={share}>
        {status === "copied" ? "Copied to clipboard ✓" : "Share score"}
      </button>
      {fallbackText && (
        <textarea
          className={styles.shareFallback}
          readOnly
          value={fallbackText}
          rows={fallbackText.split("\n").length}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Share text"
        />
      )}
    </div>
  );
}

function PercentileLine({ stats, isToday }: { stats: RoundStats; isToday: boolean }) {
  const day = isToday ? "today" : "that day";
  if (stats.percentBeaten === null) {
    return <p className={styles.percentile}>You&apos;re the first to finish this round {day}. Check back later to see how you stack up.</p>;
  }
  const others = stats.others.toLocaleString("en-US");
  return (
    <p className={styles.percentile}>
      You beat <strong>{stats.percentBeaten}%</strong> of the {others} other {stats.others === 1 ? "player" : "players"}{" "}
      who finished {day}
      {stats.tied > 0 && <> (tied with {stats.tied.toLocaleString("en-US")})</>}.
    </p>
  );
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
  practiceEnabled,
}: {
  round: Round;
  isToday: boolean; // today's daily round (not a previous round or a practice round)
  practiceEnabled: boolean;
}) {
  const router = useRouter();
  const key = storageKey(round);
  const isPractice = Boolean(round.practiceSeed);
  const [results, setResults] = useState<(GuessResult | null)[]>(() => round.holes.map(() => null));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RoundStats | null>(null);

  // Restore progress after hydration. localStorage isn't available during server
  // rendering, so this has to happen in an effect to avoid a hydration mismatch.
  // Daily rounds then load the saved state from the server, which is the source of truth
  // (it's what enforces one guess per hole) and also provides the percentile.
  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && saved.length === round.holes.length) setResults(saved);
    if (isPractice) return;

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
      });
    return () => {
      cancelled = true;
    };
  }, [key, round.date, round.holes.length, isPractice]);

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
        body: JSON.stringify({
          date: round.date,
          seed: round.practiceSeed,
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
        {isPractice ? (
          <p className={styles.date}>Practice round · #{round.practiceSeed}</p>
        ) : (
          <p className={styles.date}>
            Round #{roundNumber(round.date)} · {formatDate(round.date)}
          </p>
        )}
        <Link href="/archive" className={styles.archiveBtn}>
          Play previous rounds
        </Link>
      </div>
      {!isPractice && !isToday && (
        <p className={styles.pastNote}>
          You&apos;re playing a previous round. It doesn&apos;t count toward that day&apos;s percentile.{" "}
          <Link href="/">Play today&apos;s round</Link>
        </p>
      )}

      {practiceEnabled && (
        <div className={styles.practiceBar}>
          <button className={styles.practiceBtn} onClick={() => router.push(`/?seed=${newPracticeSeed()}`)}>
            ↻ New practice round
          </button>
          {isPractice && (
            <button className={styles.practiceLink} onClick={() => router.push("/")}>
              Back to today&apos;s round
            </button>
          )}
        </div>
      )}

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
            {total === 0
              ? " — a perfect round!"
              : isPractice
                ? ". Try another practice round?"
                : isToday
                  ? ". Come back tomorrow for a new course."
                  : "."}
          </p>
        )}
        {finished && !isPractice && stats && <PercentileLine stats={stats} isToday={isToday} />}
        {finished && <ShareButton round={round} isToday={isToday} results={results as GuessResult[]} />}
      </div>
    </section>
  );
}

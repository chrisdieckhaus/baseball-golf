"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PlayerGolfResult, PlayerRound } from "@/lib/player-golf";
import { PLAYER_GOLF_LAUNCH_DATE } from "@/lib/player-golf";
import { formatRoundDate, roundNumber } from "@/lib/round";
import { MAX_HOLE_SCORE, MAX_TARGET_RANK, ordinal } from "@/lib/scoring";
import { buildShareText, holeLabel, scoreLabel } from "@/lib/share";
import { apiUrl, basePath, namespaced, type Sport } from "@/lib/sport";
import type { RoundStats } from "@/lib/types";
import { GolfCompare } from "./CompareStats";
import DayNav from "./DayNav";
import ShareButton from "./ShareButton";
import styles from "./Game.module.css";
import own from "./PlayerGolfGame.module.css";

type Results = (PlayerGolfResult | null)[];

/** Progress is saved per round, by date. The archive reads this key too. */
export const playerStorageKey = (date: string, sport: Sport = "mlb") =>
  namespaced(sport, `baseball-golf-player:${date}`);

function loadSaved(key: string): Results | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key: string, results: Results) {
  try {
    localStorage.setItem(key, JSON.stringify(results));
  } catch {
    // storage unavailable (private mode etc.) — progress just won't persist
  }
}

const clamp = (n: number) =>
  Math.max(1, Math.min(MAX_TARGET_RANK, Math.round(n)));
const suffix = (n: number) => ordinal(n).replace(/^\d+/, "");

/** Pick a rank: −/+ buttons, a number box and a slider, then Guess. */
function RankPicker({
  disabled,
  onGuess,
}: {
  disabled: boolean;
  onGuess: (rank: number) => void;
}) {
  const [rank, setRank] = useState(50);
  const [text, setText] = useState("50");
  const set = (n: number) => {
    const v = clamp(n);
    setRank(v);
    setText(String(v));
  };
  const valid =
    /^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_TARGET_RANK;
  const guess = () => {
    if (!valid || disabled) return;
    onGuess(Number(text));
  };
  return (
    <div className={own.picker}>
      <div className={own.pickRow}>
        <button
          type="button"
          className={own.step}
          onClick={() => set(rank - 1)}
          aria-label="One rank higher (toward 1st)"
        >
          −
        </button>
        <label className={own.rankBox}>
          <span className={own.srOnly}>
            Your guess: his all-time rank, 1 to {MAX_TARGET_RANK}
          </span>
          <span className={own.rankLine}>
            <input
              className={own.rankInput}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_TARGET_RANK}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n))
                  setRank(clamp(n));
              }}
              onBlur={() => set(Number(text) || 1)}
              onKeyDown={(e) => {
                if (e.key === "Enter") guess();
              }}
            />
            <span className={own.ord} aria-hidden="true">
              {valid ? suffix(Number(text)) : ""}
            </span>
          </span>
          <span className={own.rankSuffix}>all-time</span>
        </label>
        <button
          type="button"
          className={own.step}
          onClick={() => set(rank + 1)}
          aria-label="One rank lower (toward 100th)"
        >
          +
        </button>
      </div>
      <label className={own.slider}>
        <span>Pick a rank</span>
        <input
          type="range"
          min={1}
          max={MAX_TARGET_RANK}
          value={rank}
          onChange={(e) => set(Number(e.target.value))}
        />
        <span className={own.ends}>
          <span>1st</span>
          <span>{ordinal(MAX_TARGET_RANK)}</span>
        </span>
      </label>
      <button
        type="button"
        className={own.guessBtn}
        onClick={guess}
        disabled={disabled || !valid}
      >
        Guess
      </button>
      <p className={own.fine}>
        One guess per hole. Your score is how many ranks you miss by.
      </p>
    </div>
  );
}

/** The reveal: his rank, the leaderboard around him, and who holds the rank you guessed. */
function Reveal({ result }: { result: PlayerGolfResult }) {
  const nearRanks = new Set(result.near.map((e) => e.rank));
  const holdersShown =
    result.atGuess.players.length > 0 && nearRanks.has(result.atGuess.rank);
  const youRank = holdersShown ? result.atGuess.rank : null;
  const farRows =
    result.atGuess.players.length > 0 && !holdersShown
      ? result.atGuess.players.map((p) => ({
          rank: result.atGuess.rank,
          name: p.name,
          value: p.value,
        }))
      : [];
  const farFirst = result.rank !== null && result.atGuess.rank < result.rank;
  const row = (
    e: { rank: number; name: string; value: string; him?: boolean },
    you: boolean,
    key: string,
  ) => (
    <li key={key} className={`${e.him ? own.him : ""} ${you ? own.you : ""}`}>
      <span className={own.r}>{ordinal(e.rank)}</span>
      <span className={own.n}>{e.name}</span>
      <span className={own.v}>{e.value}</span>
    </li>
  );
  const far = farRows.map((e, i) => row(e, true, `far-${i}`));
  const gap = farRows.length > 0 && (
    <li key="gap" className={own.gap} aria-hidden="true">
      ⋯
    </li>
  );
  const nearRows = result.near.map((e, i) =>
    row(e, !e.him && e.rank === youRank, `near-${i}`),
  );

  return (
    <div className={own.reveal}>
      <div className={styles.result}>
        <div className={styles.resultRows}>
          <p>
            <span className={styles.resultLabel}>Your guess</span>
            <strong>{ordinal(result.guess)}</strong>
          </p>
          <p>
            <span className={styles.resultLabel}>The answer</span>
            {result.rank !== null ? (
              <>
                <strong>
                  {result.tied ? "Tied for " : ""}
                  {ordinal(result.rank)}
                </strong>{" "}
                ({result.value})
              </>
            ) : (
              <span className={styles.muted}>no longer on the leaderboard</span>
            )}
          </p>
        </div>
        <div
          className={`${styles.score} ${result.score === 0 ? styles.ace : ""}`}
        >
          <span className={styles.scoreNum}>{holeLabel(result.score)}</span>
          {result.score === MAX_HOLE_SCORE && (
            <span className={styles.scoreNote}>max</span>
          )}
        </div>
      </div>
      {result.near.length > 0 && (
        <ol className={own.board} aria-label="The leaderboard around him">
          {farFirst ? [...far, gap, ...nearRows] : [...nearRows, gap, ...far]}
        </ol>
      )}
      <p className={own.atGuess}>
        At {ordinal(result.guess)}:{" "}
        {result.score === 0 ? (
          <strong>that&apos;s him.</strong>
        ) : result.atGuess.players.length === 0 ? (
          <span>nobody on the leaderboard.</span>
        ) : (
          <strong>
            {result.atGuess.players.length > 1 &&
            result.atGuess.rank !== result.guess
              ? `tied at ${ordinal(result.atGuess.rank)}: `
              : ""}
            {result.atGuess.players
              .map((p) => `${p.name} (${p.value})`)
              .join(", ")}
          </strong>
        )}
      </p>
    </div>
  );
}

export default function PlayerGolfGame({
  round,
  isToday,
  today,
  sport = "mlb",
}: {
  round: PlayerRound;
  isToday: boolean;
  today: string;
  sport?: Sport;
}) {
  const key = playerStorageKey(round.date, sport);
  const base = basePath(sport);
  const [results, setResults] = useState<Results>(() =>
    round.holes.map(() => null),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RoundStats | null>(null);
  const [synced, setSynced] = useState(false);

  // Restore this browser's copy after hydration, then the server's, which is the
  // source of truth (it enforces one guess per hole) and has the percentile.
  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
    if (saved && saved.length === round.holes.length) setResults(saved);
    let cancelled = false;
    fetch(apiUrl(sport, "/api/player-golf", { date: round.date }), { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((state: { results: Results; stats: RoundStats | null } | null) => {
        if (cancelled || !state) return;
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
        if (!cancelled) setSynced(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, round.date, round.holes.length, sport]);

  const current = results.findIndex((r) => r === null);
  const finished = current === -1;
  const total = results.reduce((sum, r) => sum + (r?.score ?? 0), 0);
  const holeAverages = finished ? stats?.holeAverages : undefined;

  async function submitGuess(hole: number, rank: number) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/player-golf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: round.date, hole, guess: rank, sport }),
      });
      const data = await res.json();
      if (res.status === 409 && data.state) {
        setResults(data.state.results);
        save(key, data.state.results);
        setStats(data.state.stats);
        setError(data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const next = results.slice();
      next[hole] = data.result as PlayerGolfResult;
      setResults(next);
      save(key, next);
      if (data.stats) setStats(data.stats as RoundStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  const getShareText = () =>
    buildShareText({
      date: round.date,
      scores: results.map((r) => r?.score ?? 0),
      url: isToday
        ? `${window.location.origin}${base}/golf/player`
        : `${window.location.origin}${base}/golf/player?date=${round.date}`,
      mode: "player",
      sport,
    });

  return (
    <section className={styles.game}>
      <div className={styles.dateBar}>
        <p className={styles.date}>
          #{roundNumber(round.date)} · {formatRoundDate(round.date)}
        </p>
        <Link href={`${base}/golf/player/archive`} className={styles.archiveLink}>
          Play previous rounds
        </Link>
      </div>

      <ol
        className={`${styles.holes} ${synced ? "" : "syncing"}`}
        aria-busy={!synced}
      >
        {round.holes.map((hole, i) => {
          const result = results[i];
          const isCurrent = i === current;
          if (!result && !isCurrent) return null;
          return (
            <li
              key={hole.statKey}
              className={`${styles.hole} ${isCurrent ? styles.holeCurrent : ""}`}
            >
              <p className={styles.kicker}>
                Hole {i + 1} · {hole.group}
              </p>
              <h2 className={styles.prompt}>{hole.player.name}</h2>
              {(hole.player.pos || hole.player.years) && (
                <p className={own.meta}>
                  {[hole.player.pos, hole.player.years]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className={own.question}>
                Where does he rank all-time in career{" "}
                <span className={styles.rank}>{hole.label}</span>?
              </p>
              {hole.qualifier && (
                <p className={styles.qualifier}>
                  {hole.qualifier}
                  {hole.lowerIsBetter ? " · lower is better" : ""}
                </p>
              )}
              {isCurrent && (
                <>
                  <RankPicker
                    key={`pick-${i}`}
                    disabled={pending || !synced}
                    onGuess={(r) => submitGuess(i, r)}
                  />
                  {error && <p className={styles.error}>{error}</p>}
                </>
              )}
              {result && <Reveal result={result} />}
            </li>
          );
        })}
      </ol>

      <div className={styles.card} aria-label="Scorecard">
        {finished && (
          <p className={styles.headline}>
            {total === 0 ? "Perfect round!" : `Total: ${scoreLabel(total)}`}
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
              <td className={styles.total}>
                {results.some(Boolean) ? scoreLabel(total) : "–"}
              </td>
            </tr>
            {holeAverages && stats && (
              <tr className={styles.avgRow}>
                <th scope="row">Avg</th>
                {holeAverages.map((a, i) => (
                  <td key={i}>{scoreLabel(a)}</td>
                ))}
                <td className={styles.total}>{scoreLabel(stats.roundAverage)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {finished && stats && <GolfCompare stats={stats} isToday={isToday} />}
        {finished && (
          <ShareButton
            getText={getShareText}
            label="Share result"
            className={styles.shareBtn}
          />
        )}
      </div>

      <nav className={styles.links}>
        {finished ? (
          <DayNav
            path={`${base}/golf/player`}
            date={round.date}
            today={today}
            firstDate={PLAYER_GOLF_LAUNCH_DATE}
            className={styles.linkBtn}
          />
        ) : !isToday ? (
          <Link href={`${base}/golf/player`}>Today&apos;s round</Link>
        ) : null}
      </nav>
    </section>
  );
}

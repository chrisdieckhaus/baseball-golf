"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KothCompare } from "@/components/CompareStats";
import DayNav from "@/components/DayNav";
import ShareButton from "@/components/ShareButton";
import {
  buildKothShareText,
  KOTH_LAUNCH_DATE,
  KOTH_LEVELS,
  KOTH_MATCHUPS,
  kothRoundNumber,
  type KothCard,
  type KothRound,
  type KothState,
} from "@/lib/koth";
import type { KothStats } from "@/lib/koth-plays";
import { formatRoundDate } from "@/lib/round";
import { apiUrl, basePath, namespaced, type Sport } from "@/lib/sport";
import styles from "./KothGame.module.css";

const storageKey = (date: string, sport: Sport) => namespaced(sport, `king-of-the-hill:${date}`);

function loadSaved(key: string): KothState | null {
  try {
    const raw = localStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as KothState) : null;
    return saved && Array.isArray(saved.results) ? saved : null;
  } catch {
    return null;
  }
}

function save(key: string, state: KothState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage unavailable — progress just won't persist in this browser
  }
}

function headline(score: number): string {
  if (score === KOTH_MATCHUPS) return "Perfect!";
  if (score >= 4) return "Sharp.";
  if (score >= 3) return "Not bad.";
  return "Tough day.";
}

interface Props {
  round: KothRound;
  initial: KothState;
  isToday: boolean;
  today: string;
  sport?: Sport;
}

export default function KothGame({ round, initial, isToday, today, sport = "mlb" }: Props) {
  const key = storageKey(round.date, sport);
  const base = basePath(sport);
  const [state, setState] = useState<KothState>(initial);
  const [stats, setStats] = useState<KothStats | null>(null);
  // After a pick, the finished matchup stays on screen until "Next matchup".
  const [revealing, setRevealing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply(next: KothState, nextStats?: KothStats | null) {
    setState(next);
    setStats(nextStats ?? null);
    save(key, next);
  }

  async function post(picks: string[]) {
    const res = await fetch("/api/king", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: round.date, picks, sport }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Something went wrong");
    return body as { state: KothState; stats: KothStats | null };
  }

  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
    if (saved) setState(saved);

    // The database has this browser's daily plays. Use whichever of the saved
    // play and this browser's copy is further along, and upload this browser's
    // picks if the database doesn't have them yet.
    let cancelled = false;
    fetch(apiUrl(sport, "/api/king", { date: round.date }), { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (body: { play: { state: KothState; stats: KothStats | null } | null } | null) => {
        if (!body || cancelled) return;
        const server = body.play;
        const localAhead = saved && saved.results.length > (server?.state.results.length ?? 0);
        if (localAhead && saved) {
          const b = await post(saved.results.map((r) => r.pickedId));
          if (!cancelled) apply(b.state, b.stats);
        } else if (server) {
          apply(server.state, server.stats);
        }
      })
      .catch(() => {
        // Offline or server error: keep what this browser saved.
      })
      .finally(() => {
        if (!cancelled) setSynced(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per round
  }, [key, round.date]);

  async function pick(id: string) {
    if (busy || !synced || state.done || revealing) return;
    setBusy(true);
    setError(null);
    try {
      const b = await post([...state.results.map((r) => r.pickedId), id]);
      apply(b.state, b.stats);
      setRevealing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function shareText(): string {
    const page = `${window.location.origin}${base}/king`;
    return buildKothShareText(round, state, isToday ? page : `${page}?date=${round.date}`, sport);
  }

  // What's on the table: the matchup just played (while revealing, or once the
  // round is done), otherwise the next one.
  const last = state.results.at(-1);
  const showingResult = (revealing || state.done) && last;
  const index = showingResult ? state.results.length - 1 : state.results.length;
  const king = showingResult ? last.king : state.next!.king;
  const challenger = showingResult ? last.challenger : state.next!.challenger;
  // Streak shown on the king's badge: wins before this matchup.
  const streak = showingResult ? kingStreakBefore(state, index) : state.next!.streak;

  function cardView(c: KothCard, isKing: boolean) {
    let cls = styles.player;
    let mark = null;
    if (showingResult) {
      cls += ` ${c.id === last.winnerId ? styles.winner : styles.loser}`;
      if (c.id === last.pickedId)
        mark = <span className={`${styles.mark} ${last.ok ? styles.markOk : styles.markNo}`}>{last.ok ? "✓" : "✗"}</span>;
    }
    const badge =
      isKing && index > 0 ? (
        <span className={styles.badge}>
          👑 King · {streak} {streak === 1 ? "win" : "wins"}
        </span>
      ) : (
        <span className={`${styles.badge} ${styles.badgeNew}`}>Challenger</span>
      );
    return (
      <button
        className={cls}
        onClick={() => pick(c.id)}
        disabled={Boolean(showingResult) || busy || !synced}
        aria-label={`${c.name}${c.value ? `, ${c.value}` : ""}`}
      >
        {mark}
        {badge}
        <span className={styles.name}>{c.name}</span>
        <span className={styles.pos}>{c.pos || " "}</span>
        <span className={`${styles.value} ${c.value ? "" : styles.hidden}`}>{c.value ?? "?"}</span>
        <span className={styles.unit}>{round.unit}</span>
      </button>
    );
  }

  return (
    <div className={styles.game}>
      <div className={styles.dateBar}>
        <p className={styles.date}>
          #{kothRoundNumber(round.date)} · {formatRoundDate(round.date)}
        </p>
        <Link href={`${base}/king/archive`} className={styles.archiveLink}>
          Play previous rounds
        </Link>
      </div>

      <ol className={styles.pips} aria-label="Matchups">
        {Array.from({ length: KOTH_MATCHUPS }, (_, i) => {
          const r = state.results[i];
          return (
            <li
              key={i}
              className={`${styles.pip} ${r ? (r.ok ? styles.pipOk : styles.pipNo) : ""} ${!r && i === state.results.length ? styles.pipNow : ""}`}
              aria-label={r ? `Matchup ${i + 1}: ${r.ok ? "right" : "wrong"}` : `Matchup ${i + 1}`}
            >
              {r ? (r.ok ? "✓" : "✗") : i + 1}
            </li>
          );
        })}
      </ol>

      <section className={`${styles.card} ${synced ? "" : "syncing"}`} aria-busy={!synced}>
        <p className={styles.kicker}>
          Matchup {index + 1} of {KOTH_MATCHUPS} · {KOTH_LEVELS[index]}
        </p>
        <h2 className={styles.question}>Who has {round.question}?</h2>
        {round.qualifier && <p className={styles.qualifier}>{round.qualifier}</p>}
        <div className={styles.versus}>
          {cardView(king, true)}
          <span className={styles.vs}>vs</span>
          {cardView(challenger, false)}
        </div>
        {revealing && !state.done && (
          <button className={styles.next} onClick={() => setRevealing(false)}>
            Next matchup
          </button>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </section>

      {state.done && (
        <section className={`${styles.card} ${styles.result}`}>
          <h2>{headline(state.score)}</h2>
          <p className={styles.sub}>
            {state.score} of {KOTH_MATCHUPS} right
          </p>
          <ol className={styles.recap}>
            {state.results.map((r, i) => {
              const winner = r.winnerId === r.king.id ? r.king : r.challenger;
              const loser = r.winnerId === r.king.id ? r.challenger : r.king;
              return (
                <li key={i}>
                  <span>{r.ok ? "✅" : "❌"}</span>
                  <span>
                    <strong>
                      {winner.name} {winner.value}
                    </strong>{" "}
                    · {loser.name} {loser.value}
                  </span>
                </li>
              );
            })}
          </ol>
          {stats && <KothCompare stats={stats} mine={state.score} isToday={isToday} />}
          <ShareButton getText={shareText} label="Share result" className={styles.shareBtn} />
        </section>
      )}

      <nav className={styles.links}>
        {state.done ? (
          <DayNav path={`${base}/king`} date={round.date} today={today} firstDate={KOTH_LAUNCH_DATE} className={styles.linkBtn} />
        ) : !isToday ? (
          <Link href={`${base}/king`}>Today&apos;s round</Link>
        ) : null}
      </nav>
    </div>
  );
}

/** The king's winning streak going into matchup `index`. */
function kingStreakBefore(state: KothState, index: number): number {
  let streak = 0;
  for (let i = 0; i < index; i++) {
    const r = state.results[i];
    streak = r.winnerId === r.king.id ? streak + 1 : 1;
  }
  return streak;
}

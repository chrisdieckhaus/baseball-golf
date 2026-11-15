"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RosterCompare } from "@/components/CompareStats";
import DayNav from "@/components/DayNav";
import ShareButton from "@/components/ShareButton";
import type { RosterStats } from "@/lib/game-plays";
import {
  buildRosterShareText,
  LINEUP_SIZE,
  ROSTER_LAUNCH_DATE,
  rosterRoundNumber,
  type RosterRound,
  type RosterState,
} from "@/lib/roster";
import { formatRoundDate } from "@/lib/round";
import styles from "./RosterGame.module.css";

const storageKey = (round: RosterRound) => `roster-reveal:${round.date}`;

function loadSaved(key: string): RosterState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key: string, state: RosterState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage unavailable — progress just won't persist in this browser
  }
}

function headline(state: RosterState): string {
  if (!state.correct) return "Swing and a miss";
  const n = state.revealed.length;
  if (n === 1) return "First pitch. Unreal.";
  if (n <= 3) return "Called it!";
  if (n < LINEUP_SIZE) return "Got it!";
  return "Got there!";
}

interface Props {
  round: RosterRound;
  initial: RosterState;
  isToday: boolean;
  today: string;
}

export default function RosterGame({ round, initial, isToday, today }: Props) {
  const key = storageKey(round);
  const [state, setState] = useState<RosterState>(initial);
  const [stats, setStats] = useState<RosterStats | null>(null);
  const [guessing, setGuessing] = useState(false);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(-1);

  function apply(next: RosterState, nextStats?: RosterStats | null) {
    setState(next);
    setStats(nextStats ?? null);
    save(key, next);
  }

  async function post(revealed: number, guess: string | null) {
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: round.date, revealed, guess }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Something went wrong");
    return body as { state: RosterState; stats: RosterStats | null };
  }

  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
    if (saved) setState(saved);

    // The database has this browser's daily plays. Use whichever of the saved
    // play and this browser's copy is further along, and upload this browser's
    // progress if the database doesn't have it yet.
    let cancelled = false;
    fetch(`/api/roster?date=${round.date}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (body: { play: { state: RosterState; stats: RosterStats | null } | null } | null) => {
        if (!body || cancelled) return;
        const server = body.play;
        const localAhead =
          saved && (!server || (saved.done && !server.state.done) || saved.revealed.length > server.state.revealed.length);
        if (localAhead && saved) {
          const b = await post(saved.revealed.length, saved.guess);
          if (!cancelled) apply(b.state, b.stats);
        } else if (server) {
          apply(server.state, server.stats);
        }
      })
      .catch(() => {
        // Offline or server error: keep what this browser saved.
      })
      .finally(() => {
        // Ready to play once this browser's saved play (if any) is in.
        if (!cancelled) setSynced(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per round
  }, [key, round.date]);

  async function reveal() {
    if (busy || !synced || state.done || state.revealed.length >= LINEUP_SIZE) return;
    setBusy(true);
    setError(null);
    try {
      const b = await post(state.revealed.length + 1, null);
      setFresh(state.revealed.length);
      apply(b.state, b.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function lockIn() {
    if (busy || !synced || state.done || !pick) return;
    setBusy(true);
    setError(null);
    try {
      const b = await post(state.revealed.length, pick);
      setGuessing(false);
      apply(b.state, b.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function shareText(): string {
    const url = isToday ? `${window.location.origin}/roster` : `${window.location.origin}/roster?date=${round.date}`;
    return buildRosterShareText(round, state, url);
  }

  const shown = state.done && state.answer ? state.answer.lineup : state.revealed;
  const n = state.revealed.length;
  const teamName = (f: string | null) => round.teams.find(([id]) => id === f)?.[1] ?? f;

  return (
    <div className={styles.game}>
      <div className={styles.dateBar}>
        <p className={styles.date}>
          #{rosterRoundNumber(round.date)} ·{" "}
          {formatRoundDate(round.date)}
        </p>
        <Link href="/roster/archive" className={styles.archiveLink}>
          Play previous rounds
        </Link>
      </div>

      <section className={`${styles.card} ${synced ? "" : "syncing"}`} aria-busy={!synced}>
        <p className={styles.kicker}>Starting lineup</p>
        <h2 className={styles.question}>Who&apos;s this {round.year} team?</h2>
        <ol className={styles.names}>
          {shown.map((p, i) => (
            <li
              key={i}
              className={`${i === fresh ? styles.fresh : ""} ${state.done && i >= n ? styles.unrevealed : ""}`}
            >
              <span className={styles.num}>{i + 1}</span>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.pos}>{p.pos}</span>
            </li>
          ))}
          {!state.done && n < LINEUP_SIZE && (
            <li className={styles.ghost}>
              <span className={styles.num}>{n + 1}</span>
              <span>Next player hidden</span>
              <span />
            </li>
          )}
        </ol>

        {!state.done && (
          <>
            <div className={styles.meter}>
              <span>
                {n} {n === 1 ? "player" : "players"} revealed
              </span>
              <span>{n < LINEUP_SIZE ? `${LINEUP_SIZE - n} more available` : "That's the whole lineup."}</span>
            </div>
            {!guessing ? (
              <div className={styles.btns}>
                <button className={styles.secondary} onClick={reveal} disabled={busy || n >= LINEUP_SIZE}>
                  Reveal next player
                </button>
                <button className={styles.primary} onClick={() => synced && setGuessing(true)} disabled={busy}>
                  I know it
                </button>
              </div>
            ) : (
              <div className={styles.guess}>
                <select
                  className={styles.select}
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  aria-label="Team"
                >
                  <option value="">Pick a {round.year} team…</option>
                  {[...round.teams]
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([f, name]) => (
                      <option key={f} value={f}>
                        {name}
                      </option>
                    ))}
                </select>
                <div className={styles.btns}>
                  <button className={styles.secondary} onClick={() => setGuessing(false)} disabled={busy}>
                    Keep revealing
                  </button>
                  <button className={styles.primary} onClick={lockIn} disabled={busy || !pick}>
                    Lock in guess
                  </button>
                </div>
                <p className={styles.warn}>One guess. A wrong team ends the round.</p>
              </div>
            )}
            {error && <p className={styles.error}>{error}</p>}
          </>
        )}
      </section>

      {state.done && state.answer && (
        <section className={`${styles.card} ${styles.result}`}>
          <h2>{headline(state)}</h2>
          <p className={styles.answer}>
            {round.year} {state.answer.team}
          </p>
          <p>
            {state.answer.record}
            {state.answer.postseason && ` · ${state.answer.postseason}`}
          </p>
          <p>
            {state.correct
              ? `Got it after ${n} ${n === 1 ? "player" : "players"}.`
              : `You guessed the ${round.year} ${teamName(state.guess)} after ${n} ${n === 1 ? "player" : "players"}.`}
          </p>
          {stats && <RosterCompare stats={stats} mine={state.correct ? n : LINEUP_SIZE + 1} isToday={isToday} />}
          <ShareButton getText={shareText} label="Share result" className={styles.shareBtn} />
        </section>
      )}

      <nav className={styles.links}>
        {state.done ? (
          // Finished the round: step to the day before or after.
          <DayNav
            path="/roster"
            date={round.date}
            today={today}
            firstDate={ROSTER_LAUNCH_DATE}
            className={styles.linkBtn}
          />
        ) : !isToday ? (
          <Link href="/roster">Today&apos;s round</Link>
        ) : null}
      </nav>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PlayerSearch from "@/components/PlayerSearch";
import {
  buildRevealShareText,
  INNINGS,
  inningName,
  revealRoundNumber,
  SKIP,
  type RevealRound,
  type RevealState,
} from "@/lib/reveal";
import { ordinal } from "@/lib/scoring";
import type { PlayerIndexEntry } from "@/lib/types";
import styles from "./RevealGame.module.css";

const storageKey = (round: RevealRound) =>
  round.practiceSeed ? `sports-revealer:practice:${round.practiceSeed}` : `sports-revealer:${round.date}`;

interface Saved {
  guesses: string[];
  names: Record<string, string>;
  state: RevealState;
}

function loadSaved(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(key: string, saved: Saved) {
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // storage unavailable — progress just won't persist
  }
}

function headline(state: RevealState, innings: number): string {
  if (!state.solved) return "Struck out";
  if (innings === 1) return "First pitch. Unreal.";
  if (innings <= 3) return "Called it early!";
  if (innings < INNINGS) return "Got him!";
  return "Walk-off in the 9th!";
}

interface Props {
  round: RevealRound;
  initial: RevealState;
  isToday: boolean;
  practiceEnabled: boolean;
}

export default function RevealGame({ round, initial, isToday, practiceEnabled }: Props) {
  const router = useRouter();
  const key = storageKey(round);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [state, setState] = useState<RevealState>(initial);
  const [lastShown, setLastShown] = useState(initial.clues.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = loadSaved(key);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
      setGuesses(saved.guesses);
      setNames(saved.names);
      setState(saved.state);
      setLastShown(saved.state.clues.length);
    }
  }, [key]);

  async function submit(guess: string, name?: string) {
    if (busy || state.done) return;
    setBusy(true);
    setError(null);
    const next = [...guesses, guess];
    try {
      const res = await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: round.date, seed: round.practiceSeed ?? null, guesses: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      const nextNames = name ? { ...names, [guess]: name } : names;
      setLastShown(state.clues.length);
      setGuesses(next);
      setNames(nextNames);
      setState(body.state);
      save(key, { guesses: next, names: nextNames, state: body.state });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = round.practiceSeed
      ? `${window.location.origin}/reveal?seed=${round.practiceSeed}`
      : isToday
        ? `${window.location.origin}/reveal`
        : `${window.location.origin}/reveal?date=${round.date}`;
    const text = buildRevealShareText(round, guesses, state, url);
    if (typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your result:", text);
    }
  }

  const inning = Math.min(guesses.length + 1, INNINGS);
  const usedIds = new Set(guesses.filter((g) => g !== SKIP));
  const misses = guesses.filter((g, i) => !(state.solved && i === guesses.length - 1));

  return (
    <div className={styles.game}>
      <p className={styles.date}>
        {round.practiceSeed
          ? `Practice round #${round.practiceSeed}`
          : `#${revealRoundNumber(round.date)} · ${new Date(`${round.date}T12:00:00Z`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}`}
      </p>

      <section className={styles.board}>
        <div className={styles.meta}>
          <span>
            {round.type === "pitcher" ? "Pitcher" : "Position player"}
            {!state.done && ` · ${inningName(inning)} inning`}
          </span>
          <span className={styles.lights} aria-label={`${guesses.length} of ${INNINGS} guesses used`}>
            {Array.from({ length: INNINGS }, (_, i) => {
              const g = guesses[i];
              const cls =
                g === undefined
                  ? !state.done && i === guesses.length
                    ? styles.now
                    : ""
                  : state.solved && i === guesses.length - 1
                    ? styles.hit
                    : g === SKIP
                      ? styles.skipped
                      : styles.miss;
              return <span key={i} className={`${styles.light} ${cls}`} />;
            })}
          </span>
        </div>

        <ol className={styles.clues}>
          {Array.from({ length: INNINGS }, (_, i) => {
            const clue = state.clues[i];
            return (
              <li key={i} className={`${styles.clue} ${clue ? (i >= lastShown ? styles.fresh : "") : styles.lockedClue}`}>
                <span className={styles.num}>{i + 1}</span>
                <span className={styles.cell}>
                  {clue ? (
                    <>
                      <span className={styles.label}>{clue.label}</span>
                      <span className={styles.value}>{clue.value}</span>
                    </>
                  ) : (
                    <span className={styles.label}>Locked</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {misses.length > 0 && (
          <div className={styles.chips}>
            {misses.map((g, i) => (
              <span key={i} className={`${styles.chip} ${g === SKIP ? styles.chipSkip : ""}`}>
                {g === SKIP ? "Skipped" : `✗ ${names[g] ?? g}`}
              </span>
            ))}
          </div>
        )}
      </section>

      {!state.done && (
        <section className={styles.play}>
          <PlayerSearch
            key={guesses.length}
            usedIds={usedIds}
            disabled={busy}
            onSubmit={(p: PlayerIndexEntry) => submit(p.id, `${p.n}`)}
          />
          <button className={styles.skip} onClick={() => submit(SKIP)} disabled={busy}>
            Skip to the next clue
          </button>
          <p className={styles.hint}>One guess per inning. A wrong guess or a skip reveals the next clue.</p>
          {error && <p className={styles.error}>{error}</p>}
        </section>
      )}

      {state.done && state.answer && (
        <section className={styles.result}>
          <h2>{headline(state, guesses.length)}</h2>
          <p className={styles.who}>{state.answer.name}</p>
          <p>
            {state.answer.years} · {ordinal(state.answer.warRank)} in career WAR ({state.answer.war.toFixed(1)})
          </p>
          <p>
            {state.solved
              ? `Solved in the ${inningName(guesses.length)} inning.`
              : "Nine innings, no runs. Better luck tomorrow."}
          </p>
          <button className={styles.shareBtn} onClick={share}>
            {copied ? "Copied to clipboard ✓" : "Share result"}
          </button>
        </section>
      )}

      <nav className={styles.links}>
        {practiceEnabled && (
          <button
            className={styles.linkBtn}
            onClick={() => router.push(`/reveal?seed=${Math.random().toString(36).slice(2, 10)}`)}
          >
            ↻ New practice round
          </button>
        )}
        {round.practiceSeed || !isToday ? <Link href="/reveal">Today&apos;s round</Link> : null}
        <Link href="/">Play Baseball Golf →</Link>
        <Link href="/rank">Play Stats Ranker →</Link>
      </nav>
    </div>
  );
}

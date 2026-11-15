"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildRankShareText, RANK_LAUNCH_DATE, RANK_MAX_SCORE, rankRoundNumber, rankShareLine, type RankReveal, type RankRound } from "@/lib/rank";
import { RankCompare } from "@/components/CompareStats";
import DayNav from "@/components/DayNav";
import type { RankStats } from "@/lib/game-plays";
import { ordinal } from "@/lib/scoring";
import styles from "./RankGame.module.css";

const storageKey = (round: RankRound) =>
  round.practiceSeed ? `stats-ranker:practice:${round.practiceSeed}` : `stats-ranker:${round.date}`;

interface Saved {
  order: string[];
  reveal: RankReveal;
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
    // storage unavailable — the result just won't persist
  }
}

function endLabels(round: RankRound): [string, string] {
  if (round.lowerIsBetter) return [`Lowest ${round.label} (best)`, `Highest ${round.label}`];
  const counting = round.qualifier === null;
  return counting ? [`Most ${round.label}`, `Fewest ${round.label}`] : [`Highest ${round.label}`, `Lowest ${round.label}`];
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface Drag {
  id: string;
  from: number;
  startY: number;
  dy: number;
  rowH: number; // row height + gap
}

export default function RankGame({
  round,
  isToday,
  today,
  practiceEnabled,
}: {
  round: RankRound;
  isToday: boolean;
  today: string;
  practiceEnabled: boolean;
}) {
  const router = useRouter();
  const key = storageKey(round);
  const [order, setOrder] = useState<string[]>(round.players.map((p) => p.id));
  const [reveal, setReveal] = useState<RankReveal | null>(null);
  const [stats, setStats] = useState<RankStats | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const saved = loadSaved(key);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
      setOrder(saved.order);
      setReveal(saved.reveal);
    }
    if (round.practiceSeed) return;

    // The database has this browser's daily plays. Use the saved play if there
    // is one; if only this browser has it (played before plays were saved), upload it.
    let cancelled = false;
    const apply = (next: { order: string[]; reveal: RankReveal; stats?: RankStats | null }) => {
      if (cancelled) return;
      setOrder(next.order);
      setReveal(next.reveal);
      setStats(next.stats ?? null);
      save(key, { order: next.order, reveal: next.reveal });
    };
    fetch(`/api/rank?date=${round.date}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { play: { order: string[]; reveal: RankReveal; stats: RankStats | null } | null } | null) => {
        if (!body || cancelled) return;
        if (body.play) return apply(body.play);
        if (saved) {
          return fetch("/api/rank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: round.date, seed: null, order: saved.order }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((b) => b && apply(b));
        }
      })
      .catch(() => {
        // Offline or server error: keep what this browser saved.
      });
    return () => {
      cancelled = true;
    };
  }, [key, round.date, round.practiceSeed]);

  const names = new Map(round.players.map((p) => [p.id, p.name]));
  const [topLabel, bottomLabel] = endLabels(round);
  const locked = reveal !== null;

  const targetIndex = (d: Drag) => Math.max(0, Math.min(order.length - 1, d.from + Math.round(d.dy / d.rowH)));

  function onPointerDown(e: React.PointerEvent<HTMLLIElement>, id: string, index: number) {
    if (locked || (e.target as HTMLElement).closest("button")) return;
    const li = e.currentTarget;
    const next = li.nextElementSibling as HTMLElement | null;
    const rowH = next ? next.offsetTop - li.offsetTop : li.offsetHeight + 8;
    li.setPointerCapture(e.pointerId);
    setDrag({ id, from: index, startY: e.clientY, dy: 0, rowH });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ ...drag, dy: e.clientY - drag.startY });
  }

  function onPointerUp() {
    if (!drag) return;
    const to = targetIndex(drag);
    if (to !== drag.from) setOrder(moveItem(order, drag.from, to));
    setDrag(null);
  }

  function nudge(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    setOrder(moveItem(order, index, to));
  }

  /** How far a non-dragged row shifts to make room for the dragged one. */
  function shiftFor(index: number): number {
    if (!drag) return 0;
    const to = targetIndex(drag);
    if (drag.from < index && index <= to) return -drag.rowH;
    if (to <= index && index < drag.from) return drag.rowH;
    return 0;
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: round.date, seed: round.practiceSeed ?? null, order }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      // The server sends back the order it scored: a saved play wins over this one.
      const finalOrder: string[] = body.order ?? order;
      setOrder(finalOrder);
      setReveal(body.reveal);
      setStats(body.stats ?? null);
      save(key, { order: finalOrder, reveal: body.reveal });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function share() {
    if (!reveal) return;
    const url = round.practiceSeed
      ? `${window.location.origin}/rank?seed=${round.practiceSeed}`
      : isToday
        ? `${window.location.origin}/rank`
        : `${window.location.origin}/rank?date=${round.date}`;
    const text = buildRankShareText(round, reveal, url);
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

  const offById = new Map(reveal?.guess.map((g) => [g.id, g.off]) ?? []);

  return (
    <div className={styles.game}>
      <div className={styles.dateBar}>
        <p className={styles.date}>
          {round.practiceSeed
            ? `Practice round #${round.practiceSeed}`
            : `#${rankRoundNumber(round.date)} · ${new Date(`${round.date}T12:00:00Z`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}`}
        </p>
        <Link href="/rank/archive" className={styles.archiveLink}>
          Play previous rounds
        </Link>
      </div>

      <section className={styles.card}>
        <p className={styles.kicker}>Career · {round.group}</p>
        <h2 className={styles.stat}>{round.label}</h2>
        {round.qualifier && <p className={styles.qualifier}>{round.qualifier}</p>}
        <p className={styles.instructions}>
          {locked ? "Your order, checked." : "Drag to put them in order. You get one shot."}
        </p>

        <p className={styles.end}>▲ {topLabel}</p>
        <ol
          ref={listRef}
          className={styles.list}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {order.map((id, i) => {
            const isDragging = drag?.id === id;
            const off = offById.get(id);
            const transform = isDragging ? `translateY(${drag!.dy}px)` : `translateY(${shiftFor(i)}px)`;
            return (
              <li
                key={id}
                className={[
                  styles.row,
                  isDragging ? styles.dragging : "",
                  locked ? styles.locked : "",
                  off === 0 ? styles.right : off !== undefined ? styles[`off${Math.min(off, 3)}`] : "",
                ].join(" ")}
                style={{ transform, transition: drag && !isDragging ? "transform 0.15s" : isDragging ? "none" : undefined }}
                onPointerDown={(e) => onPointerDown(e, id, i)}
              >
                <span className={styles.pos}>{i + 1}</span>
                <span className={styles.name}>{names.get(id)}</span>
                {locked ? (
                  <span className={styles.result}>
                    {rankShareLine(reveal!.guess[i])}
                  </span>
                ) : (
                  <span className={styles.controls}>
                    <button aria-label={`Move ${names.get(id)} up`} disabled={i === 0} onClick={() => nudge(i, -1)}>
                      ▲
                    </button>
                    <button
                      aria-label={`Move ${names.get(id)} down`}
                      disabled={i === order.length - 1}
                      onClick={() => nudge(i, 1)}
                    >
                      ▼
                    </button>
                    <span className={styles.grip} aria-hidden>
                      ⠿
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className={styles.end}>▼ {bottomLabel}</p>

        {!locked && (
          <button className={styles.submit} onClick={submit} disabled={submitting}>
            {submitting ? "Checking…" : "Lock it in"}
          </button>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </section>

      {reveal && (
        <section className={styles.card}>
          <p className={styles.score}>
            {reveal.score === 0 ? "Perfect order!" : `Off by ${reveal.score}`}
            <span> / {RANK_MAX_SCORE} max</span>
          </p>
          {stats && <RankCompare stats={stats} isToday={isToday} />}
          <h3 className={styles.answerTitle}>The real order</h3>
          <ol className={styles.answer}>
            {reveal.answer.map((a) => (
              <li key={a.id}>
                <span className={styles.name}>{a.name}</span>
                <span className={styles.value}>{a.value}</span>
                <span className={styles.rank}>{a.rank ? `${ordinal(a.rank)} all-time` : "—"}</span>
              </li>
            ))}
          </ol>
          <button className={styles.submit} onClick={share}>
            {copied ? "Copied to clipboard ✓" : "Share result"}
          </button>
        </section>
      )}

      <nav className={styles.links}>
        {locked && !round.practiceSeed ? (
          // Finished a daily round: step to the day before or after.
          <DayNav path="/rank" date={round.date} today={today} firstDate={RANK_LAUNCH_DATE} className={styles.linkBtn} />
        ) : (
          <>
            {practiceEnabled && (
              <button
                className={styles.linkBtn}
                onClick={() => router.push(`/rank?seed=${Math.random().toString(36).slice(2, 10)}`)}
              >
                ↻ New practice round
              </button>
            )}
            {round.practiceSeed || !isToday ? <Link href="/rank">Today&apos;s round</Link> : null}
          </>
        )}
        <Link href="/">Play Baseball Golf →</Link>
        <Link href="/roster">Play Roster Reveal →</Link>
      </nav>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LineupCompare } from "@/components/CompareStats";
import DayNav from "@/components/DayNav";
import PlayerSearch from "@/components/PlayerSearch";
import ShareButton from "@/components/ShareButton";
import {
  buildLineupShareText,
  LINEUP_LAUNCH_DATE,
  LINEUP_SPOTS,
  lineupRoundNumber,
  spotSquare,
  type LineupPick,
  type LineupRound,
  type LineupState,
} from "@/lib/lineup";
import type { LineupStats } from "@/lib/lineup-plays";
import { formatRoundDate } from "@/lib/round";
import type { PlayerIndexEntry } from "@/lib/types";
import styles from "./NumberGame.module.css";

const PATH = "/lineup";
const storageKey = (round: LineupRound) =>
  round.practice ? `lineup-card:practice:${round.practice}` : `lineup-card:${round.date}${round.preview ? ":preview" : ""}`;

const fmt = (n: number) => n.toLocaleString("en-US");
const EMPTY: LineupState = { picks: [], total: 0, done: false, best: null, percent: null };
// Two-letter spots ("1B", "DH") need a wider first column than Hit the Number's slot numbers.
const ROW = { gridTemplateColumns: "34px 1fr auto" };

function loadSaved(key: string): LineupState | null {
  try {
    const raw = localStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as LineupState) : null;
    return saved && Array.isArray(saved.picks) ? saved : null;
  } catch {
    return null;
  }
}

function save(key: string, state: LineupState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage unavailable — progress just won't persist in this browser
  }
}

function headline(percent: number): string {
  if (percent >= 100) return "Perfect lineup!";
  if (percent >= 90) return "All-Star lineup";
  if (percent >= 75) return "Contender";
  if (percent >= 50) return "Middle of the pack";
  return "Rebuilding year";
}

interface Props {
  round: LineupRound;
  isToday: boolean;
  today: string;
  /** Preview deployments only: show the practice round button. */
  canPractice?: boolean;
}

export default function LineupGame({ round, isToday, today, canPractice = false }: Props) {
  const router = useRouter();
  const newPractice = () => router.push(`${PATH}?practice=${Math.random().toString(36).slice(2, 10)}`);
  const key = storageKey(round);
  const [state, setState] = useState<LineupState>(EMPTY);
  const [stats, setStats] = useState<LineupStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(-1);
  const [searchKey, setSearchKey] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);

  function apply(next: LineupState, nextStats?: LineupStats | null) {
    setState(next);
    setStats(nextStats ?? null);
    save(key, next);
  }

  async function post(picks: { id: string; spot: number }[]) {
    const res = await fetch("/api/lineup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(round.practice ? { practice: round.practice } : { date: round.date }),
        picks: picks.map((p) => ({ id: p.id, spot: p.spot })),
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Something went wrong");
    return body as { state: LineupState; stats: LineupStats | null };
  }

  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
    if (saved) setState(saved);
    let cancelled = false;
    // Practice and preview rounds live only in this browser.
    if (round.practice || round.preview) {
      setSynced(true);
      return;
    }
    // Use whichever of the saved card and this browser's copy is further along.
    fetch(`/api/lineup?date=${round.date}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (body: { play: { state: LineupState; stats: LineupStats | null } | null } | null) => {
        if (!body || cancelled) return;
        const server = body.play;
        if (saved && saved.picks.length > (server?.state.picks.length ?? 0)) {
          const b = await post(saved.picks);
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

  const inSpot = (i: number) => state.picks.find((p) => p.spot === i);
  const open = LINEUP_SPOTS.map((_, i) => i).filter((i) => !inSpot(i));
  const active = chosen !== null && open.includes(chosen) ? chosen : (open[0] ?? null);

  async function pick(p: PlayerIndexEntry) {
    if (busy || !synced || state.done || active === null) return;
    setBusy(true);
    setError(null);
    try {
      const next: LineupPick = { id: p.id, name: p.n, years: p.y, value: 0, spot: active };
      const b = await post([...state.picks, next]);
      setFresh(active);
      apply(b.state, b.stats);
      setChosen(null);
      setSearchKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function shareText(): string {
    const page = `${window.location.origin}${PATH}`;
    return buildLineupShareText(round, state, isToday ? page : `${page}?date=${round.date}`);
  }

  const used = new Set(state.picks.map((p) => p.id));
  const best = state.best;

  return (
    <div className={styles.game}>
      <div className={styles.dateBar}>
        <p className={styles.date}>
          {round.practice ? "Practice round" : `#${lineupRoundNumber(round.date)} · ${formatRoundDate(round.date)}`}
        </p>
        <div className={styles.dateLinks}>
          {!round.practice && (
            <Link href={`${PATH}/archive`} className={styles.archiveLink}>
              Play previous rounds
            </Link>
          )}
          {canPractice && (
            <button type="button" className={styles.archiveLink} onClick={newPractice}>
              {round.practice ? "New practice round" : "Practice round"}
            </button>
          )}
        </div>
      </div>

      <section className={`${styles.card} ${synced ? "" : "syncing"}`} aria-busy={!synced}>
        <p className={styles.kicker}>Build the lineup with the most career</p>
        <h2 className={styles.target}>{round.label}</h2>

        {round.practice && <p className={styles.previewNote}>Practice round: random stat and spots. Not saved.</p>}
        {round.preview && !round.practice && (
          <p className={styles.previewNote}>Preview: this round isn&apos;t final and your card isn&apos;t saved.</p>
        )}

        <ol className={styles.slots}>
          {LINEUP_SPOTS.map((spot, i) => {
            const p = inSpot(i);
            const rule = <span className={styles.rule}>{round.rules[i].label}</span>;
            if (!p) {
              const selectable = !state.done;
              const isActive = selectable && i === active;
              const inner = (
                <>
                  <span className={styles.num}>{spot}</span>
                  <span className={styles.who}>
                    {rule}
                    <span>{isActive ? "Pick a player" : "Tap to pick here"}</span>
                  </span>
                  <span />
                </>
              );
              return (
                <li key={spot} className={`${styles.empty} ${isActive ? styles.active : ""}`} style={selectable ? undefined : ROW}>
                  {selectable ? (
                    <button
                      type="button"
                      className={styles.slotBtn}
                      style={ROW}
                      onClick={() => setChosen(i)}
                      disabled={busy || !synced}
                      aria-pressed={isActive}
                    >
                      {inner}
                    </button>
                  ) : (
                    inner
                  )}
                </li>
              );
            }
            return (
              <li key={spot} className={i === fresh ? styles.fresh : undefined} style={ROW}>
                <span className={styles.num}>{spot}</span>
                <span className={styles.who}>
                  {rule}
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.years}>{p.years}</span>
                </span>
                <span className={styles.value}>
                  {best && <span aria-hidden>{spotSquare(p.value, best.picks[i].value)} </span>}
                  {fmt(p.value)}
                </span>
              </li>
            );
          })}
        </ol>

        {state.picks.length > 0 && !state.done && (
          <div className={styles.meter}>
            <span>
              Team total <strong>{fmt(state.total)}</strong> {round.short}
            </span>
            <span>
              {state.picks.length}/{LINEUP_SPOTS.length} spots
            </span>
          </div>
        )}

        {!state.done && active !== null && (
          <>
            <p className={styles.pickingFor}>
              {LINEUP_SPOTS[active]}: <strong>{round.rules[active].label}</strong>
            </p>
            <PlayerSearch
              key={searchKey}
              usedIds={used}
              disabled={busy || !synced}
              onSubmit={pick}
              submitLabel="Pick"
              usedLabel="Already in your lineup"
            />
            {error && <p className={styles.error}>{error}</p>}
          </>
        )}
      </section>

      {state.done && best && state.percent !== null && (
        <section className={`${styles.card} ${styles.result}`}>
          <h2 className={state.percent >= 100 ? styles.good : undefined}>{headline(state.percent)}</h2>
          <p className={styles.math}>
            <strong>
              {fmt(state.total)} {round.short}
            </strong>{" "}
            · {state.percent}% of the best lineup ({fmt(best.total)})
          </p>
          <div className={styles.bullseyes}>
            <p className={styles.kicker}>The best lineup</p>
            <ol className={styles.slots}>
              {best.picks.map((b, i) => (
                <li key={LINEUP_SPOTS[i]} style={ROW}>
                  <span className={styles.num}>{LINEUP_SPOTS[i]}</span>
                  <span className={styles.who}>
                    <span className={styles.name}>{b.name}</span>
                    <span className={styles.years}>{round.rules[i].label}</span>
                  </span>
                  <span className={styles.value}>{fmt(b.value)}</span>
                </li>
              ))}
            </ol>
          </div>
          {stats && <LineupCompare stats={stats} percent={state.percent} isToday={isToday} />}
          {!round.practice && <ShareButton getText={shareText} label="Share result" className={styles.shareBtn} />}
        </section>
      )}

      <nav className={styles.links}>
        {round.practice ? (
          <>
            {state.done && (
              <button type="button" className={styles.linkBtn} onClick={newPractice}>
                New practice round
              </button>
            )}
            <Link href={PATH}>Today&apos;s round</Link>
          </>
        ) : state.done ? (
          <DayNav path={PATH} date={round.date} today={today} firstDate={LINEUP_LAUNCH_DATE} className={styles.linkBtn} />
        ) : !isToday ? (
          <Link href={PATH}>Today&apos;s round</Link>
        ) : null}
      </nav>
    </div>
  );
}

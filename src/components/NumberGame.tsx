"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NumberCompare } from "@/components/CompareStats";
import DayNav from "@/components/DayNav";
import PlayerSearch from "@/components/PlayerSearch";
import ShareButton from "@/components/ShareButton";
import {
  buildNumberShareText,
  NUMBER_LAUNCH_DATE,
  NUMBER_PICKS,
  numberRoundNumber,
  type NumberPick,
  type NumberRound,
  type NumberState,
} from "@/lib/number";
import type { NumberStats } from "@/lib/number-plays";
import { formatRoundDate } from "@/lib/round";
import type { PlayerIndexEntry } from "@/lib/types";
import styles from "./NumberGame.module.css";

// Preview deployments try slot rules on old rounds; keep those plays apart.
const storageKey = (round: NumberRound) =>
  round.practice
    ? `hit-the-number:practice:${round.practice}`
    : `hit-the-number:${round.date}${round.previewSlots ? ":slots" : ""}`;

const fmt = (n: number) => n.toLocaleString("en-US");

const EMPTY: NumberState = { picks: [], total: 0, done: false, bust: false, score: null, bullseyes: null };

function loadSaved(key: string): NumberState | null {
  try {
    const raw = localStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as NumberState) : null;
    return saved && Array.isArray(saved.picks) ? saved : null;
  } catch {
    return null;
  }
}

function save(key: string, state: NumberState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage unavailable — progress just won't persist in this browser
  }
}

function headline(state: NumberState, target: number): string {
  if (state.bust) return "Bust!";
  if (state.score === 0) return "Bullseye!";
  if (state.score !== null && state.score <= Math.max(1, Math.ceil(target * 0.01))) return "So close!";
  return `Off by ${fmt(state.score ?? 0)}`;
}

interface Props {
  round: NumberRound;
  isToday: boolean;
  /** Preview deployments only: show the practice round button. */
  canPractice?: boolean;
  today: string;
}

export default function NumberGame({ round, isToday, today, canPractice = false }: Props) {
  const router = useRouter();
  /** Preview deployments only: start a new random practice round. */
  const newPractice = () => router.push(`/number?practice=${Math.random().toString(36).slice(2, 10)}`);
  const key = storageKey(round);
  const slots = round.slots;
  const [state, setState] = useState<NumberState>(EMPTY);
  const [stats, setStats] = useState<NumberStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(-1);
  // Remounts the search box after each pick, so it starts empty.
  const [searchKey, setSearchKey] = useState(0);
  // Rounds with slot rules: the slot the next pick goes in (null = the first open one).
  const [chosen, setChosen] = useState<number | null>(null);

  function apply(next: NumberState, nextStats?: NumberStats | null) {
    setState(next);
    setStats(nextStats ?? null);
    save(key, next);
  }

  async function post(picks: NumberPick[]) {
    const sent = slots ? picks.map((p) => ({ id: p.id, slot: p.slot })) : picks.map((p) => p.id);
    const res = await fetch("/api/number", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(round.practice ? { practice: round.practice, picks: sent } : { date: round.date, picks: sent }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Something went wrong");
    return body as { state: NumberState; stats: NumberStats | null };
  }

  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
    if (saved) setState(saved);

    // The database has this browser's daily plays. Use whichever of the saved
    // play and this browser's copy is further along, and upload this browser's
    // picks if the database doesn't have them yet.
    let cancelled = false;
    // Practice rounds live only in this browser.
    if (round.practice) {
      setSynced(true);
      return;
    }
    fetch(`/api/number?date=${round.date}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (body: { play: { state: NumberState; stats: NumberStats | null } | null } | null) => {
        if (!body || cancelled) return;
        const server = body.play;
        const localAhead = saved && saved.picks.length > (server?.state.picks.length ?? 0);
        if (localAhead && saved) {
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

  // Slot i's pick: on rounds with slots, whoever went in slot i; otherwise the i-th pick.
  const inSlot = (i: number) => (slots ? state.picks.find((p) => p.slot === i) : state.picks[i]);
  const openSlots = Array.from({ length: NUMBER_PICKS }, (_, i) => i).filter((i) => !inSlot(i));
  const activeSlot = chosen !== null && openSlots.includes(chosen) ? chosen : (openSlots[0] ?? null);

  async function pick(p: PlayerIndexEntry) {
    if (busy || !synced || state.done || activeSlot === null) return;
    setBusy(true);
    setError(null);
    try {
      const next: NumberPick = { id: p.id, name: p.n, years: p.y, value: 0, slot: slots ? activeSlot : undefined };
      const b = await post([...state.picks, next]);
      setFresh(slots ? activeSlot : b.state.picks.length - 1);
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
    const page = `${window.location.origin}/number`;
    return buildNumberShareText(round, state, isToday ? page : `${page}?date=${round.date}`);
  }

  const left = round.target - state.total;
  const used = new Set(state.picks.map((p) => p.id));
  const stat = round.label.toLowerCase();

  return (
    <div className={styles.game}>
      <div className={styles.dateBar}>
        <p className={styles.date}>
          {round.practice ? "Practice round" : `#${numberRoundNumber(round.date)} · ${formatRoundDate(round.date)}`}
        </p>
        <div className={styles.dateLinks}>
          {!round.practice && (
            <Link href="/number/archive" className={styles.archiveLink}>
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
        <p className={styles.kicker}>
          Career {stat}
          {round.group === "Pitching" && round.statKey === "SO" ? " (pitching)" : ""}
        </p>
        <h2 className={styles.target}>
          {fmt(round.target)} <span>{round.short}</span>
        </h2>

        {round.practice && <p className={styles.previewNote}>Practice round: random stat, target and slots. Not saved.</p>}
        {round.previewSlots && (
          <p className={styles.previewNote}>Preview: trying slot rules on this round. This play isn&apos;t saved.</p>
        )}

        <ol className={styles.slots}>
          {Array.from({ length: NUMBER_PICKS }, (_, i) => {
            const p = inSlot(i);
            const rule = slots?.[i];
            const ruleLine = rule && <span className={styles.rule}>{rule.label}</span>;
            if (!p) {
              const selectable = Boolean(slots) && !state.done;
              const active = selectable && i === activeSlot;
              const text = state.done
                ? "Not needed"
                : slots
                  ? active
                    ? "Pick a player"
                    : "Tap to pick here"
                  : i === state.picks.length
                    ? "Pick a player"
                    : "—";
              const inner = (
                <>
                  <span className={styles.num}>{i + 1}</span>
                  <span className={styles.who}>
                    {ruleLine}
                    <span>{text}</span>
                  </span>
                  <span />
                </>
              );
              return (
                <li key={i} className={`${styles.empty} ${active ? styles.active : ""}`}>
                  {selectable ? (
                    <button
                      type="button"
                      className={styles.slotBtn}
                      onClick={() => setChosen(i)}
                      disabled={busy || !synced}
                      aria-pressed={active}
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
              <li key={i} className={i === fresh ? styles.fresh : undefined}>
                <span className={styles.num}>{i + 1}</span>
                <span className={styles.who}>
                  {ruleLine}
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.years}>{p.years}</span>
                </span>
                <span className={styles.value}>{fmt(p.value)}</span>
              </li>
            );
          })}
        </ol>

        {state.picks.length > 0 && !state.done && (
          <div className={styles.meter}>
            <span>
              Total <strong>{fmt(state.total)}</strong>
            </span>
            <span>{fmt(left)} to go</span>
          </div>
        )}

        {!state.done && (
          <>
            {slots && activeSlot !== null && (
              <p className={styles.pickingFor}>
                Slot {activeSlot + 1}: <strong>{slots[activeSlot].label}</strong>
              </p>
            )}
            <PlayerSearch
              key={searchKey}
              usedIds={used}
              disabled={busy || !synced}
              onSubmit={pick}
              submitLabel="Pick"
              usedLabel="Already picked"
            />
            {error && <p className={styles.error}>{error}</p>}
          </>
        )}
      </section>

      {state.done && (
        <section className={`${styles.card} ${styles.result}`}>
          <h2 className={state.bust ? styles.bad : state.score === 0 ? styles.good : undefined}>
            {headline(state, round.target)}
          </h2>
          <p className={styles.math}>
            {state.picks.map((p) => fmt(p.value)).join(" + ")} = <strong>{fmt(state.total)}</strong>
            {state.bust ? ` · ${fmt(-left)} over ${fmt(round.target)}` : ` of ${fmt(round.target)}`}
          </p>
          {state.bullseyes && (
            <div className={styles.bullseyes}>
              <p className={styles.kicker}>Possible bullseyes</p>
              <p>
                {state.bullseyes.count === 0
                  ? "None today."
                  : `${fmt(state.bullseyes.count)} ${state.bullseyes.count === 1 ? "way" : "ways"}, such as: ${state.bullseyes.example!.map((p) => `${p.name} (${fmt(p.value)})`).join(" + ")}.`}
              </p>
            </div>
          )}
          {stats && (
            <NumberCompare
              stats={stats}
              mine={{ score: state.score, bust: state.bust }}
              target={round.target}
              isToday={isToday}
            />
          )}
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
            <Link href="/number">Today&apos;s round</Link>
          </>
        ) : state.done ? (
          <DayNav path="/number" date={round.date} today={today} firstDate={NUMBER_LAUNCH_DATE} className={styles.linkBtn} />
        ) : !isToday ? (
          <Link href="/number">Today&apos;s round</Link>
        ) : null}
      </nav>
    </div>
  );
}

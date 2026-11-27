"use client";

// Hit the Number's bonus round ("Max it out"), shown under the main round's
// result once it's done: the same stat and three slots, biggest total wins.
import { useEffect, useState } from "react";
import { MaxCompare } from "@/components/CompareStats";
import PlayerSearch from "@/components/PlayerSearch";
import ShareButton from "@/components/ShareButton";
import { NUMBER_PICKS, type NumberPick, type NumberRound } from "@/lib/number";
import { buildMaxShareText, maxSquare, type MaxState } from "@/lib/number-max";
import type { MaxStats } from "@/lib/number-max-plays";
import { ordinal } from "@/lib/scoring";
import { apiUrl, basePath, namespaced } from "@/lib/sport";
import type { PlayerIndexEntry } from "@/lib/types";
import styles from "./NumberGame.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
/** "1st all-time", "T-12th all-time"; nothing for a player with none of the stat. */
const rankLabel = (p: NumberPick) => (p.rank ? `${p.tied ? "T-" : ""}${ordinal(p.rank)} all-time` : null);
const EMPTY: MaxState = { picks: [], total: 0, done: false, best: null, percent: null };

const storageKey = (round: NumberRound) =>
  namespaced(round.sport, round.practice ? `hit-the-number-max:practice:${round.practice}` : `hit-the-number-max:${round.date}`);

function loadSaved(key: string): MaxState | null {
  try {
    const raw = localStorage.getItem(key);
    const saved = raw ? (JSON.parse(raw) as MaxState) : null;
    return saved && Array.isArray(saved.picks) ? saved : null;
  } catch {
    return null;
  }
}

function save(key: string, state: MaxState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // storage unavailable — progress just won't persist in this browser
  }
}

function headline(percent: number): string {
  if (percent >= 100) return "Maxed out!";
  if (percent >= 90) return "So close to the max";
  if (percent >= 75) return "Big numbers";
  return "Room to grow";
}

export default function NumberMax({ round, isToday }: { round: NumberRound; isToday: boolean }) {
  const slots = round.slots!;
  const sport = round.sport;
  const key = storageKey(round);
  const local = Boolean(round.practice || round.previewSlots);
  const [state, setState] = useState<MaxState>(EMPTY);
  const [stats, setStats] = useState<MaxStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(-1);
  const [searchKey, setSearchKey] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);

  function apply(next: MaxState, nextStats?: MaxStats | null) {
    setState(next);
    setStats(nextStats ?? null);
    save(key, next);
  }

  async function post(picks: { id: string; slot?: number }[]) {
    const res = await fetch("/api/number/max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(round.practice ? { practice: round.practice } : { date: round.date }),
        picks: picks.map((p) => ({ id: p.id, slot: p.slot })),
        ...(sport === "nba" ? { sport } : {}),
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Something went wrong");
    return body as { state: MaxState; stats: MaxStats | null };
  }

  useEffect(() => {
    const saved = loadSaved(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after hydration
    if (saved) setState(saved);
    if (local) {
      setSynced(true);
      return;
    }
    let cancelled = false;
    fetch(apiUrl(sport, "/api/number/max", { date: round.date }), { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (body: { play: { state: MaxState; stats: MaxStats | null } | null } | null) => {
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

  const inSlot = (i: number) => state.picks.find((p) => p.slot === i);
  const open = Array.from({ length: NUMBER_PICKS }, (_, i) => i).filter((i) => !inSlot(i));
  const active = chosen !== null && open.includes(chosen) ? chosen : (open[0] ?? null);

  async function pick(p: PlayerIndexEntry) {
    if (busy || !synced || state.done || active === null) return;
    setBusy(true);
    setError(null);
    try {
      const next: NumberPick = { id: p.id, name: p.n, years: p.y, value: 0, slot: active };
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
    const page = `${window.location.origin}${basePath(sport)}/number`;
    return buildMaxShareText(round, state, isToday ? page : `${page}?date=${round.date}`);
  }

  const best = state.best;
  const used = new Set(state.picks.map((p) => p.id));

  return (
    <section className={`${styles.card} ${synced ? "" : "syncing"}`} aria-busy={!synced} aria-label="Bonus round">
      <p className={styles.kicker}>Bonus round · Max it out</p>
      <h2 className={styles.target}>
        Most career {round.label.toLowerCase()}
      </h2>
      <p className={styles.pickingFor}>Same slots, no target. Get the biggest total you can.</p>

      <ol className={styles.slots}>
        {slots.map((rule, i) => {
          const p = inSlot(i);
          const ruleLine = <span className={styles.rule}>{rule.label}</span>;
          if (!p) {
            const selectable = !state.done;
            const isActive = selectable && i === active;
            const inner = (
              <>
                <span className={styles.num}>{i + 1}</span>
                <span className={styles.who}>
                  {ruleLine}
                  <span>{isActive ? "Pick a player" : "Tap to pick here"}</span>
                </span>
                <span />
              </>
            );
            return (
              <li key={i} className={`${styles.empty} ${isActive ? styles.active : ""}`}>
                {selectable ? (
                  <button
                    type="button"
                    className={styles.slotBtn}
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
            <li key={i} className={i === fresh ? styles.fresh : undefined}>
              <span className={styles.num}>{i + 1}</span>
              <span className={styles.who}>
                {ruleLine}
                <span className={styles.name}>{p.name}</span>
                <span className={styles.years}>{p.years}</span>
              </span>
              <span className={styles.value}>
                {best && <span aria-hidden>{maxSquare(p.value, best.picks[i].value)} </span>}
                {fmt(p.value)}
                {rankLabel(p) && <span className={styles.rank}>{rankLabel(p)}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {state.picks.length > 0 && !state.done && (
        <div className={styles.meter}>
          <span>
            Total <strong>{fmt(state.total)}</strong>
          </span>
          <span>
            {state.picks.length}/{NUMBER_PICKS} picks
          </span>
        </div>
      )}

      {!state.done && active !== null && (
        <>
          <p className={styles.pickingFor}>
            Slot {active + 1}: <strong>{slots[active].label}</strong>
          </p>
          <PlayerSearch
            key={searchKey}
            sport={sport}
            usedIds={used}
            disabled={busy || !synced}
            onSubmit={pick}
            submitLabel="Pick"
            usedLabel="Already picked"
          />
          {error && <p className={styles.error}>{error}</p>}
        </>
      )}

      {state.done && best && state.percent !== null && (
        <div className={styles.result}>
          <h2 className={state.percent >= 100 ? styles.good : undefined}>{headline(state.percent)}</h2>
          <p className={styles.math}>
            {state.picks
              .slice()
              .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
              .map((p) => fmt(p.value))
              .join(" + ")}{" "}
            = <strong>{fmt(state.total)}</strong> · {state.percent}% of the max ({fmt(best.total)})
          </p>
          <div className={styles.bullseyes}>
            <p className={styles.kicker}>The max</p>
            <p>
              {best.picks.map((p) => `${p.name} (${fmt(p.value)}${rankLabel(p) ? `, ${rankLabel(p)}` : ""})`).join(" + ")} ={" "}
              {fmt(best.total)}.
            </p>
          </div>
          {stats && <MaxCompare stats={stats} percent={state.percent} isToday={isToday} />}
          {!round.practice && <ShareButton getText={shareText} label="Share bonus result" className={styles.shareBtn} />}
        </div>
      )}
    </section>
  );
}

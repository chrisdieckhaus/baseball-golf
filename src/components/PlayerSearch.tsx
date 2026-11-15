"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Sport } from "@/lib/sport";
import type { PlayerIndexEntry } from "@/lib/types";
import styles from "./Game.module.css";

const MAX_SUGGESTIONS = 8;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "");
}

interface Indexed extends PlayerIndexEntry {
  norm: string;
}

/** Each sport's autocomplete index, loaded once per page. */
const PLAYER_FILES: Record<Sport, string> = { mlb: "/players.json", nba: "/players-nba.json" };
const playersPromises = new Map<Sport, Promise<Indexed[]>>();
function loadPlayers(sport: Sport): Promise<Indexed[]> {
  const existing = playersPromises.get(sport);
  if (existing) return existing;
  const promise = fetch(PLAYER_FILES[sport])
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load players (${r.status})`);
      return r.json();
    })
    .then((d: { players: PlayerIndexEntry[] }) => d.players.map((p) => ({ ...p, norm: normalize(p.n) })))
    .catch((e) => {
      playersPromises.delete(sport);
      throw e;
    });
  playersPromises.set(sport, promise);
  return promise;
}

export function search(players: Indexed[], query: string): Indexed[] {
  const q = normalize(query).trim();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/);
  const scored: { p: Indexed; s: number }[] = [];
  for (const p of players) {
    if (!terms.every((t) => p.norm.includes(t))) continue;
    // Prefer names where every term starts a word, then whole-name prefix matches.
    const words = p.norm.split(" ");
    const wordStarts = terms.every((t) => words.some((w) => w.startsWith(t)));
    const s = (p.norm.startsWith(q) ? 2 : 0) + (wordStarts ? 1 : 0);
    scored.push({ p, s });
  }
  // players.json is pre-sorted by games played, so a stable sort keeps stars first
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, MAX_SUGGESTIONS).map((x) => x.p);
}

interface Props {
  sport?: Sport;
  usedIds: Set<string>;
  disabled: boolean;
  onSubmit: (player: PlayerIndexEntry) => void;
}

export default function PlayerSearch({ sport = "mlb", usedIds, disabled, onSubmit }: Props) {
  const [players, setPlayers] = useState<Indexed[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PlayerIndexEntry | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    loadPlayers(sport).then(setPlayers, () => setLoadError(true));
  }, [sport]);

  const results = useMemo(() => (players && !selected ? search(players, query) : []), [players, query, selected]);

  function choose(p: PlayerIndexEntry) {
    if (usedIds.has(p.id)) return;
    setSelected(p);
    setQuery(p.n);
    setOpen(false);
  }

  function submit() {
    if (selected && !disabled) {
      onSubmit(selected);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selected) submit();
      else if (results[active]) choose(results[active]);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && results.length > 0;

  return (
    <div className={styles.search}>
      <div className={styles.searchRow}>
        <div className={styles.comboWrap}>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Search for a player"
            placeholder={loadError ? "Couldn't load players — refresh to retry" : "Type a player's name…"}
            value={query}
            disabled={disabled || loadError}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
          />
          {showList && (
            <ul id={listId} role="listbox" className={styles.listbox}>
              {results.map((p, i) => {
                const used = usedIds.has(p.id);
                return (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={used}
                    className={`${styles.option} ${i === active ? styles.optionActive : ""} ${used ? styles.optionUsed : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(p);
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span className={styles.optName}>{p.n}</span>
                    <span className={styles.optMeta}>
                      {used ? "Already used this round" : [p.p, p.y].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button className={styles.guessBtn} onClick={submit} disabled={!selected || disabled}>
          Guess
        </button>
      </div>
      {selected && (
        <p className={styles.selectedMeta}>
          {selected.n} · {[selected.p, selected.y].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

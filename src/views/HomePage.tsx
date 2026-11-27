// The homepage (/ and /nba): one card per daily game with this browser's
// result for the day, or a link to play it. `?day=YYYY-MM-DD` shows an earlier
// day (`?date=` on / still goes to Baseball Golf, for old shared links).
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import DayResults, { type DayGame } from "@/components/DayResults";
import { GAME_PATHS, type GameKey } from "@/lib/local-status";
import { numberRoundNumber } from "@/lib/number";
import { formatRoundDate, isPlayableDate, roundNumber, todayET } from "@/lib/round";
import { loadSavedStatuses } from "@/lib/saved-status";
import { basePath, COPY, type Sport } from "@/lib/sport";
import styles from "./HomePage.module.css";

export type HomeSearchParams = Promise<{ day?: string | string[] }>;

interface GameInfo {
  key: GameKey;
  name: (sport: Sport) => string;
  pitch: (sport: Sport) => string;
  number: (date: string) => number;
  mlbOnly?: boolean;
}

const GAMES: GameInfo[] = [
  {
    key: "golf",
    name: (s) => COPY[s].golfName,
    pitch: () => "Name the player at each all-time career rank.",
    number: roundNumber,
  },
  {
    key: "player",
    name: (s) => `${COPY[s].golfName}: Player`,
    pitch: () => "We name the player and the stat. You name his rank.",
    number: roundNumber,
  },
  {
    key: "number",
    name: () => "Hit the Number",
    pitch: () => "Three players whose careers add up to the target. Don't go over.",
    number: numberRoundNumber,
    mlbOnly: true,
  },
];

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function Day({ searchParams, sport }: { searchParams: HomeSearchParams; sport: Sport }) {
  // Render per request: the day rolls over at midnight Eastern, and results are this browser's.
  await connection();
  const { day } = await searchParams;
  const today = todayET();
  const date = isPlayableDate(day, today) ? day : today;
  const isToday = date === today;
  const base = basePath(sport);
  const home = base || "/";

  const games = GAMES.filter((g) => !(g.mlbOnly && sport === "nba"));
  const saved = await Promise.all(games.map((g) => loadSavedStatuses(g.key, sport, "[home]")));
  const cards: DayGame[] = games.map((g, i) => {
    const path = `${base}${GAME_PATHS[g.key]}`;
    return {
      key: g.key,
      name: g.name(sport),
      pitch: g.pitch(sport),
      number: g.number(date),
      href: isToday ? path : `${path}?date=${date}`,
      archive: `${path}/archive`,
      saved: saved[i][date] ?? null,
    };
  });

  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const dayHref = (d: string) => (d === today ? home : `${home}?day=${d}`);

  return (
    <>
      <div className={styles.dayBar}>
        {isPlayableDate(prev, today) ? (
          <Link href={dayHref(prev)} className={styles.dayLink} aria-label="Previous day">
            ←
          </Link>
        ) : (
          <span className={styles.dayLink} aria-hidden />
        )}
        <div className={styles.dayLabel}>
          <span className={styles.dayKicker}>{isToday ? "Today" : "Past day"}</span>
          {formatRoundDate(date)}
        </div>
        {isPlayableDate(next, today) ? (
          <Link href={dayHref(next)} className={styles.dayLink} aria-label="Next day">
            →
          </Link>
        ) : (
          <span className={styles.dayLink} aria-hidden />
        )}
      </div>
      <DayResults key={`${sport}:${date}`} games={cards} date={date} sport={sport} isToday={isToday} />
      {!isToday && (
        <p className={styles.back}>
          <Link href={home}>Back to today</Link>
        </p>
      )}
    </>
  );
}

export default function HomePage({ searchParams, sport }: { searchParams: HomeSearchParams; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Your <span>Day</span>
        </h1>
        <p className={styles.tagline}>
          {sport === "nba" ? "Every daily basketball game" : "Every daily game"}, and how you did. A new round of each
          at midnight Eastern.
        </p>
      </header>
      <Suspense fallback={<p className={styles.loading}>Checking the scoreboard…</p>}>
        <Day searchParams={searchParams} sport={sport} />
      </Suspense>
    </main>
  );
}

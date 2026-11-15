import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import Game from "@/components/Game";
import { getRound, leaderboards } from "@/lib/data";
import { isPlayableDate, todayET } from "@/lib/round";
import styles from "./page.module.css";

export const metadata: Metadata = {
  // The layout's title template doesn't apply to a page in the same segment.
  title: { absolute: "Baseball Golf · Daily Dugout" },
  description: "A daily baseball trivia game: name the player at each all-time career rank. Lowest score wins.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  // ?date=YYYY-MM-DD plays a previous daily round; anything else is today's round.
  const roundDate = isPlayableDate(date, today) ? date : today;
  const round = await getRound(roundDate);
  // key: remount (fresh state) when switching between rounds via client-side navigation
  return <Game key={round.date} round={round} isToday={round.date === today} today={today} />;
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Baseball <span>Golf</span>
        </h1>
        <p className={styles.tagline}>
          Three holes. Name the player at each all-time rank. Closest to the pin wins — lowest score is best.
        </p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Setting up today&apos;s course…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Stats through the {leaderboards.throughSeason} season, for players who debuted in{" "}
          {leaderboards.firstDebutYear} or later. Career totals include the 1920–48 Negro Leagues.
        </p>
        <p>
          Data:{" "}
          <a href="https://sabr.org/lahman-database/" target="_blank" rel="noreferrer">
            Lahman Baseball Database
          </a>
          , licensed{" "}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
            CC BY-SA 3.0
          </a>
          .
        </p>
      </footer>
    </main>
  );
}

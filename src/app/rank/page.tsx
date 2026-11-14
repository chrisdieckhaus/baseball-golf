import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import RankGame from "@/components/RankGame";
import { leaderboards } from "@/lib/leaderboards";
import { getRankRound, isPlayableRankDate } from "@/lib/rank-data";
import { isValidSeed, practiceEnabled, todayET } from "@/lib/round";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Stats Ranker",
  description: "A daily baseball game: put five players in order by a career stat. One shot.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { seed, date } = await searchParams;
  const practice = practiceEnabled();
  const practiceSeed = practice && isValidSeed(seed) ? seed : undefined;
  const today = todayET();
  const roundDate = !practiceSeed && isPlayableRankDate(date, today) ? date : today;
  const round = await getRankRound(roundDate, practiceSeed);
  return (
    <RankGame
      key={practiceSeed ?? round.date}
      round={round}
      isToday={!practiceSeed && round.date === today}
      practiceEnabled={practice}
    />
  );
}

export default function RankPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Stats <span>Ranker</span>
        </h1>
        <p className={styles.tagline}>One stat. Five players. Put them in order. Lowest score wins.</p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Pulling today&apos;s lineup…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Stats through the {leaderboards.throughSeason} season. Career totals include the 1871–75 National
          Association and the 1920–48 Negro Leagues.
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

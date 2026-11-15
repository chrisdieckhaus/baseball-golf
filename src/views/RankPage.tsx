import { Suspense } from "react";
import { connection } from "next/server";
import RankGame from "@/components/RankGame";
import { getRankRound, isPlayableRankDate } from "@/lib/rank-data";
import { todayET } from "@/lib/round";
import type { Sport } from "@/lib/sport";
import { DataCredit, StatsNote } from "./footers";
import type { SearchParams } from "./GolfPage";
import styles from "@/app/page.module.css";

async function TodaysRound({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  const roundDate = isPlayableRankDate(date, today) ? date : today;
  const round = await getRankRound(roundDate, sport);
  return <RankGame key={round.date} round={round} isToday={round.date === today} today={today} sport={sport} />;
}

/** Stats Ranker (/rank or /nba/rank). */
export default function RankPage({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Stats <span>Ranker</span>
        </h1>
        <p className={styles.tagline}>One stat. Five players. Put them in order. Lowest score wins.</p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Pulling today&apos;s lineup…</p>}>
        <TodaysRound searchParams={searchParams} sport={sport} />
      </Suspense>

      <footer className={styles.footer}>
        <StatsNote sport={sport} />
        <DataCredit sport={sport} />
      </footer>
    </main>
  );
}

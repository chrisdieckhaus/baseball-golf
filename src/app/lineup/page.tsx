import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import LineupGame from "@/components/LineupGame";
import { getLineupRound, getPracticeRound, isPlayableLineupDate, isPreview } from "@/lib/lineup-data";
import { numberFirstDebutYear, numberThroughSeason } from "@/lib/number-data";
import { todayET } from "@/lib/round";
import { pageMetadata } from "@/lib/site";
import { DataCredit } from "@/views/footers";
import type { SearchParams } from "@/views/GolfPage";
import styles from "@/app/page.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Lineup Card: Daily Baseball Lineup Game · Daily Dugout",
  description:
    "A free daily baseball game: fill all nine lineup spots with players who fit each spot's rule, and build the biggest career total.",
  path: "/lineup",
});

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date, practice } = (await searchParams) as Record<string, string | undefined>;
  const today = todayET();
  const canPractice = isPreview() || process.env.LINEUP_PRACTICE === "1";
  const practiceRound = practice ? getPracticeRound(practice) : null;
  if (practiceRound) {
    return <LineupGame key={`practice:${practice}`} round={practiceRound} isToday={false} today={today} canPractice />;
  }
  const round = await getLineupRound(isPlayableLineupDate(date, today) ? date : today);
  return <LineupGame key={round.date} round={round} isToday={round.date === today} today={today} canPractice={canPractice} />;
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Lineup <span>Card</span>
        </h1>
        <p className={styles.tagline}>
          Fill all nine spots, in any order. Each player has to have played that position (one game counts) and fit its
          rule. His whole career total counts. No one twice.
        </p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Filling out the card…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Career regular-season totals through {numberThroughSeason()}, for every player who debuted in{" "}
          {numberFirstDebutYear()} or later, including the 1920–48 Negro Leagues.
        </p>
        <DataCredit sport="mlb" />
      </footer>
    </main>
  );
}

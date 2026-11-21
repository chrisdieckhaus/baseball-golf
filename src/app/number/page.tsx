import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import NumberGame from "@/components/NumberGame";
import {
  getNumberRound,
  getPracticeRound,
  isPlayableNumberDate,
  numberFirstDebutYear,
  numberThroughSeason,
  practiceEnabled,
} from "@/lib/number-data";
import { todayET } from "@/lib/round";
import { pageMetadata } from "@/lib/site";
import { DataCredit } from "@/views/footers";
import type { SearchParams } from "@/views/GolfPage";
import HowToPlay from "@/views/HowToPlay";
import styles from "@/app/page.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Hit the Number: Daily Baseball Stats Game · Daily Dugout",
  description:
    "A free daily baseball game: name three MLB players whose career totals add up as close to the target as you can without going over.",
  path: "/number",
});

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date, practice } = (await searchParams) as Record<string, string | undefined>;
  const today = todayET();
  const canPractice = practiceEnabled();
  // Preview deployments only: ?practice=<seed> plays a random practice round.
  const practiceRound = practice ? getPracticeRound(practice) : null;
  if (practiceRound) {
    return <NumberGame key={`practice:${practice}`} round={practiceRound} isToday={false} today={today} canPractice />;
  }
  const roundDate = isPlayableNumberDate(date, today) ? date : today;
  const round = await getNumberRound(roundDate);
  return <NumberGame key={round.date} round={round} isToday={round.date === today} today={today} canPractice={canPractice} />;
}

/** Hit the Number (/number). Baseball only. */
export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Hit the <span>Number</span>
        </h1>
      </header>

      <Suspense fallback={<p className={styles.loading}>Adding it all up…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

      <HowToPlay game="number" />

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Career regular-season totals through {numberThroughSeason}, for every player who debuted in{" "}
          {numberFirstDebutYear} or later, including the 1920–48 Negro Leagues.
        </p>
        <DataCredit sport="mlb" />
      </footer>
    </main>
  );
}

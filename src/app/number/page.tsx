import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import NumberGame from "@/components/NumberGame";
import { getNumberRound, isPlayableNumberDate, numberFirstDebutYear, numberThroughSeason } from "@/lib/number-data";
import { todayET } from "@/lib/round";
import { DataCredit } from "@/views/footers";
import type { SearchParams } from "@/views/GolfPage";
import styles from "@/app/page.module.css";

export const metadata: Metadata = {
  title: "Hit the Number",
  description:
    "A daily baseball game: name three players whose career totals add up as close to the target as you can without going over.",
};

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  const roundDate = isPlayableNumberDate(date, today) ? date : today;
  const round = await getNumberRound(roundDate);
  return <NumberGame key={round.date} round={round} isToday={round.date === today} today={today} />;
}

/** Hit the Number (/number). Baseball only. */
export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Hit the <span>Number</span>
        </h1>
        <p className={styles.tagline}>Three players. One target. Get as close as you can without going over.</p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Adding it all up…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

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

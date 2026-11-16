import { Suspense } from "react";
import { connection } from "next/server";
import Game from "@/components/Game";
import ModeSwitch from "@/components/ModeSwitch";
import { getRound } from "@/lib/data";
import { isPlayableDate, todayET } from "@/lib/round";
import type { Sport } from "@/lib/sport";
import { DataCredit, GolfTitle, StatsNote } from "./footers";
import HowToPlay from "./HowToPlay";
import styles from "@/app/page.module.css";

export type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function TodaysRound({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  // ?date=YYYY-MM-DD plays a previous daily round; anything else is today's round.
  const roundDate = isPlayableDate(date, today) ? date : today;
  const round = await getRound(roundDate, sport);
  // key: remount (fresh state) when switching between rounds via client-side navigation
  return <Game key={round.date} round={round} isToday={round.date === today} today={today} sport={sport} />;
}

/** Baseball Golf (/golf) or Basketball Golf (/nba/golf), Rank mode. */
export default function GolfPage({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <GolfTitle sport={sport} />
        </h1>
        <ModeSwitch current="rank" sport={sport} />
        {/* Baseball explains the game in How to play, below it. */}
        {sport === "nba" && (
          <p className={styles.tagline}>
            Three holes. Name the player at each all-time rank. Lowest score wins.
          </p>
        )}
      </header>

      <Suspense fallback={<p className={styles.loading}>Setting up today&apos;s round…</p>}>
        <TodaysRound searchParams={searchParams} sport={sport} />
      </Suspense>

      {sport === "mlb" && <HowToPlay game="golf" />}

      <footer className={styles.footer}>
        <StatsNote sport={sport} />
        <DataCredit sport={sport} />
      </footer>
    </main>
  );
}

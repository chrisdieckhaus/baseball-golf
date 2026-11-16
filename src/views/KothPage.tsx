import { Suspense } from "react";
import { connection } from "next/server";
import KothGame from "@/components/KothGame";
import { getKothRound, isPlayableKothDate, kothStateFor } from "@/lib/koth-data";
import { todayET } from "@/lib/round";
import type { Sport } from "@/lib/sport";
import { DataCredit, StatsNote } from "./footers";
import type { SearchParams } from "./GolfPage";
import HowToPlay from "./HowToPlay";
import styles from "@/app/page.module.css";

async function TodaysRound({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  const roundDate = isPlayableKothDate(date, today) ? date : today;
  const { round, stored } = await getKothRound(roundDate, sport);
  return (
    <KothGame
      key={round.date}
      round={round}
      initial={kothStateFor(stored, [], sport)}
      isToday={round.date === today}
      today={today}
      sport={sport}
    />
  );
}

/** King of the Hill (/king or /nba/king). */
export default function KothPage({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          King of the <span>Hill</span>
        </h1>
        {/* Baseball explains the game in How to play, below it. */}
        {sport === "nba" && (
          <p className={styles.tagline}>Five matchups, one stat. Tap the better player. The winner stays on as king.</p>
        )}
      </header>

      <Suspense fallback={<p className={styles.loading}>Setting up the matchups…</p>}>
        <TodaysRound searchParams={searchParams} sport={sport} />
      </Suspense>

      {sport === "mlb" && <HowToPlay game="king" />}

      <footer className={styles.footer}>
        <StatsNote sport={sport} />
        <DataCredit sport={sport} />
      </footer>
    </main>
  );
}

// Hit the Number's page body, shared by /number and /nba/number.
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
import { seasonLabel, type Sport } from "@/lib/sport";
import { DataCredit } from "@/views/footers";
import type { SearchParams } from "@/views/GolfPage";
import HowToPlay from "@/views/HowToPlay";
import styles from "@/app/page.module.css";

async function TodaysRound({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date, practice } = (await searchParams) as Record<string, string | undefined>;
  const today = todayET();
  const canPractice = practiceEnabled();
  // Preview deployments only: ?practice=<seed> plays a random practice round.
  const practiceRound = practice ? getPracticeRound(practice, sport) : null;
  if (practiceRound) {
    return <NumberGame key={`practice:${practice}`} round={practiceRound} isToday={false} today={today} canPractice />;
  }
  const roundDate = isPlayableNumberDate(date, today) ? date : today;
  const round = await getNumberRound(roundDate, sport);
  return (
    <NumberGame key={round.date} round={round} isToday={round.date === today} today={today} canPractice={canPractice} />
  );
}

function DataNote({ sport }: { sport: Sport }) {
  if (sport === "nba") {
    return (
      <p className={styles.dataNote}>
        Career regular-season totals through the {seasonLabel("nba", numberThroughSeason("nba"))} season, NBA, ABA and
        BAA combined. Steals and blocks count from 1973–74, 3-pointers from 1979–80 (ABA 1967–76).
      </p>
    );
  }
  return (
    <p className={styles.dataNote}>
      Career regular-season totals through {numberThroughSeason()}, for every player who debuted in{" "}
      {numberFirstDebutYear()} or later, including the 1920–48 Negro Leagues.
    </p>
  );
}

export default function NumberPage({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Hit the <span>Number</span>
        </h1>
      </header>

      <Suspense fallback={<p className={styles.loading}>Adding it all up…</p>}>
        <TodaysRound searchParams={searchParams} sport={sport} />
      </Suspense>

      {/* How to play is baseball only: the NBA pages are noindex and behind a kill switch. */}
      {sport === "mlb" && <HowToPlay game="number" />}

      <footer className={styles.footer}>
        <DataNote sport={sport} />
        <DataCredit sport={sport} />
      </footer>
    </main>
  );
}

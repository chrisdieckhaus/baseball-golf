import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import RosterGame from "@/components/RosterGame";
import { rosterState } from "@/lib/roster";
import { getRosterRound, isPlayableRosterDate } from "@/lib/roster-data";
import { rosterData } from "@/lib/roster-pool";
import { todayET } from "@/lib/round";
import styles from "@/app/page.module.css";

export const metadata: Metadata = {
  title: "Roster Reveal",
  description: "A daily baseball game: you get the year, name the team from its starting lineup, revealed one player at a time.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  const roundDate = isPlayableRosterDate(date, today) ? date : today;
  const { round, teamSeason } = await getRosterRound(roundDate);
  return (
    <RosterGame
      key={round.date}
      round={round}
      initial={rosterState(teamSeason, 1, null)}
      isToday={round.date === today}
      today={today}
    />
  );
}

export default function RosterPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Roster <span>Reveal</span>
        </h1>
        <p className={styles.tagline}>
          You get the year. Name the team from its lineup, one player at a time. One guess. Fewest players wins.
        </p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Filling out the lineup card…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Every AL and NL team from {rosterData.firstYear} through {rosterData.lastYear}, plus the 1914–15 Federal
          League. The lineup is the main starter at each position, plus the DH and the ace, or the top two starters for
          teams without a DH, from the most obscure player to the most famous.
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

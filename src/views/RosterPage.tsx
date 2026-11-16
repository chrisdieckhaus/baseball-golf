import { Suspense } from "react";
import { connection } from "next/server";
import RosterGame from "@/components/RosterGame";
import { rosterState } from "@/lib/roster";
import { getRosterRound, isPlayableRosterDate } from "@/lib/roster-data";
import { rosterDataFor } from "@/lib/roster-pool";
import { todayET } from "@/lib/round";
import { seasonLabel, type Sport } from "@/lib/sport";
import { DataCredit } from "./footers";
import type { SearchParams } from "./GolfPage";
import HowToPlay from "./HowToPlay";
import styles from "@/app/page.module.css";

async function TodaysRound({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  const roundDate = isPlayableRosterDate(date, today) ? date : today;
  const { round, teamSeason } = await getRosterRound(roundDate, sport);
  return (
    <RosterGame
      key={round.date}
      round={round}
      initial={rosterState(teamSeason, 1, null)}
      isToday={round.date === today}
      today={today}
      sport={sport}
    />
  );
}

function RosterNote({ sport }: { sport: Sport }) {
  const data = rosterDataFor(sport);
  if (sport === "nba") {
    return (
      <p className={styles.dataNote}>
        Every BAA, NBA and ABA team from {seasonLabel("nba", data.firstYear)} through{" "}
        {seasonLabel("nba", data.lastYear)}. The lineup is the team&apos;s eight players with the most minutes (most
        points before minutes were kept, in 1951–52), from the most obscure to the most famous.
      </p>
    );
  }
  return (
    <p className={styles.dataNote}>
      Every AL and NL team from {data.firstYear} through {data.lastYear}, plus the 1914–15 Federal League. The lineup is
      the main starter at each position, plus the DH and the ace, or the top two starters for teams without a DH, from
      the most obscure player to the most famous.
    </p>
  );
}

/** Roster Reveal (/roster or /nba/roster). */
export default function RosterPage({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Roster <span>Reveal</span>
        </h1>
        <p className={styles.tagline}>
          You get the {sport === "nba" ? "season" : "year"}. Name the team from its lineup, one player at a time. One
          guess. Fewest players wins.
        </p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Filling out the lineup card…</p>}>
        <TodaysRound searchParams={searchParams} sport={sport} />
      </Suspense>

      {sport === "mlb" && <HowToPlay game="roster" />}

      <footer className={styles.footer}>
        <RosterNote sport={sport} />
        <DataCredit sport={sport} />
      </footer>
    </main>
  );
}

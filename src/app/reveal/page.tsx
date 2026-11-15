import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import RevealGame from "@/components/RevealGame";
import { revealState } from "@/lib/reveal";
import { getRevealRound, isPlayableRevealDate } from "@/lib/reveal-data";
import { revealData } from "@/lib/reveal-pool";
import { isValidSeed, practiceEnabled, todayET } from "@/lib/round";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Sports Revealer",
  description: "A daily baseball game: name the mystery player from his stats, one clue per inning.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { seed, date } = await searchParams;
  const practice = practiceEnabled();
  const practiceSeed = practice && isValidSeed(seed) ? seed : undefined;
  const today = todayET();
  const roundDate = !practiceSeed && isPlayableRevealDate(date, today) ? date : today;
  const { round, player } = await getRevealRound(roundDate, practiceSeed);
  return (
    <RevealGame
      key={practiceSeed ?? round.date}
      round={round}
      initial={revealState(player, [])}
      isToday={!practiceSeed && round.date === today}
      today={today}
      practiceEnabled={practice}
    />
  );
}

export default function RevealPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Sports <span>Revealer</span>
        </h1>
        <p className={styles.tagline}>Name the mystery player. One clue per inning, one guess per clue.</p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Warming up the scoreboard…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Mystery players come from the top 150 in career WAR (Baseball-Reference). Stats through the{" "}
          {revealData.throughSeason} season, for players who debuted in {revealData.firstDebutYear} or later.
          Ranks in parentheses are all-time career ranks.
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

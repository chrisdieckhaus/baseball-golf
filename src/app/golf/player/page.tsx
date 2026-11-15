import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import ModeSwitch from "@/components/ModeSwitch";
import PlayerGolfGame from "@/components/PlayerGolfGame";
import { leaderboards } from "@/lib/leaderboards";
import { getPlayerRound, isPlayablePlayerDate } from "@/lib/player-golf-data";
import { todayET } from "@/lib/round";
import { MAX_HOLE_SCORE, MAX_TARGET_RANK } from "@/lib/scoring";
import styles from "@/app/page.module.css";

export const metadata: Metadata = {
  title: { absolute: "Baseball Golf: Player · Daily Dugout" },
  description: "A daily baseball trivia game: we name the player, you name his all-time career rank. Lowest score wins.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function TodaysRound({ searchParams }: { searchParams: SearchParams }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  const roundDate = isPlayablePlayerDate(date, today) ? date : today;
  const round = await getPlayerRound(roundDate);
  return <PlayerGolfGame key={round.date} round={round} isToday={round.date === today} today={today} />;
}

export default function PlayerModePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Baseball <span>Golf</span>
        </h1>
        <ModeSwitch current="player" />
        <p className={styles.tagline}>
          Three holes. We name the player, you name his all-time rank, as close to the pin as you can. Lowest score
          wins.
        </p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Setting up today&apos;s course…</p>}>
        <TodaysRound searchParams={searchParams} />
      </Suspense>

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Every player is in the top {MAX_TARGET_RANK} of his stat. A guess anywhere inside a tie counts as exact, and a
          hole scores at most {MAX_HOLE_SCORE}.
        </p>
        <p className={styles.dataNote}>
          Stats through the {leaderboards.throughSeason} season, for players who debuted in{" "}
          {leaderboards.firstDebutYear} or later. Career totals include the 1920–48 Negro Leagues.
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

import { Suspense } from "react";
import { connection } from "next/server";
import Game from "@/components/Game";
import { getRound, leaderboards } from "@/lib/data";
import { todayET } from "@/lib/round";
import styles from "./page.module.css";

async function TodaysRound() {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  return <Game round={getRound(todayET())} />;
}

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Baseball <span>Golf</span>
        </h1>
        <p className={styles.tagline}>
          Three holes. Name the player at each all-time rank. Closest to the pin wins — lowest score is best.
        </p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Setting up today&apos;s course…</p>}>
        <TodaysRound />
      </Suspense>

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Stats through the {leaderboards.throughSeason} season. Career totals include the
          1871–75 National Association and the 1920–48 Negro Leagues.
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

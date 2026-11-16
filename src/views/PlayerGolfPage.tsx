import { Suspense } from "react";
import { connection } from "next/server";
import ModeSwitch from "@/components/ModeSwitch";
import PlayerGolfGame from "@/components/PlayerGolfGame";
import { getPlayerRound, isPlayablePlayerDate } from "@/lib/player-golf-data";
import { todayET } from "@/lib/round";
import { MAX_HOLE_SCORE, MAX_TARGET_RANK } from "@/lib/scoring";
import type { Sport } from "@/lib/sport";
import { DataCredit, GolfTitle, StatsNote } from "./footers";
import type { SearchParams } from "./GolfPage";
import HowToPlay from "./HowToPlay";
import styles from "@/app/page.module.css";

async function TodaysRound({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  // Render per request so the round rolls over at midnight Eastern.
  await connection();
  const { date } = await searchParams;
  const today = todayET();
  const roundDate = isPlayablePlayerDate(date, today) ? date : today;
  const round = await getPlayerRound(roundDate, sport);
  return <PlayerGolfGame key={round.date} round={round} isToday={round.date === today} today={today} sport={sport} />;
}

/** Golf's Player mode (/golf/player or /nba/golf/player). */
export default function PlayerGolfPage({ searchParams, sport }: { searchParams: SearchParams; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <GolfTitle sport={sport} />
        </h1>
        <ModeSwitch current="player" sport={sport} />
        <p className={styles.tagline}>
          Three holes. We name the player, you name his all-time rank. Lowest score
          wins.
        </p>
      </header>

      <Suspense fallback={<p className={styles.loading}>Setting up today&apos;s round…</p>}>
        <TodaysRound searchParams={searchParams} sport={sport} />
      </Suspense>

      {sport === "mlb" && <HowToPlay game="player" />}

      <footer className={styles.footer}>
        <p className={styles.dataNote}>
          Every player is in the top {MAX_TARGET_RANK} of his stat. A guess anywhere inside a tie counts as exact, and a
          hole scores at most {MAX_HOLE_SCORE}.
        </p>
        <StatsNote sport={sport} />
        <DataCredit sport={sport} />
      </footer>
    </main>
  );
}

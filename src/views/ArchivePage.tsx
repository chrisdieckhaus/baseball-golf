// The archive page of any game, in either sport: /golf/archive,
// /golf/player/archive, /number/archive and the /nba golf twins.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import LocalArchive from "@/components/LocalArchive";
import { NUMBER_LAUNCH_DATE, numberRoundNumber } from "@/lib/number";
import { PLAYER_GOLF_LAUNCH_DATE } from "@/lib/player-golf";
import { loadSavedStatuses } from "@/lib/saved-status";
import type { GameKey } from "@/lib/local-status";
import { LAUNCH_DATE, playableDates, roundNumber, todayET } from "@/lib/round";
import { basePath, type Sport } from "@/lib/sport";
import { GolfTitle } from "./footers";
import styles from "@/app/archive.module.css";

export type ArchiveGame = GameKey;

const GAMES: Record<
  ArchiveGame,
  { path: string; first: string; number: (d: string) => number; log: string }
> = {
  golf: { path: "/golf", first: LAUNCH_DATE, number: roundNumber, log: "[archive]" },
  player: { path: "/golf/player", first: PLAYER_GOLF_LAUNCH_DATE, number: roundNumber, log: "[archive]" },
  number: { path: "/number", first: NUMBER_LAUNCH_DATE, number: numberRoundNumber, log: "[number/archive]" },
};

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function RoundList({ game, sport }: { game: ArchiveGame; sport: Sport }) {
  // Render per request so the list rolls over at midnight Eastern.
  await connection();
  const today = todayET();
  const g = GAMES[game];
  const rounds = playableDates(today)
    .filter((d) => d >= g.first && d < today)
    .reverse()
    .map((date) => ({ date, number: g.number(date), label: formatDate(date) }));
  return <LocalArchive game={game} sport={sport} rounds={rounds} saved={await loadSavedStatuses(game, sport, g.log)} />;
}

function Title({ game, sport }: { game: ArchiveGame; sport: Sport }) {
  if (game === "golf") return <GolfTitle sport={sport} />;
  if (game === "player") return <GolfTitle sport={sport} suffix=": Player" />;
  return (
      <>
        Hit the <span>Number</span>
      </>
  );
}

export default function ArchivePage({ game, sport }: { game: ArchiveGame; sport: Sport }) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <Title game={game} sport={sport} />
        </h1>
        <p className={styles.tagline}>Previous rounds. Play any one you missed.</p>
        <Link href={`${basePath(sport)}${GAMES[game].path}`} className={styles.back}>
          ← Today&apos;s round
        </Link>
      </header>
      <Suspense fallback={<p className={styles.empty}>Loading rounds…</p>}>
        <RoundList game={game} sport={sport} />
      </Suspense>
    </main>
  );
}

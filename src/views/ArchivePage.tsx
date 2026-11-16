// The archive page of any game, in either sport: /golf/archive,
// /golf/player/archive, /rank/archive, /roster/archive and their /nba twins.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import LocalArchive from "@/components/LocalArchive";
import { golfStatus, numberStatus, rankStatus, rosterStatus, type Status } from "@/lib/archive-status";
import { getDb } from "@/lib/db";
import { getRankProgress, getRosterProgress } from "@/lib/game-plays";
import { NUMBER_LAUNCH_DATE, numberRoundNumber } from "@/lib/number";
import { getNumberProgress } from "@/lib/number-plays";
import { readPlayerId } from "@/lib/player-cookie";
import { PLAYER_GOLF_LAUNCH_DATE } from "@/lib/player-golf";
import { getPlayerGolfProgress } from "@/lib/player-golf-plays";
import { getPlayerProgress } from "@/lib/plays";
import { rankRoundNumber, RANK_LAUNCH_DATE } from "@/lib/rank";
import { ROSTER_LAUNCH_DATE, rosterRoundNumber } from "@/lib/roster";
import { LAUNCH_DATE, playableDates, roundNumber, todayET } from "@/lib/round";
import { basePath, type Sport } from "@/lib/sport";
import { GolfTitle } from "./footers";
import styles from "@/app/archive.module.css";

export type ArchiveGame = "golf" | "player" | "rank" | "roster" | "number";

const GAMES: Record<
  ArchiveGame,
  { path: string; first: string; number: (d: string) => number; log: string }
> = {
  golf: { path: "/golf", first: LAUNCH_DATE, number: roundNumber, log: "[archive]" },
  player: { path: "/golf/player", first: PLAYER_GOLF_LAUNCH_DATE, number: roundNumber, log: "[archive]" },
  rank: { path: "/rank", first: RANK_LAUNCH_DATE, number: rankRoundNumber, log: "[rank/archive]" },
  roster: { path: "/roster", first: ROSTER_LAUNCH_DATE, number: rosterRoundNumber, log: "[roster/archive]" },
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

async function loadSaved(game: ArchiveGame, sport: Sport): Promise<Record<string, Status>> {
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return {};
  try {
    if (game === "golf") {
      const progress = await getPlayerProgress(db, me, sport);
      return Object.fromEntries([...progress].map(([date, p]) => [date, golfStatus(p.holesPlayed, p.totalScore)]));
    }
    if (game === "player") {
      const progress = await getPlayerGolfProgress(db, me, sport);
      return Object.fromEntries([...progress].map(([date, p]) => [date, golfStatus(p.holesPlayed, p.totalScore)]));
    }
    if (game === "rank") {
      const progress = await getRankProgress(db, me, sport);
      return Object.fromEntries([...progress].map(([date, score]) => [date, rankStatus(score)]));
    }
    if (game === "number") {
      const progress = await getNumberProgress(db, me);
      return Object.fromEntries(
        [...progress].filter(([, p]) => p.ids.length > 0).map(([date, p]) => [date, numberStatus(p.ids.length, p.done, p.bust, p.score)]),
      );
    }
    const progress = await getRosterProgress(db, me, sport);
    return Object.fromEntries([...progress].map(([date, p]) => [date, rosterStatus(p.revealed, p.correct, p.done)]));
  } catch (e) {
    console.error(`${GAMES[game].log} Couldn't load this player's ${sport} plays`, e);
    return {};
  }
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
  return <LocalArchive game={game} sport={sport} rounds={rounds} saved={await loadSaved(game, sport)} />;
}

function Title({ game, sport }: { game: ArchiveGame; sport: Sport }) {
  if (game === "golf") return <GolfTitle sport={sport} />;
  if (game === "player") return <GolfTitle sport={sport} suffix=": Player" />;
  if (game === "number")
    return (
      <>
        Hit the <span>Number</span>
      </>
    );
  if (game === "rank")
    return (
      <>
        Stats <span>Ranker</span>
      </>
    );
  return (
    <>
      Roster <span>Reveal</span>
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

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import LocalArchive from "@/components/LocalArchive";
import { golfStatus, type Status } from "@/lib/archive-status";
import { getDb } from "@/lib/db";
import { readPlayerId } from "@/lib/player-cookie";
import { PLAYER_GOLF_LAUNCH_DATE } from "@/lib/player-golf";
import { getPlayerGolfProgress } from "@/lib/player-golf-plays";
import { playableDates, roundNumber, todayET } from "@/lib/round";
import styles from "@/app/archive.module.css";

export const metadata: Metadata = {
  title: "Baseball Golf: Player archive",
  description: "Play any previous daily round of Baseball Golf's Player mode.",
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

async function loadSaved(): Promise<Record<string, Status>> {
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return {};
  try {
    const progress = await getPlayerGolfProgress(db, me);
    return Object.fromEntries([...progress].map(([date, p]) => [date, golfStatus(p.holesPlayed, p.totalScore)]));
  } catch (e) {
    console.error("[archive] Couldn't load this player's Player mode progress", e);
    return {};
  }
}

async function RoundList() {
  // Render per request so the list rolls over at midnight Eastern.
  await connection();
  const today = todayET();
  const rounds = playableDates(today)
    .filter((d) => d >= PLAYER_GOLF_LAUNCH_DATE && d < today)
    .reverse()
    .map((date) => ({ date, number: roundNumber(date), label: formatDate(date) }));
  return <LocalArchive game="player" rounds={rounds} saved={await loadSaved()} />;
}

export default function PlayerArchivePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Baseball <span>Golf</span>: Player
        </h1>
        <p className={styles.tagline}>Previous rounds. Play any one you missed.</p>
        <Link href="/golf/player" className={styles.back}>
          ← Today&apos;s round
        </Link>
      </header>
      <Suspense fallback={<p className={styles.empty}>Loading rounds…</p>}>
        <RoundList />
      </Suspense>
    </main>
  );
}

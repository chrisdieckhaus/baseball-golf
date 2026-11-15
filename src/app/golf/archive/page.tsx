import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import LocalArchive, { golfStatus, type Status } from "@/components/LocalArchive";
import { getDb } from "@/lib/db";
import { readPlayerId } from "@/lib/player-cookie";
import { getPlayerProgress } from "@/lib/plays";
import { playableDates, roundNumber, todayET } from "@/lib/round";
import styles from "@/app/archive.module.css";

export const metadata: Metadata = {
  title: "Baseball Golf archive",
  description: "Play any previous daily round of Baseball Golf.",
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
    const progress = await getPlayerProgress(db, me);
    return Object.fromEntries([...progress].map(([date, p]) => [date, golfStatus(p.holesPlayed, p.totalScore)]));
  } catch (e) {
    console.error("[archive] Couldn't load this player's progress", e);
    return {};
  }
}

async function RoundList() {
  // Render per request so the list rolls over at midnight Eastern.
  await connection();
  const today = todayET();
  const rounds = playableDates(today)
    .filter((d) => d < today)
    .reverse()
    .map((date) => ({ date, number: roundNumber(date), label: formatDate(date) }));
  return <LocalArchive game="golf" rounds={rounds} saved={await loadSaved()} />;
}

export default function ArchivePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Baseball <span>Golf</span>
        </h1>
        <p className={styles.tagline}>Previous rounds. Play any one you missed.</p>
        <Link href="/golf" className={styles.back}>
          ← Today&apos;s round
        </Link>
      </header>
      <Suspense fallback={<p className={styles.empty}>Loading rounds…</p>}>
        <RoundList />
      </Suspense>
    </main>
  );
}

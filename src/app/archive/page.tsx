import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { readPlayerId } from "@/lib/player-cookie";
import { getPlayerProgress, type RoundProgress } from "@/lib/plays";
import { playableDates, roundNumber, todayET } from "@/lib/round";
import styles from "./archive.module.css";

export const metadata: Metadata = {
  title: "Previous rounds · Baseball Golf",
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

async function loadProgress(): Promise<Map<string, RoundProgress>> {
  const db = getDb();
  const me = await readPlayerId();
  if (!db || !me) return new Map();
  try {
    return await getPlayerProgress(db, me);
  } catch (e) {
    console.error("[archive] Couldn't load this player's progress", e);
    return new Map();
  }
}

function Status({ progress }: { progress: RoundProgress | undefined }) {
  if (progress?.totalScore != null) {
    return (
      <span className={styles.done}>
        Score <strong>{progress.totalScore}</strong>
      </span>
    );
  }
  if (progress && progress.holesPlayed > 0) {
    return <span className={styles.partial}>In progress · {progress.holesPlayed}/3</span>;
  }
  return <span className={styles.play}>Play →</span>;
}

async function RoundList() {
  // Render per request so the list rolls over at midnight Eastern.
  await connection();
  const today = todayET();
  const dates = playableDates(today)
    .filter((d) => d < today)
    .reverse();
  const progress = await loadProgress();

  if (dates.length === 0) return <p className={styles.empty}>No previous rounds yet. Check back tomorrow.</p>;

  return (
    <ol className={styles.list}>
      {dates.map((date) => (
        <li key={date}>
          <Link href={`/?date=${date}`} className={styles.row}>
            <span className={styles.num}>#{roundNumber(date)}</span>
            <span className={styles.date}>{formatDate(date)}</span>
            <Status progress={progress.get(date)} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function ArchivePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Previous <span>rounds</span>
        </h1>
        <p className={styles.tagline}>
          Play any round you missed. Past rounds don&apos;t count toward that day&apos;s percentile.
        </p>
        <Link href="/" className={styles.back}>
          ← Today&apos;s round
        </Link>
      </header>
      <Suspense fallback={<p className={styles.empty}>Loading rounds…</p>}>
        <RoundList />
      </Suspense>
    </main>
  );
}

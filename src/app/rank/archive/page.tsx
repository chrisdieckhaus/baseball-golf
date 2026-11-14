import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import LocalArchive from "@/components/LocalArchive";
import { rankRoundNumber, RANK_LAUNCH_DATE } from "@/lib/rank";
import { playableDates, todayET } from "@/lib/round";
import styles from "../../archive/archive.module.css";

export const metadata: Metadata = {
  title: "Stats Ranker archive",
  description: "Play any previous daily round of Stats Ranker.",
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

async function RoundList() {
  // Render per request so the list rolls over at midnight Eastern.
  await connection();
  const today = todayET();
  const rounds = playableDates(today)
    .filter((d) => d >= RANK_LAUNCH_DATE && d < today)
    .reverse()
    .map((date) => ({
      date,
      number: rankRoundNumber(date),
      label: formatDate(date),
    }));
  return <LocalArchive game="rank" rounds={rounds} />;
}

export default function RankArchivePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Previous <span>rounds</span>
        </h1>
        <p className={styles.tagline}>Play any Stats Ranker round you missed. Your results on this device show here.</p>
        <Link href="/rank" className={styles.back}>
          ← Today&apos;s round
        </Link>
      </header>
      <Suspense fallback={<p className={styles.empty}>Loading rounds…</p>}>
        <RoundList />
      </Suspense>
    </main>
  );
}

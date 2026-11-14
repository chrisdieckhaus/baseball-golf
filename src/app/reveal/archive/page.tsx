import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import LocalArchive, { revealStatus, type Status } from "@/components/LocalArchive";
import { getDb } from "@/lib/db";
import { getRevealProgress } from "@/lib/game-plays";
import { readPlayerId } from "@/lib/player-cookie";
import { revealRoundNumber, REVEAL_LAUNCH_DATE } from "@/lib/reveal";
import { playableDates, todayET } from "@/lib/round";
import styles from "../../archive/archive.module.css";

export const metadata: Metadata = {
  title: "Sports Revealer archive",
  description: "Play any previous daily round of Sports Revealer.",
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
    const progress = await getRevealProgress(db, me);
    return Object.fromEntries([...progress].map(([date, p]) => [date, revealStatus(p.innings, p.solved, p.done)]));
  } catch (e) {
    console.error("[reveal/archive] Couldn't load this player's plays", e);
    return {};
  }
}

async function RoundList() {
  // Render per request so the list rolls over at midnight Eastern.
  await connection();
  const today = todayET();
  const rounds = playableDates(today)
    .filter((d) => d >= REVEAL_LAUNCH_DATE && d < today)
    .reverse()
    .map((date) => ({
      date,
      number: revealRoundNumber(date),
      label: formatDate(date),
    }));
  return <LocalArchive game="reveal" rounds={rounds} saved={await loadSaved()} />;
}

export default function RevealArchivePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Previous <span>rounds</span>
        </h1>
        <p className={styles.tagline}>
          Play any Sports Revealer round you missed. Your results on this device show here.
        </p>
        <Link href="/reveal" className={styles.back}>
          ← Today&apos;s round
        </Link>
      </header>
      <Suspense fallback={<p className={styles.empty}>Loading rounds…</p>}>
        <RoundList />
      </Suspense>
    </main>
  );
}

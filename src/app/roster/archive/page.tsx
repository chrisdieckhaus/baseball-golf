import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import LocalArchive, { rosterStatus, type Status } from "@/components/LocalArchive";
import { getDb } from "@/lib/db";
import { getRosterProgress } from "@/lib/game-plays";
import { readPlayerId } from "@/lib/player-cookie";
import { ROSTER_LAUNCH_DATE, rosterRoundNumber } from "@/lib/roster";
import { playableDates, todayET } from "@/lib/round";
import styles from "../../archive/archive.module.css";

export const metadata: Metadata = {
  title: "Roster Reveal archive",
  description: "Play any previous daily round of Roster Reveal.",
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
    const progress = await getRosterProgress(db, me);
    return Object.fromEntries([...progress].map(([date, p]) => [date, rosterStatus(p.revealed, p.correct, p.done)]));
  } catch (e) {
    console.error("[roster/archive] Couldn't load this player's plays", e);
    return {};
  }
}

async function RoundList() {
  // Render per request so the list rolls over at midnight Eastern.
  await connection();
  const today = todayET();
  const rounds = playableDates(today)
    .filter((d) => d >= ROSTER_LAUNCH_DATE && d < today)
    .reverse()
    .map((date) => ({
      date,
      number: rosterRoundNumber(date),
      label: formatDate(date),
    }));
  return <LocalArchive game="roster" rounds={rounds} saved={await loadSaved()} />;
}

export default function RosterArchivePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Previous <span>rounds</span>
        </h1>
        <p className={styles.tagline}>
          Play any Roster Reveal round you missed. Your results on this device show here.
        </p>
        <Link href="/roster" className={styles.back}>
          ← Today&apos;s round
        </Link>
      </header>
      <Suspense fallback={<p className={styles.empty}>Loading rounds…</p>}>
        <RoundList />
      </Suspense>
    </main>
  );
}

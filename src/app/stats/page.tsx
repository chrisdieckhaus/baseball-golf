import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { todayET } from "@/lib/round";
import { getUsageStats, type GameUsage } from "@/lib/usage-stats";
import styles from "@/app/page.module.css";
import s from "./stats.module.css";

// Unlisted page for the site owner: not linked anywhere, not indexed.
export const metadata: Metadata = {
  title: "Stats · Daily Dugout",
  robots: { index: false, follow: false },
};

function Section({ title, games }: { title: string; games: GameUsage[] }) {
  const sum = (k: keyof Omit<GameUsage, "name" | "sport">) => games.reduce((n, g) => n + g[k], 0);
  return (
    <section className={s.section}>
      <h2 className={s.heading}>{title}</h2>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Game</th>
            <th>Today</th>
            <th>Yest.</th>
            <th>7 days</th>
            <th>All</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.name}>
              <td>
                {g.name}
                {g.unfinishedToday > 0 && <span className={s.open}>+{g.unfinishedToday} unfinished today</span>}
              </td>
              <td className={s.strong}>{g.today}</td>
              <td>{g.yesterday}</td>
              <td>{g.last7Days}</td>
              <td>{g.allTime}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className={s.strong}>{sum("today")}</td>
            <td>{sum("yesterday")}</td>
            <td>{sum("last7Days")}</td>
            <td>{sum("allTime")}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

async function Counts() {
  await connection();
  const db = getDb();
  if (!db) return <p className={styles.loading}>No database is configured.</p>;
  const stats = await getUsageStats(db, todayET());
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
  return (
    <>
      <p className={s.summary}>
        {stats.playersToday} {stats.playersToday === 1 ? "player" : "players"} finished a game today · as of {time} ET
      </p>
      <Section title="Baseball" games={stats.games.filter((g) => g.sport === "Baseball")} />
      <Section title="Basketball" games={stats.games.filter((g) => g.sport === "Basketball")} />
    </>
  );
}

/** /stats: finished plays per game, for checking usage. */
export default function StatsPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Site <span>Stats</span>
        </h1>
      </header>
      <Suspense fallback={<p className={styles.loading}>Counting…</p>}>
        <Counts />
      </Suspense>
      <p className={s.note}>
        Finished rounds, counted on the day (ET) they were finished. Archive plays count. Includes your own plays and
        anything played on preview deployments, which share the database.
      </p>
    </main>
  );
}

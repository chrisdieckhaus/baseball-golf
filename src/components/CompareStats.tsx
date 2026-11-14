import type { RankStats, RevealStats } from "@/lib/game-plays";
import { inningName } from "@/lib/reveal";
import styles from "./CompareStats.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
const avg = (n: number) => n.toFixed(1).replace(/\.0$/, "");

/** "You beat 78% of the 41 other players who finished today", same wording as Baseball Golf. */
function PercentileLine({
  stats,
  isToday,
}: {
  stats: { percentBeaten: number | null; others: number; tied: number };
  isToday: boolean;
}) {
  if (stats.percentBeaten === null) {
    return (
      <p className={styles.percentile}>
        You&apos;re the first to finish this round. Check back later to see how you stack up.
      </p>
    );
  }
  const who = isToday ? "who finished today" : stats.others === 1 ? "who's finished this round" : "who've finished this round";
  return (
    <p className={styles.percentile}>
      You beat <strong>{stats.percentBeaten}%</strong> of the {fmt(stats.others)} other{" "}
      {stats.others === 1 ? "player" : "players"} {who}
      {stats.tied > 0 && <> (tied with {fmt(stats.tied)})</>}.
    </p>
  );
}

export function RankCompare({ stats, isToday }: { stats: RankStats; isToday: boolean }) {
  return (
    <div className={styles.compare}>
      <PercentileLine stats={stats} isToday={isToday} />
      {stats.averageScore !== null && (
        <dl className={styles.facts}>
          <div>
            <dt>Average</dt>
            <dd>{stats.averageScore === 0 ? "Perfect" : `Off by ${avg(stats.averageScore)}`}</dd>
          </div>
          <div>
            <dt>Perfect orders</dt>
            <dd>{stats.perfectPercent}%</dd>
          </div>
          <div>
            <dt>Players</dt>
            <dd>{fmt(stats.finishers)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/**
 * Sports Revealer: your percentile, how many solved it, and a Wordle-style
 * chart of the inning everyone solved it in (or struck out), with yours marked.
 */
export function RevealCompare({ stats, mine, isToday }: { stats: RevealStats; mine: number; isToday: boolean }) {
  const max = Math.max(1, ...stats.distribution);
  return (
    <div className={styles.compare}>
      <PercentileLine stats={stats} isToday={isToday} />
      <dl className={styles.facts}>
        <div>
          <dt>Solved it</dt>
          <dd>{stats.solvedPercent}%</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{stats.averageInning === null ? "—" : `${avg(stats.averageInning)} innings`}</dd>
        </div>
        <div>
          <dt>Players</dt>
          <dd>{fmt(stats.finishers)}</dd>
        </div>
      </dl>
      <ol className={styles.chart} aria-label="How many players solved it in each inning">
        {stats.distribution.map((n, i) => {
          const label = i < 9 ? String(i + 1) : "✗";
          const title = i < 9 ? `${inningName(i + 1)} inning` : "Struck out";
          return (
            <li key={i} className={i + 1 === mine ? styles.mine : undefined} title={`${title}: ${n}`}>
              <span className={styles.barLabel}>{label}</span>
              <span className={styles.barTrack}>
                <span className={styles.bar} style={{ width: `${Math.max(n ? 6 : 0, (n / max) * 100)}%` }} />
              </span>
              <span className={styles.barCount}>{fmt(n)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { numberBucket, numberBucketLimits } from "@/lib/number";
import type { NumberStats } from "@/lib/number-plays";
import { ordinal } from "@/lib/scoring";
import type { RoundStats } from "@/lib/types";
import styles from "./CompareStats.module.css";

const fmt = (n: number) => n.toLocaleString("en-US");
const avg = (n: number) => n.toFixed(1).replace(/\.0$/, "");

/** "You beat 78% of the 41 other players who finished today", the same line in every game. */
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

/**
 * Baseball Golf: your percentile and how many have played. The average round
 * is in the scorecard's Avg row.
 */
export function GolfCompare({ stats, isToday }: { stats: RoundStats; isToday: boolean }) {
  return (
    <div className={styles.compare}>
      <PercentileLine stats={stats} isToday={isToday} />
      <dl className={styles.facts}>
        <div>
          <dt>Percentile</dt>
          <dd>{stats.percentBeaten === null ? "–" : ordinal(stats.percentBeaten)}</dd>
        </div>
        <div>
          <dt>Played</dt>
          <dd>{fmt(stats.finishers)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * A Wordle-style bar chart of how everyone finished, with the player's own
 * bucket highlighted. Used by Hit the Number.
 */
function DistributionChart({
  counts,
  mine,
  label,
  bucketLabel,
  bucketTitle,
  wideLabels = false,
}: {
  counts: number[];
  /** Index of the player's own bucket. */
  mine: number;
  label: string;
  bucketLabel: (i: number) => string;
  bucketTitle: (i: number) => string;
  /** Room for labels longer than a digit or two ("≤225"). */
  wideLabels?: boolean;
}) {
  const max = Math.max(1, ...counts);
  return (
    <ol className={`${styles.chart} ${wideLabels ? styles.wide : ""}`} aria-label={label}>
      {counts.map((n, i) => (
        <li key={i} className={i === mine ? styles.mine : undefined} title={`${bucketTitle(i)}: ${n}`}>
          <span className={styles.barLabel}>{bucketLabel(i)}</span>
          <span className={styles.barTrack}>
            <span className={styles.bar} style={{ width: `${Math.max(n ? 6 : 0, (n / max) * 100)}%` }} />
          </span>
          <span className={styles.barCount}>{fmt(n)}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Hit the Number: your percentile, the bullseye and bust rates, the average
 * miss, and a chart of how close everyone got, with yours marked. The bars are
 * a bullseye, off by up to 1%, 5%, 10% and 25% of the target, more, and busts.
 */
export function NumberCompare({
  stats,
  mine,
  target,
  isToday,
}: {
  stats: NumberStats;
  mine: { score: number | null; bust: boolean };
  target: number;
  isToday: boolean;
}) {
  const limits = numberBucketLimits(target);
  const label = (i: number) =>
    i === 0 ? "🎯" : i <= limits.length ? `≤${fmt(limits[i - 1])}` : i === limits.length + 1 ? `${fmt(limits.at(-1)! + 1)}+` : "💥";
  const title = (i: number) =>
    i === 0
      ? "Bullseye"
      : i <= limits.length
        ? `Off by ${i === 1 ? 1 : fmt(limits[i - 2] + 1)}–${fmt(limits[i - 1])}`
        : i === limits.length + 1
          ? `Off by more than ${fmt(limits.at(-1)!)}`
          : "Bust";
  return (
    <div className={styles.compare}>
      <PercentileLine stats={stats} isToday={isToday} />
      <dl className={styles.facts}>
        <div>
          <dt>Bullseyes</dt>
          <dd>{stats.bullseyePercent}%</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{stats.averageOff === null ? "—" : stats.averageOff === 0 ? "Bullseye" : `Off by ${avg(stats.averageOff)}`}</dd>
        </div>
        <div>
          <dt>Busts</dt>
          <dd>{stats.bustPercent}%</dd>
        </div>
        <div>
          <dt>Played</dt>
          <dd>{fmt(stats.finishers)}</dd>
        </div>
      </dl>
      <DistributionChart
        counts={stats.distribution}
        mine={numberBucket(mine.score, mine.bust, target)}
        label="How close everyone got"
        bucketLabel={label}
        bucketTitle={title}
        wideLabels
      />
    </div>
  );
}


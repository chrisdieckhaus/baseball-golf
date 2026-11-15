// Each sport's data credit, shown at the bottom of every game page.
import { leaderboardsFor } from "@/lib/leaderboards";
import { seasonLabel, type Sport } from "@/lib/sport";
import styles from "@/app/page.module.css";

/** "Stats through …" for the career-stat games (Golf, Player mode, Stats Ranker). */
export function StatsNote({ sport }: { sport: Sport }) {
  const lb = leaderboardsFor(sport);
  if (sport === "nba") {
    return (
      <p className={styles.dataNote}>
        Regular-season stats through the {seasonLabel("nba", lb.throughSeason)} season. Careers combine the NBA, ABA and
        BAA, like Basketball-Reference&apos;s leaderboards.
      </p>
    );
  }
  return (
    <p className={styles.dataNote}>
      Stats through the {lb.throughSeason} season, for players who debuted in {lb.firstDebutYear} or later. Career totals
      include the 1920–48 Negro Leagues.
    </p>
  );
}

export function DataCredit({ sport }: { sport: Sport }) {
  if (sport === "nba") {
    return (
      <p>
        Data:{" "}
        <a href="https://www.basketball-reference.com/" target="_blank" rel="noreferrer">
          Basketball-Reference.com
        </a>
        .
      </p>
    );
  }
  return (
    <p>
      Data:{" "}
      <a href="https://sabr.org/lahman-database/" target="_blank" rel="noreferrer">
        Lahman Baseball Database
      </a>
      , licensed{" "}
      <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
        CC BY-SA 3.0
      </a>
      .
    </p>
  );
}

/** "Baseball Golf" / "Basketball Golf" as the page title shows it. */
export function GolfTitle({ sport, suffix }: { sport: Sport; suffix?: string }) {
  return (
    <>
      {sport === "nba" ? "Basketball" : "Baseball"} <span>Golf</span>
      {suffix}
    </>
  );
}

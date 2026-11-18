"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { basePath, COPY, SPORTS, type Sport } from "@/lib/sport";
import Logo from "./Logo";
import styles from "./GameNav.module.css";

const GAMES = [
  { path: "/golf", label: "Golf" },
  { path: "/rank", label: "Ranker" },
  { path: "/roster", label: "Roster" },
  // Hit the Number is baseball only, so the NBA nav leaves it out.
  { path: "/number", label: "Number", mlbOnly: true },
  { path: "/king", label: "King" },
];

/** Splits "/nba/rank/archive" into its sport and the game path ("/rank/archive"). */
function parsePath(pathname: string): { sport: Sport; path: string } {
  if (pathname === "/nba" || pathname.startsWith("/nba/")) return { sport: "nba", path: pathname.slice(4) || "/golf" };
  return { sport: "mlb", path: pathname };
}

/** Where the sport switch goes: the same page in the other sport, or Golf if that sport doesn't have this game. */
function sportSwitchPath(path: string, to: Sport): string {
  if (path === "/") return "/golf";
  if (to === "nba" && GAMES.some((g) => g.mlbOnly && path.startsWith(g.path))) return "/golf";
  return path;
}

/**
 * The Daily Dugout name and links to every game, shown at the top of each page.
 * The current game is highlighted. While NBA is on (`nbaEnabled`, from the
 * NBA_ENABLED kill switch), an MLB | NBA switch underneath moves to the same
 * page in the other sport.
 */
export default function GameNav({ nbaEnabled = false }: { nbaEnabled?: boolean }) {
  const pathname = usePathname();
  const { sport, path } = parsePath(pathname);
  const base = basePath(sport);
  // The /stats page isn't a game: nothing is highlighted and there's no sport switch.
  const isStats = path === "/stats";
  // Each game's archive counts as that game. "/" redirects to Baseball Golf.
  const current = isStats
    ? ""
    : path.startsWith("/rank")
    ? "/rank"
    : path.startsWith("/roster")
      ? "/roster"
      : path.startsWith("/number")
        ? "/number"
        : path.startsWith("/king")
          ? "/king"
          : "/golf";
  return (
    <nav className={styles.nav} aria-label="Games">
      <Link href="/" className={styles.brand}>
        <Logo size={44} className={styles.logo} />
        Daily Dugout
      </Link>
      {GAMES.filter((g) => !(g.mlbOnly && sport === "nba")).map((g) => (
        <Link
          key={g.path}
          href={`${base}${g.path}`}
          className={`${styles.link} ${current === g.path ? styles.active : ""}`}
          aria-current={current === g.path ? "page" : undefined}
        >
          {g.label}
        </Link>
      ))}
      {nbaEnabled && !isStats && (
        <div className={styles.sports} role="group" aria-label="Sport">
          {SPORTS.map((s) => (
            <Link
              key={s}
              href={`${basePath(s)}${sportSwitchPath(path, s)}`}
              className={`${styles.sport} ${s === sport ? styles.sportActive : ""}`}
              aria-current={s === sport ? "page" : undefined}
            >
              {COPY[s].short}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

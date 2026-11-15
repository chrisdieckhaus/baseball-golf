"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./GameNav.module.css";

const GAMES = [
  { href: "/golf", label: "Golf" },
  { href: "/rank", label: "Ranker" },
  { href: "/roster", label: "Roster" },
];

/** The Daily Dugout name and links to every game, shown at the top of each page. The current game is highlighted. */
export default function GameNav() {
  const pathname = usePathname();
  // Each game's archive counts as that game. "/" redirects to Baseball Golf.
  const current = pathname.startsWith("/rank") ? "/rank" : pathname.startsWith("/roster") ? "/roster" : "/golf";
  return (
    <nav className={styles.nav} aria-label="Games">
      <Link href="/" className={styles.brand}>
        Daily Dugout
      </Link>
      {GAMES.map((g) => (
        <Link
          key={g.href}
          href={g.href}
          className={`${styles.link} ${current === g.href ? styles.active : ""}`}
          aria-current={current === g.href ? "page" : undefined}
        >
          {g.label}
        </Link>
      ))}
    </nav>
  );
}

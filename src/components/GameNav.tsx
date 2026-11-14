"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./GameNav.module.css";

const GAMES = [
  { href: "/", label: "Golf" },
  { href: "/rank", label: "Ranker" },
  { href: "/reveal", label: "Revealer" },
];

/** The Daily Dugout name and links to every game, shown at the top of each page. The current game is highlighted. */
export default function GameNav() {
  const pathname = usePathname();
  // The archive belongs to Baseball Golf.
  const current = pathname === "/archive" ? "/" : pathname;
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

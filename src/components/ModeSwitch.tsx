import Link from "next/link";
import styles from "./ModeSwitch.module.css";

/**
 * Baseball Golf's two modes. Rank (/golf) gives a rank and asks for the player;
 * Player (/golf/player) gives a player and asks for his rank.
 */
export default function ModeSwitch({ current }: { current: "rank" | "player" }) {
  const modes = [
    { key: "rank", href: "/golf", label: "Rank" },
    { key: "player", href: "/golf/player", label: "Player" },
  ] as const;
  return (
    <nav className={styles.switch} aria-label="Baseball Golf mode">
      {modes.map((m) => (
        <Link
          key={m.key}
          href={m.href}
          className={`${styles.option} ${current === m.key ? styles.active : ""}`}
          aria-current={current === m.key ? "page" : undefined}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

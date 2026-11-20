// "How to play" under each baseball game: the rules in plain text, so people
// skimming and search engines both see what the game is, plus structured data
// (schema.org) that names it as a free browser game. Baseball only: the NBA
// pages are noindex and behind a kill switch.
import { MAX_HOLE_SCORE, MAX_TARGET_RANK } from "@/lib/scoring";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import styles from "@/app/page.module.css";

export type HowToGame = "golf" | "player" | "rank" | "roster" | "number" | "king";

const GAMES: Record<HowToGame, { name: string; path: string; summary: string; rules: string[] }> = {
  golf: {
    name: "Baseball Golf",
    path: "/golf",
    summary: "A daily baseball trivia game: name the player who holds an all-time career rank.",
    rules: [
      "Every round has three holes. Each hole gives a career stat and an all-time rank, like 83rd in RBIs.",
      `Name the player you think holds that rank. Your score for the hole is how many places his real rank is from the target, up to ${MAX_HOLE_SCORE}. A player outside the leaderboard scores ${MAX_HOLE_SCORE}.`,
      "Name the exact player and it's an ace: zero. Add up the three holes. Like golf, the lowest score wins.",
      "Everyone gets the same round, and a new one starts every day at midnight Eastern. Missed a day? Play it in the archive.",
    ],
  },
  player: {
    name: "Baseball Golf: Player mode",
    path: "/golf/player",
    summary: "A daily baseball trivia game: guess where a player ranks all-time in a career stat.",
    rules: [
      "Baseball Golf flipped around. Each of the three holes names a player and a career stat.",
      `Guess where he ranks all-time. Every player is in the top ${MAX_TARGET_RANK}, and a guess anywhere inside a tie counts as exact.`,
      `Your score for the hole is how many places you miss by, up to ${MAX_HOLE_SCORE}. Lowest total wins.`,
      "A new round starts every day at midnight Eastern, and past rounds are in the archive.",
    ],
  },
  rank: {
    name: "Stats Ranker",
    path: "/rank",
    summary: "A daily baseball stats game: put five players in order by a career stat.",
    rules: [
      "You get one career stat and five players from its all-time top 100, in a shuffled order.",
      "Put them in order, best first, and lock it in. You get one shot.",
      "Your score is how far each player is from his real spot, added up. Zero is perfect and 12 is the worst. Lowest score wins.",
      "A new round starts every day at midnight Eastern, and past rounds are in the archive.",
    ],
  },
  roster: {
    name: "Roster Reveal",
    path: "/roster",
    summary: "A daily baseball game: name the MLB team from its starting lineup.",
    rules: [
      "You get a season. That team's starting lineup is revealed one player at a time, from the most obscure to the most famous.",
      "Reveal as many players as you need, then make one guess: the team.",
      "Your score is how many players you saw, from 1 to 10. A wrong guess scores 11. Lowest score wins.",
      "A new round starts every day at midnight Eastern, and past rounds are in the archive.",
    ],
  },
  number: {
    name: "Hit the Number",
    path: "/number",
    summary: "A daily baseball stats game: name three players whose career totals add up to a target without going over.",
    rules: [
      "You get a career stat and a target, like 900 home runs.",
      "Name three players, one at a time. Each player's career total is revealed when you pick him, so you can aim your last pick. Anyone who debuted in 1890 or later counts.",
      "Each slot has a rule, like played in the 1990s, played for the Astros, played first base, or Hall of Famer. Tap a slot, then name a player who fits it. One game is enough (a single game at first base counts), teams include their old names (Brooklyn Dodgers count as Dodgers), and his whole career total counts.",
      "Your score is how far under the target your three players finish. Hit it exactly for a bullseye. Go over and it's a bust, and the round ends.",
      "A new round starts every day at midnight Eastern, and past rounds are in the archive.",
    ],
  },
  king: {
    name: "King of the Hill",
    path: "/king",
    summary: "A daily baseball stats game: five head-to-head matchups on one career stat, and the winner stays on as king.",
    rules: [
      "You get one career stat and five matchups. Tap the player with the better number. For ERA, lower is better.",
      "The first matchup is two challengers. Whoever really wins becomes king and stays on against a new challenger, whether you picked him or not. His number stays face up.",
      "Each matchup pairs players closer together on the all-time leaderboard, so they get harder as you go.",
      "Score a point for each matchup you get right. A new round starts every day at midnight Eastern, and past rounds are in the archive.",
    ],
  },
};

export default function HowToPlay({ game }: { game: HowToGame }) {
  const g = GAMES[game];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: g.name,
    url: `${SITE_URL}${g.path}`,
    description: g.summary,
    applicationCategory: "GameApplication",
    genre: ["Trivia", "Sports", "Baseball"],
    operatingSystem: "Any (web browser)",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
  return (
    <section className={styles.howTo} aria-labelledby="how-to-play">
      <h2 id="how-to-play">How to play</h2>
      <ul>
        {g.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <script
        type="application/ld+json"
        // Static text from this file only; "<" is escaped so it can't close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </section>
  );
}

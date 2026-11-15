# Daily Dugout

Quick daily sports stats games, all in one app:

- **Baseball Golf** (`/golf`; `/` redirects there): name the player at each all-time career rank.
- **Stats Ranker** (`/rank`): put five players in order of one career stat.
- **Roster Reveal** (`/roster`): you get the year; name the team from its starting lineup, revealed one player at a time.

## Baseball Golf

A daily baseball trivia game. Each day everyone plays the same three holes. Each hole gives a career stat and an all-time rank, for example "83rd all-time in career RBIs." Name the player you think holds that rank. Your score is how far off your player's rank is, capped at 100 per hole. Lowest total wins.

### Rules
- Three holes a day. Each hole's stat is random and its target rank is between 1 and 100. A new round starts at midnight Eastern.
- One guess per hole, and you can't use the same player twice in a round.
- Hole score = `min(|target rank − your player's rank|, 100)`. An unranked guess scores 100.
- Rounds stored before Nov 15, 2026 can target ranks up to 150. They're scored with the same 100 cap, and scores already saved stay as they were.
- Tied players share a rank (1, 2, 2, 4).
- Rate stats have minimums to qualify: 3,000 PA for batting (AVG, OBP, SLG, OPS) and 1,000 IP for pitching (ERA, WHIP, K/9).

## Data
Stats come from the [Lahman Baseball Database](https://sabr.org/lahman-database/) (CC BY-SA 3.0), read from the [Lahman R package](https://github.com/cdalzell/Lahman) data files. They currently run through the 2025 season.

- Only players who debuted in 1890 or later are included, with their full careers (`FIRST_DEBUT_YEAR` in `build_data.py`). That keeps Cy Young, who debuted in 1890 and is #1 in wins, while leaving out the 1870s–80s.
- Only MLB-recognized leagues count:
  - AL, NL, AA, UA, PL and FL
  - the 1920–48 Negro Leagues
- Pre-1920 Black baseball and independent teams are excluded, which matches Baseball-Reference.
- `scripts/build_data.py` precomputes career leaderboards. It keeps ranks up to 300. New rounds target 1–100, but older stored rounds can target up to 150, and a rank 100 or more past the target always scores the maximum.
  - `src/data/leaderboards.json` holds the leaderboards and is server-only, so answers aren't shipped to the browser.
  - `public/players.json` is the autocomplete index.

To refresh the data when a new Lahman release comes out:

```bash
git clone --depth 1 https://github.com/cdalzell/Lahman /tmp/Lahman
pip install pyreadr pandas
python3 scripts/build_data.py /tmp/Lahman/data
python3 scripts/build_reveal_data.py /tmp/Lahman/data
npm test
```

Every round, old ones included, is scored against the current leaderboards, so a refresh updates the answers to past rounds too. Keep every stat that stored rounds use in the file, even if it's dropped from the pool for new rounds.

## Roster Reveal (`/roster`)
A third daily game on the same data, replacing Sports Revealer (`/reveal` now redirects here). Each day everyone gets the same team-season. You're told the year, and the team's starting lineup is revealed one player at a time, from the most obscure player to the most famous. Reveal as many as you like, then make **one** guess: the team. Fewer players revealed is a better score, and a wrong team loses the round.

- **The lineup is ten players.**
    - The main starter at each of the eight fielding positions: the most games there, no one twice.
    - Teams that used a DH regularly add the DH and the ace (most starts). Teams without a DH add the top two starting pitchers.
    - Cutoffs scale for short seasons like 2020.
- **Ordering:** obscure to famous, by All-Star selections, MVPs and Cy Youngs, the Hall of Fame and career length.
- **Teams:** every AL and NL team since 1901, plus the 1914–15 Federal League. That's 2,722 team-seasons. The Negro Leagues and earlier independent teams are in the data but left out of this game, because they'd crowd the team picker.
- **Data file:** `scripts/build_roster_data.py` writes `src/data/roster.json`, which is server-only.
- **Picking the round:** daily rounds walk through one fixed shuffle of every team-season (`src/lib/roster.ts`), so nothing repeats for years. Each day's team-season is saved in `roster_rounds` the first time it's needed. Rounds are numbered from Nov 1, 2026, like the other games, and `/roster/archive` replays any past round.
- **Playing:** `POST /api/roster` takes `{ date, seed, revealed, guess? }` and returns only the players revealed, plus the answer once the guess is in.
- **Saved plays:** daily plays are saved in `roster_plays`. `revealed` only goes up, the score uses the most players ever revealed, and the first guess stands. `GET /api/roster` returns this browser's saved play, and the game restores it or uploads browser-only progress.
- **Comparison:** finished rounds show how you compare: percent beaten, percent who got it, average players needed, and a chart of players needed.

## Stats Ranker and Roster Reveal archives and plays
- Both games number their rounds from Nov 1, 2026, like Baseball Golf. The build's backfill stores every round from then on.
- Both save each daily play (`rank_plays`, `roster_plays`), keyed by the same anonymous `bg_player` cookie as Baseball Golf. The archives read results from those tables, falling back to localStorage.
- Sports Revealer's old `reveal_rounds` and `reveal_plays` tables are no longer used.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests (scoring, round generation, leaderboard sanity checks)
npm run build
```

It deploys to Vercel as a standard Next.js app, with Neon Postgres (`DATABASE_URL`). `npm run build` first runs `scripts/migrate.mjs` (tables) and `scripts/backfill-rounds.mts` (saves any daily rounds not stored yet). Without `DATABASE_URL`, both skip and the game runs statelessly. Database tests run when `TEST_DATABASE_URL` points at a Postgres you can wipe.

## How it works
- `src/lib/round.ts` generates each day's round from a seed based on the date, so every player gets the same round.
  - Each daily round's stats and target ranks are saved in the `rounds` table (`src/lib/rounds.ts`) the first time it's needed. After that the saved round is used, so changing the generator never changes a round that already exists. Answers aren't saved: they always come from the current leaderboards.
  - A round never has three holes from the same group (batting or pitching).
  - It never targets a rank shared by more than three players.
- `POST /api/guess` scores a guess on the server and returns the reveal: your player's rank and the player(s) at the target rank.
- Progress is saved in `localStorage` per date.

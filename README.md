# Daily Dugout

Quick daily sports stats games, all in one app:

- **Baseball Golf** (`/`): name the player at each all-time career rank.
- **Stats Ranker** (`/rank`): put five players in order of one career stat.
- **Sports Revealer** (`/reveal`): name the mystery player from his stats, one clue per inning.

## Baseball Golf

A daily baseball trivia game. Each day everyone plays the same three holes. Each hole gives a career stat and an all-time rank, for example "83rd all-time in career RBIs." Name the player you think holds that rank. Your score is how far off your player's rank is, capped at 150 per hole. Lowest total wins.

### Rules
- Three holes a day. Each hole's stat is random and its target rank is between 1 and 150. A new round starts at midnight Eastern.
- One guess per hole, and you can't use the same player twice in a round.
- Hole score = `min(|target rank − your player's rank|, 150)`. An unranked guess scores 150.
- Tied players share a rank (1, 2, 2, 4).
- Rate stats have minimums to qualify: 3,000 PA for batting (AVG, OBP, SLG, OPS) and 1,000 IP for pitching (ERA, WHIP, K/9).

## Data
Stats come from the [Lahman Baseball Database](https://sabr.org/lahman-database/) (CC BY-SA 3.0), read from the [Lahman R package](https://github.com/cdalzell/Lahman) data files. They currently run through the 2025 season.

- Only players who debuted in 1890 or later are included, with their full careers (`FIRST_DEBUT_YEAR` in `build_data.py`). That keeps Cy Young, who debuted in 1890 and is #1 in wins, while leaving out the 1870s–80s.
- Only MLB-recognized leagues count:
  - AL, NL, AA, UA, PL and FL
  - the 1920–48 Negro Leagues
- Pre-1920 Black baseball and independent teams are excluded, which matches Baseball-Reference.
- `scripts/build_data.py` precomputes career leaderboards. It keeps ranks up to 300, because any rank past that always scores 150.
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

## Sports Revealer (`/reveal`)
A third daily game on the same data. Each day everyone gets the same mystery player and has nine innings to name him, with one guess per inning. A wrong guess or a skip reveals the next clue:

1. Innings 1–4: his four best career stats by all-time rank, from his 4th-best up to his best. Each shows its rank, for example "1,406 (1st)".
    - Hitters: R, H, 2B, 3B, HR, RBI, SB, BB, SO, AVG.
    - Pitchers: W, GS, CG, SHO, SV, IP, SO, BB, ERA.
    - Rate stats use the same minimums as Baseball Golf.
2. Inning 5: bats / throws.
3. Inning 6: positions (pitchers: starter, reliever or closer).
4. Inning 7: awards (All-Star, MVP, Cy Young, ROY, Gold Glove, Silver Slugger, WS MVP, Triple Crowns, World Series titles, Hall of Fame).
5. Inning 8: years active.
6. Inning 9: teams.

- **Answer pool:** the top 150 in Baseball-Reference career WAR, kept in `scripts/data/career_war_top150.csv`.
    - It leaves out players who debuted before 1890, because they aren't in this data.
    - It also leaves out anyone who played in 2026, because the stats run through 2025 and their careers aren't complete.
    - Update the CSV and its `active_2026` column when the WAR list or the data changes.
- **Data file:** `scripts/build_reveal_data.py` writes `src/data/reveal.json`, which is server-only.
- **Picking the player:** daily rounds walk through one fixed shuffle of the pool (`src/lib/reveal.ts`). Each round's player is saved in `reveal_rounds` the first time it's needed.
- **Archive:** Stats Ranker (`/rank/archive`) and Sports Revealer (`/reveal/archive`) can replay any past round. Both number their rounds from Nov 1, 2026, like Baseball Golf, even though they went live on Nov 14. The build's backfill stores every round from Nov 1. A row's result comes from the browser's saved progress.
    - Sports Revealer's walk through the pool is still anchored at Nov 14, so the rounds already played kept their players. Nov 1–13 got the last 13 players in the shuffle.
- **Guessing:** `POST /api/reveal` takes the guesses so far. It returns only the clues they unlock, plus the answer once the round is over.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests (scoring, round generation, leaderboard sanity checks)
npm run build
```

It deploys to Vercel as a standard Next.js app, with Neon Postgres (`DATABASE_URL`). `npm run build` first runs `scripts/migrate.mjs` (tables) and `scripts/backfill-rounds.mts` (saves any daily rounds not stored yet). Without `DATABASE_URL`, both skip and the game runs statelessly. Database tests run when `TEST_DATABASE_URL` points at a Postgres you can wipe.

### Practice rounds (testing)
A **↻ New practice round** button loads a random round at `/?seed=<random>`. That round is seeded by the `seed` value, not the date, so the same link always gives the same round and testers can share them. Practice progress is saved separately from the daily round.

To turn practice rounds off before launch, set the environment variable `DISABLE_PRACTICE=1` in Vercel and redeploy. That hides the button and makes the API reject practice rounds.

## How it works
- `src/lib/round.ts` generates each day's round from a seed based on the date, so every player gets the same round.
  - Each daily round's stats and target ranks are saved in the `rounds` table (`src/lib/rounds.ts`) the first time it's needed. After that the saved round is used, so changing the generator never changes a round that already exists. Answers aren't saved: they always come from the current leaderboards. Practice rounds aren't saved.
  - A round never has three holes from the same group (batting or pitching).
  - It never targets a rank shared by more than three players.
- `POST /api/guess` scores a guess on the server and returns the reveal: your player's rank and the player(s) at the target rank.
- Progress is saved in `localStorage` per date.

# Daily Dugout

Quick daily sports stats games, all in one app:

- **Baseball Golf** (`/golf`; `/` redirects there): name the player at each all-time career rank. Its **Player** mode (`/golf/player`) flips it: we name the player, you name his rank.
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

### Player mode (`/golf/player`)
A **Rank | Player** switch under the title picks the mode. Rank mode is the game above. Player mode flips it: each hole names a player and a career stat, and you say where he ranks all-time.

- Three holes a day, the same for everyone, numbered from Nov 1, 2026 like the other games. Three different stats, never all batting or all pitching.
- Each player is ranked 1st–100th in that stat, isn't in a tie of more than 3, and appears once per round.
- Pick a rank (−/+, type it, or the slider) and **Guess**. One guess per hole, holes in order, enforced on the server.
- Hole score = how many ranks you miss by, capped at 100. A guess anywhere inside his tie counts as exact (a 3-way tie at 20th covers 20th–22nd).
- The reveal shows his rank and value, the leaderboard two ranks either side of him, and who holds the rank you guessed.
- Rounds are saved in `player_golf_rounds` (stat and player id, no ranks) the first time they're needed, and backfilled on every build. Plays are in `player_golf_plays`, keyed by the same `bg_player` cookie, and have their own percentile and averages.
- `src/data/player-meta.json` holds each ranked player's years and position. `scripts/build_player_meta.mjs` writes it from `public/players.json`; `npm run data` runs it.
- Code: `src/lib/player-golf*.ts`, `src/app/api/player-golf/route.ts`, `src/components/PlayerGolfGame.tsx`, `src/components/ModeSwitch.tsx`, `src/app/golf/player/`.

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
node scripts/build_player_meta.mjs
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
- **Picking the round:** daily rounds walk through one fixed order of every team-season (`src/lib/roster.ts`), so nothing repeats for years. Through Nov 17, 2026 it was an even shuffle. From Nov 18 (`ROSTER_WEIGHTED_FROM`) it's weighted toward recent seasons: a season's weight halves every 25 years, so about half of rounds come from the last 25 seasons and older teams still turn up. The weighted order skips every team-season already used, in both sports. Each day's team-season is saved in `roster_rounds` the first time it's needed. Rounds are numbered from Nov 1, 2026, like the other games, and `/roster/archive` replays any past round.
- **Playing:** `POST /api/roster` takes `{ date, seed, revealed, guess? }` and returns only the players revealed, plus the answer once the guess is in.
- **Saved plays:** daily plays are saved in `roster_plays`. `revealed` only goes up, the score uses the most players ever revealed, and the first guess stands. `GET /api/roster` returns this browser's saved play, and the game restores it or uploads browser-only progress.
- **Comparison:** finished rounds show how you compare: percent beaten, percent who got it, average players needed, and a chart of players needed.

## Stats Ranker and Roster Reveal archives and plays
- Both games number their rounds from Nov 1, 2026, like Baseball Golf. The build's backfill stores every round from then on.
- Both save each daily play (`rank_plays`, `roster_plays`), keyed by the same anonymous `bg_player` cookie as Baseball Golf. The archives read results from those tables, falling back to localStorage.
- Sports Revealer's old `reveal_rounds` and `reveal_plays` tables are no longer used.

## NBA versions (prototype, off by default)
Every game also has an NBA version under `/nba`: Basketball Golf (`/nba/golf`, with Player mode at `/nba/golf/player`), Stats Ranker (`/nba/rank`) and Roster Reveal (`/nba/roster`), each with its archive.

- **Kill switch:** the NBA games exist only while the `NBA_ENABLED` environment variable is `1` or `true`. Unset, every `/nba` page is a 404, NBA API calls (`sport=nba`) are a 404, the nav's MLB | NBA switch is hidden, and the build doesn't backfill NBA rounds. Change it in Vercel (Settings → Environment Variables) and redeploy.
- **Why it's off by default:** the NBA data is built from Basketball-Reference (through the community [bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets) CSVs). That's fine for a private prototype, but it needs a license or a legal check before NBA goes public. NBA pages are also marked `noindex`.
- **Data:** `scripts/build_nba_data.py` writes `src/data/nba/leaderboards.json`, `src/data/nba/player-meta.json`, `src/data/nba/roster.json` (server-only) and `public/players-nba.json`. Through the 2025–26 season; BAA, NBA and ABA careers combined, regular season, like Basketball-Reference's leaderboards.
  ```bash
  git clone --depth 1 https://github.com/sumitrodatta/bball-reference-datasets /tmp/bbref
  python3 scripts/build_nba_data.py /tmp/bbref/Data   # or: npm run data:nba -- /tmp/bbref/Data
  ```
- **Stats (21):** Totals (PTS, TRB, AST, STL, BLK, 3P, FG, FT, G, MP, ORB, TOV), Per Game (PPG, RPG, APG, SPG, BPG, MPG; 400 games, or 10,000 points for PPG) and Shooting (FG% 2,000 FG, FT% 1,200 FT, 3P% 250 3P). Stats that weren't always kept count only the seasons they were, and the hole says "Tracked since …" (so Bill Russell has no blocks). A round never uses two versions of one stat (PTS and PPG share a `family`).
- **Roster Reveal:** every BAA, NBA and ABA team-season (1,818). The lineup is the team's eight players with the most minutes (most points before 1951–52; `lineupSize` in `src/lib/roster.ts`), from most obscure to most famous (All-Star picks, All-League teams, MVPs, the Hall of Fame, career games). The question gives the season ("1995–96"), and ABA teams are marked in the picker.
- **How it's wired:** `src/lib/sport.ts`. Baseball keeps every name it had: routes, tables, round seeds and localStorage keys. NBA uses the same tables with an `nba_` prefix (created by `scripts/migrate.mjs`), seeds and storage keys with an `nba:` prefix, and `sport=nba` on API calls. The page bodies live in `src/views/`, shared by the baseball and NBA routes.

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

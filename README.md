# Daily Dugout

Quick daily sports stats games, all in one app:

- **Baseball Golf** (`/golf`; `/` redirects there): name the player at each all-time career rank. Its **Player** mode (`/golf/player`) flips it: we name the player, you name his rank.
- **Stats Ranker** (`/rank`): put five players in order of one career stat.
- **Roster Reveal** (`/roster`): you get the year; name the team from its starting lineup, revealed one player at a time.
- **Hit the Number** (`/number`): name three players whose career totals add up as close to a target as you can without going over.
- **King of the Hill** (`/king`): five head-to-head matchups on one career stat; the winner stays on as king against a new challenger.

## Baseball Golf

A daily baseball trivia game. Each day everyone plays the same three holes. Each hole gives a career stat and an all-time rank, for example "83rd all-time in career RBIs." Name the player you think holds that rank. Your score is how far off your player's rank is, capped at 100 per hole. Lowest total wins.

### Rules
- Three holes a day. Each hole's stat is random and its target rank is between 1 and 100. A new round starts at midnight Eastern.
- One guess per hole, and you can't use the same player twice in a round.
- Hole score = `min(|target rank − your player's rank|, 100)`. An unranked guess scores 100.
- Rounds stored before Nov 15, 2026 can target ranks up to 150. They're scored with the same 100 cap, and scores already saved stay as they were.
- Tied players share a rank (1, 2, 2, 4).
- Rate stats have minimums to qualify: 3,000 PA for batting (AVG, OBP, SLG, OPS) and 1,000 IP for pitching (ERA, WHIP, K/9).
- Golf and Stats Ranker never pick WHIP for a new round (too obscure; `EXCLUDED_STATS` in `src/lib/round.ts`). It stays in the leaderboards so older rounds with WHIP still score.

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
python3 scripts/build_number_slots.py /tmp/Lahman/data
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

## Hit the Number (`/number`)
A fourth daily game on the same data, baseball only. Each day everyone gets the same career stat and target, e.g. "7,000 strikeouts." Name three players whose career totals add up as close to the target as you can, without going over.

- **Picking:** one player at a time. Each player's career total is revealed when you pick him, so the last pick is about landing it. Any player who debuted in 1890 or later counts (the same players as the autocomplete), and a player with none of the stat counts as 0. No player twice.
- **Slot rules** (rounds from Nov 21, 2026, `NUMBER_SLOTS_FROM`): each of the three slots has a rule, and you tap a slot before naming the player for it. Rules come from four kinds, three different kinds a round, in a shuffled order (pitching stats have no position rules, so they always use the other three):
  - **Decade:** played in the 1900s … 2020s. Recent decades come up more: a decade's chance halves every 25 years before the 2020s (`DECADE_HALF_LIFE`), so more than half of decade rules are 2000s or later and about 1 in 12 are before 1950.
  - **Team:** played for one of the 30 current franchises, under any name (Brooklyn Dodgers count as Dodgers, Indians as Guardians).
  - **Position:** played C, 1B, 2B, 3B, SS, OF or DH. Batting stats only.
  - **Award:** Hall of Famer (inducted as a player), All-Star (selected at least once), Rookie of the Year, MVP, Cy Young (pitching stats only), Gold Glove.

  Any appearance qualifies (one game at first base makes a first baseman), and the player's whole career total counts, not just his time with that team or in that decade. A new round's rules are drawn from `number:slots:<date>` until each slot has at least 25 players with some of the stat and an exact three-player combo of non-zero totals exists (`generateNumberSlots` in `src/lib/number-slots.ts`; the stat and target don't change). The rules are saved with the round in `number_rounds.slots`, and a round stored without them keeps none. Bullseye counts and the example respect the slots. Preview deployments (and `NUMBER_SLOTS_PREVIEW=1` locally) try worked-out rules on every older round too; those aren't stored and plays on them aren't saved, because previews share the production database.
- **Scoring:** how far under the target you finish; 0 is a bullseye. Going over is a bust and ends the round right away. In the comparison every bust ties for last.
- **Stats and targets** (`NUMBER_STATS` in `src/lib/number.ts`): every round number in each range is a possible target.

  | Stat | Targets | Step |
  |---|---|---|
  | Home runs | 100–1,200 | 25 |
  | Hits | 500–8,000 | 100 |
  | RBIs, Runs | 300–4,500 | 50 |
  | Doubles | 100–1,500 | 25 |
  | Stolen bases | 50–1,200 | 25 |
  | Walks | 200–3,500 | 50 |
  | Wins | 30–700 | 10 |
  | Strikeouts (pitching) | 300–8,000 | 100 |
  | Saves | 25–1,000 | 25 |
- **Picking the round:** stats run in shuffled cycles of ten days, each stat once per cycle and never the same stat two days running. Each stat steps through its own fixed shuffle of its targets, so a stat and target don't repeat for more than a year. Each day's stat and target are saved in `number_rounds` the first time they're needed, and backfilled on every build. Rounds are numbered from Nov 1, 2026, like the other games, and `/number/archive` replays any past round.
- **After the round:** the result, how many three-player combos hit the target exactly (with one example, leaning on the biggest totals), and how you compare: percent beaten, bullseye and bust rates, the average miss, and a chart of how close everyone got (bullseye, within 1%, 5%, 10% and 25% of the target, more, bust).
- **Playing:** `POST /api/number` takes `{ date, picks }`, every pick so far in order (`{ id, slot }` on rounds with slot rules, plain ids otherwise). It returns each pick's total and the result once the round is done. Totals stay on the server until a player is picked.
- **Saved plays:** `number_plays`, keyed by the same `bg_player` cookie, with each pick's slot in `pick_slots`. Picks only grow (the saved picks and their slots must start the new list) and a finished round doesn't change. `GET /api/number` returns this browser's saved play.
- **Share text:** totals only, e.g. `Hit the Number #15 · Nov 15, 2026` / `6,950 / 7,000 strikeouts 🎯` (💥 for a bust).
- **Data:** `scripts/build_data.py` also writes `src/data/number.json` (server-only): every player's career total in each stat, non-zero totals only. `scripts/build_number_slots.py` writes `src/data/number-slots.json` (server-only): each player's decades, franchises, leagues, positions and awards as bit masks, from Lahman's Appearances, Teams, HallOfFame, AllstarFull and AwardsPlayers. `npm run data` runs both.
- **Code:** `src/lib/number*.ts`, `src/app/api/number/route.ts`, `src/components/NumberGame.tsx`, `src/app/number/`.

## King of the Hill (`/king`)
A fifth daily game on the career leaderboards, in both sports (`/nba/king` behind the NBA kill switch). Each day everyone gets the same stat and the same chain of five matchups. Tap the player with the better number (for ERA, the lower one).

- **The chain:** matchup 1 is two challengers. Whoever really wins becomes king, whatever you picked, and stays on against a new challenger. The king's number stays face up; the challenger's is hidden until you pick. Cards show the name and position, no years (career length was a giveaway). Same-named players who'd look identical get tags: Ken Griffey Sr./Jr., Vladimir Guerrero Sr./Jr., Dutch (Hubert) / (Emil) Leonard.
- **Getting harder:** difficulty is how far apart the two players sit on the stat's all-time leaderboard (its top 300): 70–130 places apart in matchup 1, then 35–70, 15–35, 6–15 and 1–6 (`KOTH_BANDS`). Labels: Easy, Easy, Medium, Hard, Toughest. Above or below the king is a coin flip, and a new king is never placed so close to either end of the list that the remaining matchups lose room on one side, so the crown changes hands (about 93% of rounds see at least one new king after matchup 1). No matchup shows the same number on both cards.
- **Stats** (`KOTH_STATS` in `src/lib/koth.ts`), in shuffled cycles so none repeats two days running:
  - Baseball (15): hits, home runs, RBIs, runs, doubles, triples, walks, stolen bases, AVG, OBP, SLG, wins, strikeouts, saves, ERA.
  - NBA (12): points, rebounds, assists, steals, blocks, 3-pointers, PPG, RPG, APG, FG%, FT%, 3P%.
  - Left out on purpose: career-length stats (games, innings, minutes), repeats (total bases, OPS, field goals), and K/9, WHIP and turnovers.
- **Scoring:** one point per matchup right, out of 5. The compare panel shows percent beaten, the average, the perfect rate and a chart of scores.
- **Stored round:** the stat and the six players in order (`koth_rounds`), saved the first time it's needed and backfilled on build. Who wins each matchup comes from the current leaderboards.
- **Playing:** `POST /api/king` takes `{ date, picks, sport }`, the player picked in each matchup so far. It returns finished matchups with both numbers and the next matchup with only the king's number. Plays are in `koth_plays`; picks only grow, and a finished round doesn't change.
- **Share text:** `King of the Hill #15 · Nov 15, 2026` / `Career home runs` / `✅✅❌✅✅ 4/5`.
- **Code:** `src/lib/koth*.ts`, `src/app/api/king/route.ts`, `src/components/KothGame.tsx`, `src/views/KothPage.tsx`, `src/app/king/`, `src/app/nba/king/`.

## Stats Ranker and Roster Reveal archives and plays
- Both games number their rounds from Nov 1, 2026, like Baseball Golf. The build's backfill stores every round from then on.
- Both save each daily play (`rank_plays`, `roster_plays`), keyed by the same anonymous `bg_player` cookie as Baseball Golf. The archives read results from those tables, falling back to localStorage.
- Sports Revealer's old `reveal_rounds` and `reveal_plays` tables are no longer used.

## NBA versions (prototype, off by default)
Every game except Hit the Number also has an NBA version under `/nba`: Basketball Golf (`/nba/golf`, with Player mode at `/nba/golf/player`), Stats Ranker (`/nba/rank`), Roster Reveal (`/nba/roster`) and King of the Hill (`/nba/king`), each with its archive.

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

## Domain and search

- **One domain.** The site lives at https://dailydugout.com (`src/lib/site.ts`). In production, `src/proxy.ts` 308-redirects every other host (baseball-golf.vercel.app) there. The anonymous `bg_player` cookie rides along once as `?carry=…`, so players keep their saved plays; dailydugout.com sets it (unless the browser already has one there) and redirects to the clean URL. API calls aren't redirected, so tabs already open on the old host keep working. Previews and local dev are untouched.
- **Metadata.** Each baseball page uses `pageMetadata()` for its title, description, canonical URL (without `?date=`) and link-preview tags. `metadataBase` points every absolute URL at dailydugout.com.
- **Link previews.** `opengraph-image.tsx` in the root, `/golf`, `/golf/player`, `/rank`, `/roster`, `/number` and `/king` draw a 1200×630 card with `src/lib/og-card.tsx`. Spoiler-free: never the day's round.
- **Crawling.** `src/app/robots.ts` (everything but `/api/`) and `src/app/sitemap.ts` (the baseball games and archives). The NBA pages stay `noindex` and out of the sitemap.
- **How to play.** `src/views/HowToPlay.tsx` puts each baseball game's rules under the game as plain text, plus schema.org `WebApplication` data.

## How it works
- `src/lib/round.ts` generates each day's round from a seed based on the date, so every player gets the same round.
  - Each daily round's stats and target ranks are saved in the `rounds` table (`src/lib/rounds.ts`) the first time it's needed. After that the saved round is used, so changing the generator never changes a round that already exists. Answers aren't saved: they always come from the current leaderboards.
  - A round never has three holes from the same group (batting or pitching).
  - It never targets a rank shared by more than three players.
- `POST /api/guess` scores a guess on the server and returns the reveal: your player's rank and the player(s) at the target rank.
- Progress is saved in `localStorage` per date.

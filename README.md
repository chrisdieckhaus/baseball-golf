# Baseball Golf

A daily baseball trivia game. Each day everyone plays the same three holes. Each hole gives a career stat and an all-time rank, for example "83rd all-time in career RBIs." Name the player you think holds that rank. Your score is how far off your player's rank is, capped at 150 per hole. Lowest total wins.

## Rules
- Three holes a day. Each hole's stat is random and its target rank is between 1 and 150. A new round starts at midnight Eastern.
- One guess per hole, and you can't use the same player twice in a round.
- Hole score = `min(|target rank − your player's rank|, 150)`. An unranked guess scores 150.
- Tied players share a rank (1, 2, 2, 4).
- Rate stats have minimums to qualify: 3,000 PA for batting (AVG, OBP, SLG, OPS) and 1,000 IP for pitching (ERA, WHIP, K/9).

## Data
Stats come from the [Lahman Baseball Database](https://sabr.org/lahman-database/) (CC BY-SA 3.0), read from the [Lahman R package](https://github.com/cdalzell/Lahman) data files. They currently run through the 2025 season.

- Only MLB-recognized leagues count:
  - AL, NL, AA, UA, PL, FL and the 1871–75 NA
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
npm test
```

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests (scoring, round generation, leaderboard sanity checks)
npm run build
```

There's no database or environment variables. It deploys to Vercel as a standard Next.js app.

## How it works
- `src/lib/round.ts` builds each day's round from a seed based on the date, so every player gets the same round without storing anything.
  - A round never has three holes from the same group (batting or pitching).
  - It never targets a rank shared by more than three players.
- `POST /api/guess` scores a guess on the server and returns the reveal: your player's rank and the player(s) at the target rank.
- Progress is saved in `localStorage` per date.

#!/usr/bin/env python3
"""Build NBA Hit the Number data: career totals and slot rules for every player.

Outputs (both server-only, like the baseball versions):
  src/data/nba/number.json         career totals in the Hit the Number stats
  src/data/nba/number-slots.json   what each player qualifies for in the slots

Every player in public/players-nba.json is pickable. Careers combine BAA, NBA
and ABA regular seasons, like scripts/build_nba_data.py (run that first: it
writes the player index this reads).

Slot rules, same format as scripts/build_number_slots.py:
  - decades: a season counts for both calendar years it spans (1999–00 counts
    as the 1990s and the 2000s)
  - teams: the 30 current franchises, with their old names and cities (the
    Seattle SuperSonics count as the Thunder) and the ABA years of the Nets,
    Nuggets, Pacers and Spurs
  - positions: guard, forward, center; any season listed there, or his career
    position, qualifies
  - awards: Hall of Fame, All-Star, MVP, Rookie of the Year, Defensive Player
    of the Year, Sixth Man of the Year (NBA and ABA)

Usage:
  git clone --depth 1 https://github.com/sumitrodatta/bball-reference-datasets /tmp/bbref
  python3 scripts/build_nba_number_data.py /tmp/bbref/Data
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
THROUGH_SEASON = 2026  # the 2025-26 season; must match scripts/build_nba_data.py
MULTI_TEAM = r"^\d+TM$|^TOT$"
FIRST_DECADE = 1940  # bit 0 = 1940s (the first BAA season was 1946-47)

# Hit the Number's NBA stats (keys must match NBA_NUMBER_STATS in src/lib/number.ts).
STATS = {"PTS": "pts", "TRB": "trb", "AST": "ast", "STL": "stl", "BLK": "blk", "3P": "x3p"}

# Current franchises, oldest abbreviations included. Order sets the bit order.
FRANCHISES = [
    ("ATL", "Hawks", ["TRI", "MLH", "STL", "ATL"]),
    ("BOS", "Celtics", ["BOS"]),
    ("BRK", "Nets", ["NJA", "NYA", "NYN", "NJN", "BRK"]),
    ("CHO", "Hornets", ["CHH", "CHA", "CHO"]),
    ("CHI", "Bulls", ["CHI"]),
    ("CLE", "Cavaliers", ["CLE"]),
    ("DAL", "Mavericks", ["DAL"]),
    ("DEN", "Nuggets", ["DNR", "DNA", "DEN"]),
    ("DET", "Pistons", ["FTW", "DET"]),
    ("GSW", "Warriors", ["PHW", "SFW", "GSW"]),
    ("HOU", "Rockets", ["SDR", "HOU"]),
    ("IND", "Pacers", ["INA", "IND"]),
    ("LAC", "Clippers", ["BUF", "SDC", "LAC"]),
    ("LAL", "Lakers", ["MNL", "LAL"]),
    ("MEM", "Grizzlies", ["VAN", "MEM"]),
    ("MIA", "Heat", ["MIA"]),
    ("MIL", "Bucks", ["MIL"]),
    ("MIN", "Timberwolves", ["MIN"]),
    ("NOP", "Pelicans", ["NOH", "NOK", "NOP"]),
    ("NYK", "Knicks", ["NYK"]),
    ("OKC", "Thunder", ["SEA", "OKC"]),
    ("ORL", "Magic", ["ORL"]),
    ("PHI", "76ers", ["SYR", "PHI"]),
    ("PHO", "Suns", ["PHO"]),
    ("POR", "Trail Blazers", ["POR"]),
    ("SAC", "Kings", ["ROC", "CIN", "KCO", "KCK", "SAC"]),
    ("SAS", "Spurs", ["DLC", "TEX", "SAA", "SAS"]),
    ("TOR", "Raptors", ["TOR"]),
    ("UTA", "Jazz", ["NOJ", "UTA"]),
    ("WAS", "Wizards", ["CHP", "CHZ", "BAL", "CAP", "WSB", "WAS"]),
]
LEAGUES = ["NBA", "ABA"]
POSITIONS = [("G", {"PG", "SG"}), ("F", {"SF", "PF"}), ("C", {"C"})]
AWARDS = ["HOF", "AS", "MVP", "ROY", "DPOY", "SMOY"]
AWARD_SHARES = {
    "MVP": {"nba mvp", "aba mvp"},
    "ROY": {"nba roy", "aba roy", "baa roy"},
    "DPOY": {"nba dpoy"},
    "SMOY": {"nba smoy"},
}


def main(data_dir: Path) -> None:
    index = json.loads((ROOT / "public/players-nba.json").read_text())["players"]
    ids = {p["id"] for p in index}

    rows = pd.read_csv(data_dir / "Player Totals.csv")
    rows = rows[(rows.season <= THROUGH_SEASON) & rows.player_id.isin(ids)]
    multi = rows.team.str.match(MULTI_TEAM)
    # Careers: one row per player per league per season (the total row if traded).
    has_total = set(map(tuple, rows[multi][["season", "lg", "player_id"]].values))
    key = list(zip(rows.season, rows.lg, rows.player_id))
    career_rows = rows[[m or (k not in has_total) for m, k in zip(multi, key)]]
    team_rows = rows[~multi]

    tot = career_rows.groupby("player_id")[list(STATS.values())].sum(min_count=1)
    totals = {
        k: {pid: int(v) for pid, v in tot[col].dropna().items() if v > 0}
        for k, col in STATS.items()
    }

    franch_bit = {abbr: i for i, (_, _, abbrs) in enumerate(FRANCHISES) for abbr in abbrs}
    masks: dict[str, list[int]] = {pid: [0, 0, 0, 0, 0] for pid in ids}

    for r in career_rows[["player_id", "season", "lg"]].drop_duplicates().itertuples(index=False):
        m = masks[r.player_id]
        for year in (int(r.season) - 1, int(r.season)):
            m[0] |= 1 << ((year - FIRST_DECADE) // 10)
        if r.lg in LEAGUES:
            m[2] |= 1 << LEAGUES.index(r.lg)
    for r in team_rows[["player_id", "team"]].drop_duplicates().itertuples(index=False):
        if r.team in franch_bit:
            masks[r.player_id][1] |= 1 << franch_bit[r.team]

    season_info = pd.read_csv(data_dir / "Player Season Info.csv")
    season_info = season_info[(season_info.season <= THROUGH_SEASON) & season_info.player_id.isin(ids)]
    career_info = pd.read_csv(data_dir / "Player Career Info.csv")
    career_info = career_info[career_info.player_id.isin(ids)]
    for bit, (code, season_codes) in enumerate(POSITIONS):
        who = set(season_info[season_info.pos.isin(season_codes)].player_id)
        who |= set(career_info[career_info.pos.fillna("").str.split("-").apply(lambda ps: code in ps)].player_id)
        for pid in who:
            masks[pid][3] |= 1 << bit

    shares = pd.read_csv(data_dir / "Player Award Shares.csv")
    shares = shares[(shares.season <= THROUGH_SEASON) & (shares.winner == True)]  # noqa: E712
    allstars = pd.read_csv(data_dir / "All-Star Selections.csv")
    winners = {
        "HOF": set(career_info[career_info.hof == True].player_id),  # noqa: E712
        "AS": set(allstars[allstars.season <= THROUGH_SEASON].player_id),
        **{a: set(shares[shares.award.isin(names)].player_id) for a, names in AWARD_SHARES.items()},
    }
    for bit, award in enumerate(AWARDS):
        for pid in winners[award] & ids:
            masks[pid][4] |= 1 << bit

    out_dir = ROOT / "src/data/nba"
    (out_dir / "number.json").write_text(json.dumps({
        "throughSeason": THROUGH_SEASON,
        "firstDebutYear": int(rows.season.min()),
        "totals": totals,
    }, separators=(",", ":")))
    (out_dir / "number-slots.json").write_text(json.dumps({
        "throughSeason": THROUGH_SEASON,
        "firstDecade": FIRST_DECADE,
        "teams": [{"key": k, "name": n} for k, n, _ in FRANCHISES],
        "leagues": LEAGUES,
        "positions": [p for p, _ in POSITIONS],
        "awards": AWARDS,
        # id -> [decades, teams, leagues, positions, awards]
        "players": {pid: m for pid, m in sorted(masks.items())},
    }, separators=(",", ":")))
    counts = {a: len(w & ids) for a, w in winners.items()}
    print(f"NBA Hit the Number: {len(ids)} players, {len(FRANCHISES)} teams, awards {counts}")
    for k, t in totals.items():
        top = sorted(t.values(), reverse=True)[:3]
        print(f"  {k}: {len(t)} players with some; top three {top} (sum {sum(top)})")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/bbref/Data"))

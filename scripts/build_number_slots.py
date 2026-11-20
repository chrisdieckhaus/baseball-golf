#!/usr/bin/env python3
"""Build src/data/number-slots.json: what each player qualifies for in Hit the Number's slots.

Each Hit the Number slot has a rule ("played in the 1990s", "played for the
Astros", "played first base", "All-Star"...). Any appearance qualifies: one game
at first base makes a first baseman. This file records, for every player in
public/players.json, which decades, teams, leagues and positions he appeared in
and which awards he has, as bit masks (server-only, like number.json).

Input: the .RData files from the Lahman R package (https://github.com/cdalzell/Lahman).

Usage:
  pip install pyreadr pandas
  python3 scripts/build_number_slots.py /path/to/Lahman/data
"""
import json
import sys
from pathlib import Path

import pandas as pd
import pyreadr

ROOT = Path(__file__).resolve().parent.parent

MAJOR_LEAGUES = [
    "NL", "AL", "AA", "UA", "PL", "FL", "NA",
    "NNL", "ECL", "ANL", "EWL", "NSL", "NN2", "NAL",
]

# Bit order matters: src/lib/number-slots.ts reads these masks with the same order.
FIRST_DECADE = 1890                       # bit 0 = 1890s, bit 1 = 1900s, ...
LEAGUES = ["AL", "NL"]
POSITIONS = [("C", ["G_c"]), ("1B", ["G_1b"]), ("2B", ["G_2b"]), ("3B", ["G_3b"]),
             ("SS", ["G_ss"]), ("OF", ["G_lf", "G_cf", "G_rf", "G_of"]), ("DH", ["G_dh"])]
AWARDS = ["HOF", "AS", "ROY"]


def nickname(full: str) -> str:
    """"Houston Astros" -> "Astros", "Boston Red Sox" -> "Red Sox"."""
    for two in ("Red Sox", "White Sox", "Blue Jays"):
        if full.endswith(two):
            return two
    if full.startswith("Los Angeles Angels"):
        return "Angels"
    return full.split()[-1]


def load(data_dir: Path, name: str) -> pd.DataFrame:
    return pyreadr.read_r(str(data_dir / f"{name}.RData"))[name]


def main(data_dir: Path) -> None:
    index = json.loads((ROOT / "public/players.json").read_text())["players"]
    ids = {p["id"] for p in index}

    app = load(data_dir, "Appearances").query("lgID in @MAJOR_LEAGUES and playerID in @ids").copy()
    app["lgID"] = app.lgID.astype(str)
    app["teamID"] = app.teamID.astype(str)
    bat = load(data_dir, "Batting").query("lgID in @MAJOR_LEAGUES and playerID in @ids")
    pit = load(data_dir, "Pitching").query("lgID in @MAJOR_LEAGUES and playerID in @ids")

    # The 30 current franchises, named by their 2025 team (Teams has every season's name).
    teams = load(data_dir, "Teams")
    teams["teamID"] = teams.teamID.astype(str)
    teams["franchID"] = teams.franchID.astype(str)
    last_year = int(teams.yearID.max())
    current = teams[teams.yearID == last_year].sort_values("name")
    franchises = [{"key": r.franchID, "name": nickname(str(r["name"]))} for _, r in current.iterrows()]
    franch_bit = {f["key"]: i for i, f in enumerate(franchises)}
    team_franch = {(int(r.yearID), r.teamID): r.franchID for _, r in teams.iterrows()}

    masks: dict[str, list[int]] = {pid: [0, 0, 0, 0, 0] for pid in ids}

    # Decades: any season in which he batted, pitched or appeared.
    seasons = pd.concat([app[["playerID", "yearID"]], bat[["playerID", "yearID"]], pit[["playerID", "yearID"]]])
    for pid, year in seasons.drop_duplicates().itertuples(index=False):
        d = (int(year) - FIRST_DECADE) // 10
        if d >= 0:
            masks[pid][0] |= 1 << d

    for r in app.itertuples(index=False):
        m = masks[r.playerID]
        f = team_franch.get((int(r.yearID), r.teamID))
        if f in franch_bit:
            m[1] |= 1 << franch_bit[f]
        if r.lgID in LEAGUES:
            m[2] |= 1 << LEAGUES.index(r.lgID)
        for bit, (_, cols) in enumerate(POSITIONS):
            if any((getattr(r, c) or 0) > 0 for c in cols if pd.notna(getattr(r, c))):
                m[3] |= 1 << bit

    hof = load(data_dir, "HallOfFame")
    hof = hof[(hof.inducted == "Y") & (hof.category == "Player")]
    allstars = load(data_dir, "AllstarFull")
    awards = load(data_dir, "AwardsPlayers")
    roy = awards[awards.awardID == "Rookie of the Year"]
    for bit, frame in enumerate([hof, allstars, roy]):
        for pid in set(frame.playerID) & ids:
            masks[pid][4] |= 1 << bit

    out = {
        "throughSeason": last_year,
        "firstDecade": FIRST_DECADE,
        "teams": franchises,
        "leagues": LEAGUES,
        "positions": [p for p, _ in POSITIONS],
        "awards": AWARDS,
        # id -> [decades, teams, leagues, positions, awards]
        "players": {pid: m for pid, m in sorted(masks.items())},
    }
    (ROOT / "src/data/number-slots.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"Hit the Number slots: {len(masks)} players, {len(franchises)} teams, through {last_year}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "../data-src/Lahman/data"))

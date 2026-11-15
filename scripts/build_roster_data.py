#!/usr/bin/env python3
"""Build Roster Reveal data from the same Lahman Baseball Database as the other games.

Each round is one team-season. You're told the year, and the team's starting
lineup is revealed one player at a time, most obscure first, until you guess the team.

The lineup is ten players:
  - the main starter at each of the eight fielding positions (most games there; no one twice)
  - then, for a team that used a DH regularly, the DH and the ace (most starts);
    for a team without one, the top two starting pitchers

Teams: the AL, the NL and the 1914-15 Federal League, 1901 on. The Negro Leagues
and earlier independent teams are in this data, but they'd crowd the team picker
with answers almost no one could name, so this game leaves them out.

Output: src/data/roster.json (server-only: it holds the answers).

Usage:
  python3 scripts/build_roster_data.py /path/to/Lahman/data
"""
import json
import math
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import load  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FIRST_YEAR = 1901
LEAGUES = ["AL", "NL", "FL"]
# Lahman leaves "Jr." off names; add it where a father and son share one.
SUFFIX = {
    "griffke01": " Sr.", "griffke02": " Jr.", "guerrvl02": " Jr.", "tatisfe02": " Jr.", "alomasa02": " Jr.",
    "wittbo02": " Jr.", "raineti02": " Jr.", "cruzjo02": " Jr.", "gwynnto02": " Jr.", "rosepe02": " Jr.",
    "schofdi02": " Jr.", "amaroru02": " Jr.", "hairsje02": " Jr.", "stottme02": " Jr.",
}
FIELD = [("G_c", "C"), ("G_ss", "SS"), ("G_2b", "2B"), ("G_cf", "CF"), ("G_3b", "3B"),
         ("G_1b", "1B"), ("G_lf", "LF"), ("G_rf", "RF")]  # scarce positions pick first


def main(data_dir: Path) -> None:
    teams = load(data_dir, "Teams")
    teams = teams[(teams.yearID >= FIRST_YEAR) & teams.lgID.isin(LEAGUES)]
    apps = load(data_dir, "Appearances")
    batting = load(data_dir, "Batting")
    pitching = load(data_dir, "Pitching")
    people = load(data_dir, "People").set_index("playerID")
    allstar = load(data_dir, "AllstarFull")
    awards = load(data_dir, "AwardsPlayers")
    hof = load(data_dir, "HallOfFame")

    # Fame, to order the lineup from most obscure to most famous: All-Star
    # selections, MVPs and Cy Youngs, the Hall of Fame and career length.
    career_g = pd.concat([batting.groupby("playerID").G.sum(), pitching.groupby("playerID").G.sum()], axis=1).fillna(0).max(axis=1)
    allstars = allstar.drop_duplicates(["playerID", "yearID"]).groupby("playerID").size()
    big = awards[awards.awardID.isin(["Most Valuable Player", "Cy Young Award"])].groupby("playerID").size()
    hofs = set(hof[(hof.inducted == "Y") & (hof.category == "Player")].playerID)

    def fame(p: str) -> float:
        return 3 * allstars.get(p, 0) + 6 * big.get(p, 0) + (15 if p in hofs else 0) + math.log1p(career_g.get(p, 0))

    def name(p: str) -> str:
        r = people.loc[p]
        return f"{r.nameFirst} {r.nameLast}".strip() + SUFFIX.get(p, "")

    apps = apps[apps.yearID >= FIRST_YEAR].fillna(0)
    starts = pitching[pitching.yearID >= FIRST_YEAR].groupby(["yearID", "teamID", "playerID"]).GS.sum()

    rounds, skipped = [], []
    for t in teams.itertuples():
        y, tid = int(t.yearID), t.teamID
        scale = min(1.0, t.G / 162)  # short seasons: 1918-19, 1981, 1994-95, 2020
        ta = apps[(apps.yearID == y) & (apps.teamID == tid)]
        lineup: dict[str, str] = {}
        for col, pos in FIELD:
            cand = ta[~ta.playerID.isin(lineup.values())].sort_values(col, ascending=False)
            if len(cand) and cand.iloc[0][col] > 0:
                lineup[pos] = cand.iloc[0].playerID
        cand = ta[~ta.playerID.isin(lineup.values())].sort_values("G_dh", ascending=False)
        uses_dh = bool(len(cand)) and cand.iloc[0].G_dh >= 40 * scale
        if uses_dh:
            lineup["DH"] = cand.iloc[0].playerID
        sp = starts.xs((y, tid), level=(0, 1)).sort_values(ascending=False) if (y, tid) in starts.index.droplevel(2) else pd.Series(dtype=float)
        sp = [p for p in sp.index if p not in lineup.values()]
        for i, p in enumerate(sp[: 1 if uses_dh else 2]):
            lineup[f"SP{i}"] = p
        if len(lineup) < 10:
            skipped.append(f"{y} {t.name}")
            continue
        ordered = sorted(lineup.items(), key=lambda kv: fame(kv[1]))
        post = "World Series champions" if t.WSWin == "Y" else "Pennant winners" if t.LgWin == "Y" else (
            "Made the playoffs" if t.DivWin == "Y" or t.WCWin == "Y" else "")
        rounds.append({
            "franchise": t.franchID,
            "year": y,
            "team": t.name,
            "record": f"{int(t.W)}–{int(t.L)}",
            "postseason": post,
            "lineup": [{"id": p, "name": name(p), "pos": "SP" if pos.startswith("SP") else pos} for pos, p in ordered],
        })

    # Every team that played each season, for the team picker (by its name that year).
    year_teams: dict[int, list[list[str]]] = {}
    for t in teams.sort_values("name").itertuples():
        year_teams.setdefault(int(t.yearID), []).append([t.franchID, t.name])

    rounds.sort(key=lambda r: (r["year"], r["franchise"]))
    out = {
        "source": "Lahman Baseball Database",
        "firstYear": FIRST_YEAR,
        "lastYear": int(teams.yearID.max()),
        "yearTeams": year_teams,
        "rounds": rounds,
    }
    (ROOT / "src/data/roster.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(rounds)} team-seasons, {FIRST_YEAR}-{out['lastYear']}; skipped {len(skipped)}: {skipped[:10]}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "../data-src/Lahman/data"))

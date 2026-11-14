#!/usr/bin/env python3
"""Build Sports Revealer data from the same Lahman Baseball Database as Baseball Golf.

Answer pool: the top 150 in Baseball-Reference career WAR (scripts/data/career_war_top150.csv),
limited to players in this database (debuted FIRST_DEBUT_YEAR or later) whose careers are complete
in it (no 2026 season).

Each player gets nine clues, one per inning:
  1-4  his four best career stats by all-time rank, shown from 4th-best up to his best,
       each with its rank, e.g. "1,406 (1st)"
  5    bats / throws
  6    positions (pitchers: starter / reliever)
  7    awards
  8    years active
  9    teams

Output: src/data/reveal.json (server-only: it holds the answers).

Usage:
  python3 scripts/build_reveal_data.py /path/to/Lahman/data
"""
import csv
import json
import sys
import unicodedata
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import FIRST_DEBUT_YEAR, MAJOR_LEAGUES, MIN_IP, MIN_PA, competition_rank, load  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WAR_FILE = ROOT / "scripts/data/career_war_top150.csv"

# Wikipedia names that don't match Lahman's "first last" -> Lahman playerID.
# None = the WAR leader isn't in this database (debuted before FIRST_DEBUT_YEAR), even
# though a later player with the same name is.
ID_OVERRIDES: dict[str, str | None] = {
    "Jim McCormick": None,  # the 1878-87 pitcher, not mccorji02 (1892)
    "Grover Cleveland Alexander": "alexape01",
    "Ken Griffey Jr.": "griffke02",
    "Cal Ripken Jr.": "ripkeca01",
    "Home Run Baker": "bakerfr01",
    "Ferguson Jenkins": "jenkife01",
}

# Hall of Fame elections newer than this copy of HallOfFame (Jan 2026 BBWAA vote).
EXTRA_HOF = {"beltrca01", "jonesan01", "kentje01"}

HITTER_STATS = [  # key, label
    ("R", "Runs"), ("H", "Hits"), ("X2B", "Doubles"), ("X3B", "Triples"), ("HR", "Home runs"),
    ("RBI", "RBI"), ("SB", "Stolen bases"), ("BB", "Walks"), ("SO", "Strikeouts"), ("AVG", "Batting average"),
]
PITCHER_STATS = [
    ("W", "Wins"), ("GS", "Games started"), ("CG", "Complete games"), ("SHO", "Shutouts"), ("SV", "Saves"),
    ("IP", "Innings pitched"), ("SO", "Strikeouts"), ("BB", "Walks allowed"), ("ERA", "ERA"),
]

AWARDS = [  # Lahman awardID, label
    ("Most Valuable Player", "MVP"),
    ("Cy Young Award", "Cy Young"),
    ("Rookie of the Year", "Rookie of the Year"),
    ("Gold Glove", "Gold Glove"),
    ("Silver Slugger", "Silver Slugger"),
    ("World Series MVP", "World Series MVP"),
    ("Triple Crown", "Triple Crown"),
    ("Pitching Triple Crown", "Pitching Triple Crown"),
]

POSITIONS = {"G_c": "C", "G_1b": "1B", "G_2b": "2B", "G_3b": "3B", "G_ss": "SS",
             "G_lf": "LF", "G_cf": "CF", "G_rf": "RF", "G_dh": "DH"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace(".", "").split())


def ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def times(n: int, label: str) -> str:
    return f"{n}× {label}" if n > 1 else label


def main(data_dir: Path) -> None:
    batting = load(data_dir, "Batting").query("lgID in @MAJOR_LEAGUES")
    pitching = load(data_dir, "Pitching").query("lgID in @MAJOR_LEAGUES")
    debut = pd.concat([batting[["playerID", "yearID"]], pitching[["playerID", "yearID"]]]).groupby("playerID").yearID.min()
    eligible = set(debut[debut >= FIRST_DEBUT_YEAR].index)
    batting = batting[batting.playerID.isin(eligible)]
    pitching = pitching[pitching.playerID.isin(eligible)]
    people = load(data_dir, "People").set_index("playerID")
    appearances = load(data_dir, "Appearances").query("lgID in @MAJOR_LEAGUES and playerID in @eligible")
    teams = load(data_dir, "Teams")
    awards = load(data_dir, "AwardsPlayers")
    allstar = load(data_dir, "AllstarFull")
    hof = load(data_dir, "HallOfFame")
    last_year = int(max(batting.yearID.max(), pitching.yearID.max()))

    # ---- Career totals and all-time ranks (same rules as build_data.py) ----
    bcols = ["G", "AB", "R", "H", "X2B", "X3B", "HR", "RBI", "SB", "BB", "SO", "HBP", "SH", "SF"]
    bat = batting.groupby("playerID")[bcols].sum(min_count=1).fillna(0)
    bat["PA"] = bat.AB + bat.BB + bat.HBP + bat.SH + bat.SF
    bat["AVG"] = bat.H / bat.AB.where(bat.AB > 0)
    pcols = ["W", "L", "G", "GS", "CG", "SHO", "SV", "IPouts", "H", "ER", "BB", "SO"]
    pit = pitching.groupby("playerID")[pcols].sum(min_count=1).fillna(0)
    pit["IP"] = pit.IPouts / 3
    pit["ERA"] = 9 * pit.ER / pit.IP.where(pit.IP > 0)

    def ranks(frame: pd.DataFrame, col: str, rate: bool, asc: bool, decimals: int) -> pd.Series:
        vals = frame[col].dropna()
        if not rate:
            vals = vals[vals > 0]
        return competition_rank(vals.round(decimals + 1 if rate else decimals), ascending=asc)

    bat_q = bat[bat.PA >= MIN_PA]
    pit_q = pit[pit.IP >= MIN_IP]
    bat_ranks = {k: ranks(bat_q if k == "AVG" else bat, k, k == "AVG", False, 3 if k == "AVG" else 0) for k, _ in HITTER_STATS}
    pit_ranks = {k: ranks(pit_q if k == "ERA" else pit, k, k == "ERA", k == "ERA", 2 if k == "ERA" else 1 if k == "IP" else 0)
                 for k, _ in PITCHER_STATS}

    # ---- Awards ----
    award_counts = (awards[awards.awardID.isin([a for a, _ in AWARDS])]
                    .drop_duplicates(["playerID", "awardID", "yearID"]).groupby(["playerID", "awardID"]).size())
    allstar_counts = allstar.drop_duplicates(["playerID", "yearID"]).groupby("playerID").size()
    hof_ids = set(hof[(hof.inducted == "Y") & (hof.category == "Player")].playerID) | EXTRA_HOF

    # Teams in order, with the team's name that season; a return stint shows again.
    team_name = teams.set_index(["yearID", "teamID"])["name"].to_dict()
    champs = set(zip(teams[teams.WSWin == "Y"].yearID, teams[teams.WSWin == "Y"].teamID))
    stints = (pd.concat([batting[["playerID", "yearID", "stint", "teamID"]], pitching[["playerID", "yearID", "stint", "teamID"]]])
              .drop_duplicates().sort_values(["playerID", "yearID", "stint"]))

    pos_games = appearances.groupby("playerID")[[*POSITIONS, "G_p", "G_all"]].sum()

    # ---- Match the WAR list to Lahman ids ----
    lahman_names: dict[str, list[str]] = {}
    for pid, row in people.iterrows():
        if pid in eligible:
            lahman_names.setdefault(norm(f"{row.nameFirst} {row.nameLast}"), []).append(pid)
    games = bat.G.add(pit.G, fill_value=0)

    pool, skipped = [], []
    with open(WAR_FILE) as f:
        rows = list(csv.DictReader(line for line in f if not line.startswith("#")))
    for r in rows:
        name = r["name"]
        if r["active_2026"]:
            skipped.append(f"{name} (active in 2026)")
            continue
        pid = ID_OVERRIDES.get(name)
        if pid is None and name not in ID_OVERRIDES:
            candidates = lahman_names.get(norm(name), [])
            pid = max(candidates, key=lambda p: games.get(p, 0)) if candidates else None
        if pid is None:
            # Not in this database at all: everyone left unmatched debuted before FIRST_DEBUT_YEAR.
            # A new name here that isn't pre-1890 needs an ID_OVERRIDES entry.
            skipped.append(f"{name} (not in the data: debuted before {FIRST_DEBUT_YEAR}?)")
            continue
        pool.append((pid, name, int(r["rank"]), float(r["war"])))

    players = []
    for pid, name, war_rank, war in pool:
        pg = pos_games.loc[pid]
        is_pitcher = pg.G_p >= 0.5 * pg.G_all
        if is_pitcher:
            p = pit.loc[pid]
            def value(k: str) -> str:
                if k == "IP":
                    return f"{int(p.IPouts // 3):,}{'' if p.IPouts % 3 == 0 else '.' + str(int(p.IPouts % 3))}"
                if k == "ERA":
                    return f"{p.ERA:.2f}"
                return f"{int(p[k]):,}"
            stat_list, rank_table = PITCHER_STATS, pit_ranks
        else:
            b = bat.loc[pid]
            def value(k: str) -> str:
                if k == "AVG":
                    return f"{b.AVG:.3f}".lstrip("0")
                return f"{int(b[k]):,}"
            stat_list, rank_table = HITTER_STATS, bat_ranks

        scored = [(int(rank_table[k][pid]), k, label) for k, label in stat_list if pid in rank_table[k].index]
        best4 = sorted(scored, key=lambda x: x[0])[:4]
        clues = [{"label": label, "value": f"{value(k)} ({ordinal(rank)})", "rank": rank}
                 for rank, k, label in reversed(best4)]

        person = people.loc[pid]
        clues.append({"label": "Bats / Throws", "value": f"Bats {person.bats}, throws {person.throws}"})

        if is_pitcher:
            t = pit.loc[pid]
            role = "Starter" if t.GS >= 0.5 * t.G else "Reliever"
            if t.SV >= 150:
                role = "Starter & closer" if role == "Starter" else "Closer"
            clues.append({"label": "Position", "value": f"Pitcher ({role})"})
        else:
            total = sum(pg[c] for c in POSITIONS)
            pos = sorted(((POSITIONS[c], pg[c]) for c in POSITIONS if total and pg[c] / total >= 0.08), key=lambda x: -x[1])
            clues.append({"label": "Positions", "value": ", ".join(p for p, _ in pos) or "—"})

        acc = []
        if pid in allstar_counts.index:
            acc.append(f"{allstar_counts[pid]}× All-Star")
        for award_id, label in AWARDS:
            if (pid, award_id) in award_counts.index:
                acc.append(times(int(award_counts[(pid, award_id)]), label))
        mine = stints[stints.playerID == pid]
        rings = mine[[(y, t) in champs for y, t in zip(mine.yearID, mine.teamID)]].yearID.nunique()
        if rings:
            acc.append(times(rings, "World Series champion"))
        if pid in hof_ids:
            acc.append("Hall of Famer")
        clues.append({"label": "Awards", "value": ", ".join(acc) if acc else "None"})

        years = sorted(mine.yearID.unique())
        clues.append({"label": "Years active", "value": f"{years[0]}–{years[-1]} ({len(years)} seasons)"})

        team_seq: list[str] = []
        for y, t in zip(mine.yearID, mine.teamID):
            n = team_name.get((y, t), t)
            if not team_seq or team_seq[-1] != n:
                team_seq.append(n)
        clues.append({"label": "Teams", "value": " → ".join(team_seq)})

        players.append({
            "id": pid,
            "name": name,
            "type": "pitcher" if is_pitcher else "hitter",
            "warRank": war_rank,
            "war": war,
            "years": f"{years[0]}–{years[-1]}",
            "clues": clues,
        })

    players.sort(key=lambda p: p["id"])
    out = {
        "source": "Lahman Baseball Database; answer pool from Baseball-Reference career WAR",
        "throughSeason": last_year,
        "firstDebutYear": FIRST_DEBUT_YEAR,
        "players": players,
    }
    (ROOT / "src/data/reveal.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"Through {last_year}: {len(players)} players "
          f"({sum(p['type'] == 'pitcher' for p in players)} pitchers); skipped {len(skipped)}:")
    for s in skipped:
        print("  -", s)


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "../data-src/Lahman/data"))

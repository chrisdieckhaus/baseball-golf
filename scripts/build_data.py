#!/usr/bin/env python3
"""Build Baseball Golf data files from the Lahman Baseball Database.

Input: the .RData files from the Lahman R package (https://github.com/cdalzell/Lahman),
which hold the Lahman database (CC BY-SA 3.0) through the 2025 season.

Outputs:
  src/data/leaderboards.json  server-only: career leaderboards (top ranks per stat)
  public/players.json         client autocomplete index of every player

Usage:
  pip install pyreadr pandas
  python3 scripts/build_data.py /path/to/Lahman/data
"""
import json
import sys
from pathlib import Path

import pandas as pd
import pyreadr

# Keep every player whose rank is <= this. New rounds target 1-100 and the
# per-hole score is capped at 100. Rounds stored before Nov 15, 2026 can target
# up to 150, so ranks up to 250 can still matter; 300 covers them.
MAX_RANK = 300

# Only players who debuted in this season or later are included, with their full
# careers. 1890 keeps Cy Young (debut 1890, #1 in wins) while leaving out the
# 1870s-80s careers people don't recognize.
FIRST_DEBUT_YEAR = 1890

MIN_PA = 3000  # Baseball-Reference career batting rate-stat minimum
MIN_IP = 1000  # Baseball-Reference career pitching rate-stat minimum

MAJOR_LEAGUES = [
    "NL", "AL", "AA", "UA", "PL", "FL", "NA",                 # 1871-present AL/NL era
    "NNL", "ECL", "ANL", "EWL", "NSL", "NN2", "NAL",          # Negro Leagues, 1920-1948
]

ROOT = Path(__file__).resolve().parent.parent


def load(data_dir: Path, name: str) -> pd.DataFrame:
    return pyreadr.read_r(str(data_dir / f"{name}.RData"))[name]


def competition_rank(values: pd.Series, ascending: bool) -> pd.Series:
    # "min" method = standard competition ranking (1, 2, 2, 4)
    return values.rank(method="min", ascending=ascending).astype(int)


def main(data_dir: Path) -> None:
    # Lahman also carries pre-1920 Black baseball and independent/barnstorming teams
    # (lgID EAS, WES, IND, NAC, INT) that MLB does not recognize as major league.
    # Keep only MLB-recognized leagues so leaderboards line up with Baseball-Reference.
    batting = load(data_dir, "Batting").query("lgID in @MAJOR_LEAGUES")
    pitching = load(data_dir, "Pitching").query("lgID in @MAJOR_LEAGUES")
    # Debut = first major-league season as a batter or pitcher.
    debut = pd.concat([batting[["playerID", "yearID"]], pitching[["playerID", "yearID"]]]).groupby("playerID").yearID.min()
    eligible = set(debut[debut >= FIRST_DEBUT_YEAR].index)
    batting = batting[batting.playerID.isin(eligible)]
    pitching = pitching[pitching.playerID.isin(eligible)]
    people = load(data_dir, "People")
    appearances = load(data_dir, "Appearances").query("lgID in @MAJOR_LEAGUES and playerID in @eligible")
    last_year = int(max(batting.yearID.max(), pitching.yearID.max()))

    # ---- Career batting totals ----
    bcols = ["G", "AB", "R", "H", "X2B", "X3B", "HR", "RBI", "SB", "BB", "HBP", "SH", "SF"]
    bat = batting.groupby("playerID")[bcols].sum(min_count=1).fillna(0)
    bat["TB"] = bat.H + bat.X2B + 2 * bat.X3B + 3 * bat.HR
    bat["PA"] = bat.AB + bat.BB + bat.HBP + bat.SH + bat.SF
    ab = bat.AB.where(bat.AB > 0)
    obp_den = (bat.AB + bat.BB + bat.HBP + bat.SF).where(lambda s: s > 0)
    bat["AVG"] = bat.H / ab
    bat["OBP"] = (bat.H + bat.BB + bat.HBP) / obp_den
    bat["SLG"] = bat.TB / ab
    bat["OPS"] = bat.OBP + bat.SLG

    # ---- Career pitching totals ----
    pcols = ["W", "L", "G", "GS", "CG", "SHO", "SV", "IPouts", "H", "ER", "BB", "SO"]
    pit = pitching.groupby("playerID")[pcols].sum(min_count=1).fillna(0)
    pit["IP"] = pit.IPouts / 3
    ip = pit.IP.where(pit.IP > 0)
    pit["ERA"] = 9 * pit.ER / ip
    pit["WHIP"] = (pit.BB + pit.H) / ip
    pit["K9"] = 9 * pit.SO / ip

    # key, label, group, frame, column, kind, ascending, decimals, qualifier
    stats = [
        ("H", "Hits", "Batting", bat, "H", "count", False, 0, None),
        ("HR", "Home Runs", "Batting", bat, "HR", "count", False, 0, None),
        ("RBI", "RBIs", "Batting", bat, "RBI", "count", False, 0, None),
        ("R", "Runs Scored", "Batting", bat, "R", "count", False, 0, None),
        ("2B", "Doubles", "Batting", bat, "X2B", "count", False, 0, None),
        ("3B", "Triples", "Batting", bat, "X3B", "count", False, 0, None),
        ("BB", "Walks", "Batting", bat, "BB", "count", False, 0, None),
        ("SB", "Stolen Bases", "Batting", bat, "SB", "count", False, 0, None),
        ("TB", "Total Bases", "Batting", bat, "TB", "count", False, 0, None),
        ("G", "Games Played", "Batting", bat, "G", "count", False, 0, None),
        ("AVG", "Batting Average", "Batting", bat, "AVG", "rate", False, 3, "pa"),
        ("OBP", "On-Base Percentage", "Batting", bat, "OBP", "rate", False, 3, "pa"),
        ("SLG", "Slugging Percentage", "Batting", bat, "SLG", "rate", False, 3, "pa"),
        ("OPS", "OPS", "Batting", bat, "OPS", "rate", False, 3, "pa"),
        ("W", "Wins", "Pitching", pit, "W", "count", False, 0, None),
        ("SO", "Strikeouts", "Pitching", pit, "SO", "count", False, 0, None),
        ("SV", "Saves", "Pitching", pit, "SV", "count", False, 0, None),
        ("IP", "Innings Pitched", "Pitching", pit, "IP", "count", False, 1, None),
        ("GS", "Games Started", "Pitching", pit, "GS", "count", False, 0, None),
        ("CG", "Complete Games", "Pitching", pit, "CG", "count", False, 0, None),
        ("SHO", "Shutouts", "Pitching", pit, "SHO", "count", False, 0, None),
        ("ERA", "ERA", "Pitching", pit, "ERA", "rate", True, 2, "ip"),
        ("WHIP", "WHIP", "Pitching", pit, "WHIP", "rate", True, 3, "ip"),
        ("K9", "Strikeouts per 9 Innings", "Pitching", pit, "K9", "rate", False, 2, "ip"),
    ]

    leaderboards = {}
    ranked_ids = set()
    for key, label, group, frame, col, kind, asc, dec, qual in stats:
        df = frame
        if qual == "pa":
            df = df[df.PA >= MIN_PA]
        elif qual == "ip":
            df = df[df.IP >= MIN_IP]
        vals = df[col].dropna()
        if kind == "count":
            vals = vals[vals > 0]  # zero in a counting stat = unranked
        # Round before ranking so ties match what people see on leaderboards
        # (rate stats are compared at one extra digit of precision, like B-Ref).
        rounded = vals.round(dec + 1 if kind == "rate" else dec)
        ranks = competition_rank(rounded, ascending=asc)
        keep = ranks[ranks <= MAX_RANK].sort_values(kind="stable")
        entries = []
        for pid in sorted(keep.index, key=lambda p: (keep[p], -rounded[p] if not asc else rounded[p], p)):
            entries.append({"id": pid, "rank": int(keep[pid]), "value": round(float(vals[pid]), dec + 1 if kind == "rate" else dec)})
            ranked_ids.add(pid)
        qualifier = None
        if qual == "pa":
            qualifier = f"Minimum {MIN_PA:,} plate appearances"
        elif qual == "ip":
            qualifier = f"Minimum {MIN_IP:,} innings pitched"
        leaderboards[key] = {
            "key": key,
            "label": label,
            "group": group,
            "kind": kind,
            "decimals": dec,
            "lowerIsBetter": asc,
            "qualifier": qualifier,
            "entries": entries,
        }

    # ---- Player index (everyone, for autocomplete) ----
    years = pd.concat([batting[["playerID", "yearID"]], pitching[["playerID", "yearID"]]])
    span = years.groupby("playerID").yearID.agg(["min", "max"])

    pos_cols = {"G_p": "P", "G_c": "C", "G_1b": "1B", "G_2b": "2B", "G_3b": "3B", "G_ss": "SS",
                "G_lf": "OF", "G_cf": "OF", "G_rf": "OF", "G_dh": "DH"}
    app = appearances.groupby("playerID")[list(pos_cols)].sum()
    of = app[["G_lf", "G_cf", "G_rf"]].sum(axis=1)
    app = app.drop(columns=["G_lf", "G_cf", "G_rf"]).assign(G_of=of)
    pos_names = {**{k: v for k, v in pos_cols.items() if v != "OF"}, "G_of": "OF"}
    primary = app.idxmax(axis=1).where(app.max(axis=1) > 0).map(pos_names)

    players = []
    names = {}
    for row in people.itertuples(index=False):
        pid = row.playerID
        if pid not in span.index:
            continue
        first = row.nameFirst if isinstance(row.nameFirst, str) else ""
        last = row.nameLast if isinstance(row.nameLast, str) else ""
        name = f"{first} {last}".strip() or pid
        names[pid] = name
        y0, y1 = int(span.loc[pid, "min"]), int(span.loc[pid, "max"])
        players.append({
            "id": pid,
            "n": name,
            "y": f"{y0}" if y0 == y1 else f"{y0}–{y1}",
            "p": primary.get(pid) if isinstance(primary.get(pid), str) else "",
            # popularity hint for autocomplete ordering: games played
            "g": int(max(bat.G.get(pid, 0), pit.G.get(pid, 0))),
        })
    players.sort(key=lambda p: -p["g"])

    for lb in leaderboards.values():
        for e in lb["entries"]:
            e["name"] = names.get(e["id"], e["id"])

    out = {
        "source": "Lahman Baseball Database",
        "throughSeason": last_year,
        "firstDebutYear": FIRST_DEBUT_YEAR,
        "maxRank": MAX_RANK,
        "stats": leaderboards,
    }
    (ROOT / "src/data").mkdir(parents=True, exist_ok=True)
    (ROOT / "src/data/leaderboards.json").write_text(json.dumps(out, separators=(",", ":")))
    (ROOT / "public/players.json").write_text(json.dumps(
        {"throughSeason": last_year, "players": players}, separators=(",", ":")))
    print(f"Through {last_year}: {len(players)} players, {len(leaderboards)} stats, "
          f"{len(ranked_ids)} ranked players")

    # ---- Hit the Number: every player's career total in each of its stats ----
    # Server-only, like the leaderboards. Only non-zero totals are stored; any
    # player in players.json who isn't listed for a stat has 0.
    number_stats = [("H", bat, "H"), ("HR", bat, "HR"), ("RBI", bat, "RBI"), ("R", bat, "R"),
                    ("2B", bat, "X2B"), ("SB", bat, "SB"), ("BB", bat, "BB"),
                    ("W", pit, "W"), ("SO", pit, "SO"), ("SV", pit, "SV")]
    totals = {}
    for key, frame, col in number_stats:
        vals = frame[col].astype(int)
        totals[key] = {pid: int(v) for pid, v in vals.items() if v > 0 and pid in names}
    (ROOT / "src/data/number.json").write_text(json.dumps(
        {"throughSeason": last_year, "firstDebutYear": FIRST_DEBUT_YEAR, "totals": totals},
        separators=(",", ":")))
    print(f"Hit the Number: career totals for {len(totals)} stats")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "../data-src/Lahman/data"))

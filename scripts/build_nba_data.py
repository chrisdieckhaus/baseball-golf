#!/usr/bin/env python3
"""Build the NBA data files for every game (Golf, Stats Ranker, Roster Reveal).

Input: the CSVs from https://github.com/sumitrodatta/bball-reference-datasets
(the "NBA Stats (1947-present)" Kaggle set), which are built from
Basketball-Reference. See research/nba-expansion-research.md in the project
docs: this data is fine for a private prototype, but needs a license or a legal
check before NBA goes public. NBA pages are off unless NBA_ENABLED is set.

Rules, matching Basketball-Reference's career leaderboards:
  - BAA, NBA and ABA careers combined, regular season only.
  - Seasons through THROUGH_SEASON (2025-26). Later rows are the season in progress.
  - A player traded mid-season has one row per team plus a "2TM"/"3TM" total.
    Careers use the total row; Roster Reveal uses the per-team rows.
  - Stats that weren't always tracked (rebounds, steals, blocks, 3-pointers,
    turnovers...) count only the seasons they were tracked. Per-game averages
    and their minimums use only those seasons too.

Outputs:
  src/data/nba/leaderboards.json   server-only: career leaderboards
  src/data/nba/player-meta.json    server-only: years and position of ranked players
  src/data/nba/roster.json         server-only: Roster Reveal team-seasons
  public/players-nba.json          autocomplete index of every player

Usage:
  git clone --depth 1 https://github.com/sumitrodatta/bball-reference-datasets /tmp/bbref
  python3 scripts/build_nba_data.py /tmp/bbref/Data
"""
import json
import math
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
THROUGH_SEASON = 2026  # the 2025-26 season
MAX_RANK = 300
MIN_GAMES = 400  # Basketball-Reference's career per-game minimum
MIN_PTS_FOR_PPG = 10_000  # PPG also qualifies with 10,000 points
MIN_FG = 2000
MIN_FT = 1200
MIN_3P = 250
LINEUP_SIZE = 8  # must match lineupSize("nba") in src/lib/roster.ts
MULTI_TEAM = r"^\d+TM$|^TOT$"
LEAGUE_LABEL = {"BAA": "BAA", "NBA": "NBA", "ABA": "ABA"}


def season_label(y: int) -> str:
    """2026 -> '2025–26' (the season that ended in 2026)."""
    return f"{y - 1}–{str(y)[-2:]}"


def competition_rank(values: pd.Series, ascending: bool) -> pd.Series:
    return values.rank(method="min", ascending=ascending).astype(int)


def main(data_dir: Path) -> None:
    rows = pd.read_csv(data_dir / "Player Totals.csv")
    rows = rows[rows.season <= THROUGH_SEASON]
    multi = rows.team.str.match(MULTI_TEAM)
    # Careers: one row per player per league per season (the total row if traded).
    has_total = set(map(tuple, rows[multi][["season", "lg", "player_id"]].values))
    key = list(zip(rows.season, rows.lg, rows.player_id))
    career_rows = rows[[m or (k not in has_total) for m, k in zip(multi, key)]]
    team_rows = rows[~multi]

    info = pd.read_csv(data_dir / "Player Career Info.csv").set_index("player_id")

    # ---- Career totals ----
    cols = ["g", "mp", "fg", "fga", "ft", "fta", "x3p", "x3pa", "orb", "trb", "ast", "stl", "blk", "tov", "pts"]
    tot = career_rows.groupby("player_id")[cols].sum(min_count=1)
    # Games in seasons where each stat was tracked, for per-game averages.
    def games_tracked(col: str) -> pd.Series:
        r = career_rows[career_rows[col].notna()]
        return r.groupby("player_id").g.sum()

    per_game = {}
    for col in ["pts", "trb", "ast", "stl", "blk", "mp"]:
        g = games_tracked(col)
        per_game[col] = (tot[col] / g.reindex(tot.index)).where(g.reindex(tot.index) >= MIN_GAMES)
    # PPG: 400 games or 10,000 points.
    ppg_g = games_tracked("pts").reindex(tot.index)
    per_game["pts"] = (tot.pts / ppg_g).where((ppg_g >= MIN_GAMES) | (tot.pts >= MIN_PTS_FOR_PPG))

    # Shooting: attempts only from seasons where both makes and attempts were tracked.
    def pct(made: str, att: str, minimum: int) -> pd.Series:
        r = career_rows[career_rows[made].notna() & career_rows[att].notna()]
        s = r.groupby("player_id")[[made, att]].sum()
        s = s[(s[made] >= minimum) & (s[att] > 0)]
        return s[made] / s[att]

    def since(col: str) -> str:
        first = career_rows[career_rows[col].notna()].groupby("lg").season.min()
        nba = int(first.get("NBA", first.min()))
        return f"Tracked since {season_label(nba)}"

    # key, label, group, family, series, kind, decimals, qualifier
    stats = [
        ("PTS", "Points", "Totals", "pts", tot.pts, "count", 0, None),
        ("TRB", "Rebounds", "Totals", "reb", tot.trb, "count", 0, since("trb")),
        ("AST", "Assists", "Totals", "ast", tot.ast, "count", 0, None),
        ("STL", "Steals", "Totals", "stl", tot.stl, "count", 0, since("stl")),
        ("BLK", "Blocks", "Totals", "blk", tot.blk, "count", 0, since("blk")),
        ("3P", "3-Pointers Made", "Totals", "3p", tot.x3p, "count", 0, "NBA since 1979–80; ABA 1967–76"),
        ("FG", "Field Goals Made", "Totals", "fg", tot.fg, "count", 0, None),
        ("FT", "Free Throws Made", "Totals", "ft", tot.ft, "count", 0, None),
        ("G", "Games Played", "Totals", "g", tot.g, "count", 0, None),
        ("MP", "Minutes Played", "Totals", "min", tot.mp, "count", 0, since("mp")),
        ("ORB", "Offensive Rebounds", "Totals", "reb", tot.orb, "count", 0, since("orb")),
        ("TOV", "Turnovers", "Totals", "tov", tot.tov, "count", 0, since("tov")),
        ("PPG", "Points per Game", "Per Game", "pts", per_game["pts"], "average", 2,
         f"Minimum {MIN_GAMES} games or {MIN_PTS_FOR_PPG:,} points"),
        ("RPG", "Rebounds per Game", "Per Game", "reb", per_game["trb"], "average", 2,
         f"Minimum {MIN_GAMES} games · {since('trb').lower()}"),
        ("APG", "Assists per Game", "Per Game", "ast", per_game["ast"], "average", 2, f"Minimum {MIN_GAMES} games"),
        ("SPG", "Steals per Game", "Per Game", "stl", per_game["stl"], "average", 2,
         f"Minimum {MIN_GAMES} games · {since('stl').lower()}"),
        ("BPG", "Blocks per Game", "Per Game", "blk", per_game["blk"], "average", 2,
         f"Minimum {MIN_GAMES} games · {since('blk').lower()}"),
        ("MPG", "Minutes per Game", "Per Game", "min", per_game["mp"], "average", 2,
         f"Minimum {MIN_GAMES} games · {since('mp').lower()}"),
        ("FG%", "Field Goal Percentage", "Shooting", "fg", pct("fg", "fga", MIN_FG), "rate", 3,
         f"Minimum {MIN_FG:,} field goals made"),
        ("FT%", "Free Throw Percentage", "Shooting", "ft", pct("ft", "fta", MIN_FT), "rate", 3,
         f"Minimum {MIN_FT:,} free throws made"),
        ("3P%", "3-Point Percentage", "Shooting", "3p", pct("x3p", "x3pa", MIN_3P), "rate", 3,
         f"Minimum {MIN_3P} 3-pointers made"),
    ]

    names = career_rows.drop_duplicates("player_id", keep="first").set_index("player_id").player.to_dict()
    # Most recent spelling of each name.
    latest = career_rows.sort_values("season").drop_duplicates("player_id", keep="last").set_index("player_id").player
    names.update(latest.to_dict())

    leaderboards = {}
    ranked = set()
    for key, label, group, family, series, kind, dec, qual in stats:
        vals = series.dropna()
        if kind == "count":
            vals = vals[vals > 0]
        # Ties are compared at the precision shown, except shooting percentages,
        # which (like Baseball-Reference and baseball's rate stats) compare one
        # digit deeper than the .498 they show.
        precision = dec + 1 if kind == "rate" else dec
        rounded = vals.round(precision)
        ranks = competition_rank(rounded, ascending=False)
        keep = ranks[ranks <= MAX_RANK]
        entries = []
        for pid in sorted(keep.index, key=lambda p: (keep[p], -rounded[p], p)):
            entries.append({"id": pid, "name": names.get(pid, pid), "rank": int(keep[pid]),
                            # the same rounding the ranks used, so ties show equal values
                            "value": float(rounded[pid])})
            ranked.add(pid)
        leaderboards[key] = {
            "key": key, "label": label, "group": group, "family": family, "kind": kind,
            "decimals": dec, "lowerIsBetter": False, "qualifier": qual, "entries": entries,
        }

    # ---- Players index ----
    span = career_rows.groupby("player_id").season.agg(["min", "max"])
    games = tot.g.fillna(0)
    players = []
    for pid, (y0, y1) in span.iterrows():
        pos = info.pos.get(pid) if pid in info.index else None
        players.append({
            "id": pid,
            "n": names.get(pid, pid),
            "y": f"{y0}" if y0 == y1 else f"{y0}–{y1}",
            "p": pos if isinstance(pos, str) else "",
            "g": int(games.get(pid, 0)),
        })
    players.sort(key=lambda p: (-p["g"], p["n"]))
    meta = {p["id"]: [p["y"], p["p"]] for p in players if p["id"] in ranked}

    # ---- Roster Reveal ----
    allstar = pd.read_csv(data_dir / "All-Star Selections.csv")
    allstar = allstar[allstar.season <= THROUGH_SEASON].drop_duplicates(["player_id", "season", "lg"]).groupby("player_id").size()
    awards = pd.read_csv(data_dir / "Player Award Shares.csv")
    mvps = awards[awards.award.isin(["nba mvp", "aba mvp"]) & (awards.winner == True)].groupby("player_id").size()  # noqa: E712
    allleague = pd.read_csv(data_dir / "End of Season Teams.csv")
    allleague = allleague[allleague.type.isin(["All-NBA", "All-ABA", "All-BAA"])].groupby("player_id").size()
    hofs = set(info[info.hof == True].index)  # noqa: E712

    def fame(p: str) -> float:
        return (3 * allstar.get(p, 0) + 2 * allleague.get(p, 0) + 6 * mvps.get(p, 0)
                + (15 if p in hofs else 0) + math.log1p(games.get(p, 0)))

    abbrev = pd.read_csv(data_dir / "Team Abbrev.csv")
    abbrev = abbrev[abbrev.season <= THROUGH_SEASON]
    summaries = pd.read_csv(data_dir / "Team Summaries.csv")
    summaries = summaries[summaries.abbreviation.notna()].set_index(["season", "abbreviation"])

    def short_pos(pos, pid):
        if not isinstance(pos, str):
            pos = info.pos.get(pid) if pid in info.index else ""
        return pos.split("-")[0] if isinstance(pos, str) else ""

    year_teams: dict[int, list[list[str]]] = {}
    for t in abbrev.sort_values("team").itertuples():
        label = t.team + (" (ABA)" if t.lg == "ABA" else "")
        year_teams.setdefault(int(t.season), []).append([t.abbreviation, label])

    rounds, skipped = [], []
    for t in abbrev.itertuples():
        y, abbr = int(t.season), t.abbreviation
        tr = team_rows[(team_rows.season == y) & (team_rows.team == abbr)]
        # The rotation: most minutes; before minutes were tracked (1946-51), most points.
        by = "mp" if tr.mp.notna().all() else "pts"
        top = tr.sort_values([by, "g"], ascending=False).drop_duplicates("player_id").head(LINEUP_SIZE)
        if len(top) < LINEUP_SIZE:
            skipped.append(f"{y} {t.team}")
            continue
        ordered = sorted(top.itertuples(), key=lambda r: fame(r.player_id))
        s = summaries.loc[(y, abbr)] if (y, abbr) in summaries.index else None
        record = f"{int(s.w)}–{int(s.l)}" if s is not None and pd.notna(s.w) else ""
        rounds.append({
            "franchise": abbr,
            "year": y,
            "team": t.team,
            "record": record,
            "postseason": "Made the playoffs" if bool(t.playoffs) else "",
            "lineup": [{"id": r.player_id, "name": r.player, "pos": short_pos(r.pos, r.player_id)} for r in ordered],
        })
    rounds.sort(key=lambda r: (r["year"], r["franchise"]))

    out_dir = ROOT / "src/data/nba"
    out_dir.mkdir(parents=True, exist_ok=True)
    source = "Basketball-Reference (via sumitrodatta/bball-reference-datasets)"
    (out_dir / "leaderboards.json").write_text(json.dumps({
        "source": source, "throughSeason": THROUGH_SEASON, "firstDebutYear": int(span["min"].min()),
        "maxRank": MAX_RANK, "stats": leaderboards,
    }, ensure_ascii=False, separators=(",", ":")))
    (out_dir / "player-meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    (out_dir / "roster.json").write_text(json.dumps({
        "source": source, "firstYear": int(abbrev.season.min()), "lastYear": THROUGH_SEASON,
        "yearTeams": year_teams, "rounds": rounds,
    }, ensure_ascii=False, separators=(",", ":")))
    (ROOT / "public/players-nba.json").write_text(json.dumps(
        {"throughSeason": THROUGH_SEASON, "players": players}, ensure_ascii=False, separators=(",", ":")))
    print(f"Through {season_label(THROUGH_SEASON)}: {len(players)} players, {len(leaderboards)} stats, "
          f"{len(ranked)} ranked; {len(rounds)} team-seasons, skipped {len(skipped)}: {skipped[:10]}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))

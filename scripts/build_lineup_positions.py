#!/usr/bin/env python3
"""Build src/data/lineup-positions.json: which lineup spots each player can fill.

Lineup Card's nine spots are C, 1B, 2B, 3B, SS, LF, CF, RF and DH. Like Hit the
Number's slots, any appearance qualifies: one game in left field makes a left
fielder. Hit the Number's own position data lumps the outfield together, so
Lineup Card keeps its own file (server-only), one bit mask per player in
public/players.json.

Input: the .RData files from the Lahman R package (https://github.com/cdalzell/Lahman).

Usage:
  pip install pyreadr pandas
  python3 scripts/build_lineup_positions.py /path/to/Lahman/data
"""
import json
import sys
from pathlib import Path

import pyreadr

ROOT = Path(__file__).resolve().parent.parent

# Bit order matters: src/lib/lineup.ts reads the masks in this order.
SPOTS = [("C", "G_c"), ("1B", "G_1b"), ("2B", "G_2b"), ("3B", "G_3b"), ("SS", "G_ss"),
         ("LF", "G_lf"), ("CF", "G_cf"), ("RF", "G_rf"), ("DH", "G_dh")]


def main(data_dir: Path) -> None:
    index = json.loads((ROOT / "public/players.json").read_text())["players"]
    ids = {p["id"] for p in index}
    app = pyreadr.read_r(str(data_dir / "Appearances.RData"))["Appearances"]
    app = app[app.playerID.isin(ids)]
    games = app.groupby("playerID")[[col for _, col in SPOTS]].sum()

    masks: dict[str, int] = {}
    for pid, row in games.iterrows():
        m = 0
        for bit, (_, col) in enumerate(SPOTS):
            if row[col] > 0:
                m |= 1 << bit
        if m:
            masks[str(pid)] = m

    out = ROOT / "src/data/lineup-positions.json"
    out.write_text(json.dumps({"spots": [s for s, _ in SPOTS], "players": dict(sorted(masks.items()))},
                              separators=(",", ":")))
    counts = {s: sum(1 for m in masks.values() if m >> b & 1) for b, (s, _) in enumerate(SPOTS)}
    print(f"Lineup Card: {len(masks)} players with a lineup spot; per spot {counts}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "../data-src/Lahman/data"))

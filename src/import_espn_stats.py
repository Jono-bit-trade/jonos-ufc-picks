"""Convert ESPN fight statistics (espn_backfill.py) into data/fight_stats.csv, the per-fighter
fight totals the STYLE features and the fighter pages use.

ESPN names its stats in camelCase. Each target column lists the names it accepts; the first
one present wins. Run it alone to print every stat name seen, if a column comes out empty.

Run:  python src/import_espn_stats.py
"""
import os, re
import numpy as np
import pandas as pd
from common import path

TARGETS = {   # our column: ESPN stat names, in order of preference (lowercase)
    "sig_landed": ["sigstrikeslanded", "significantstrikeslanded", "sigstrikes"],
    "sig_att": ["sigstrikesattempted", "significantstrikesattempted"],
    "kd": ["knockdowns", "knockdownslanded"],
    "td_landed": ["takedownslanded", "takedownssuccessful", "takedowns"],
    "td_att": ["takedownsattempted", "takedownattempts"],
    "sub_att": ["submissionattempts", "submissionsattempted", "submissions"],
    "ctrl_secs": ["timeincontrol", "controltime", "groundcontroltime", "ctrltime"],
}


def secs(v, display):
    """Control time comes as seconds, or as 'm:ss' in the display value."""
    if isinstance(display, str) and re.fullmatch(r"\d+:\d\d", display.strip()):
        m, s = display.strip().split(":")
        return int(m) * 60 + int(s)
    try:
        return float(v)
    except (TypeError, ValueError):
        return np.nan


def fight_seconds(detail, end_round):
    try:
        r = int(float(end_round))
    except (TypeError, ValueError):
        return np.nan
    m = re.search(r"(\d+):(\d\d)", str(detail))
    t = int(m.group(1)) * 60 + int(m.group(2)) if m else 300
    return (r - 1) * 300 + t


def main():
    f = path("espn_stats_long.csv.gz")
    if not os.path.exists(f):
        raise SystemExit("no ESPN stats yet: run src/espn_backfill.py")
    s = pd.read_csv(f, dtype={"espn_fight": str})
    s = s[s["stat"].notna() & (s["stat"] != "stat")]   # drop repeated headers from appended files
    s["key"] = s["stat"].str.lower()
    names = sorted(s["key"].unique())
    print(len(names), "ESPN stat names:", ", ".join(names))
    wide = {}
    for col, cands in TARGETS.items():
        hit = next((c for c in cands if c in names), None)
        if hit is None:
            print("no ESPN stat found for", col)
            continue
        d = s[s["key"] == hit]
        vals = [secs(v, dv) for v, dv in zip(d["value"], d["display"])] if col == "ctrl_secs" \
            else pd.to_numeric(d["value"], errors="coerce")
        wide[col] = pd.Series(list(vals), index=pd.MultiIndex.from_arrays([d["espn_fight"], d["fighter"]])) \
            .groupby(level=[0, 1]).first()
    if not wide:
        raise SystemExit("no usable stats yet")
    w = pd.DataFrame(wide).reset_index().rename(columns={"level_0": "espn_fight", "level_1": "fighter"})
    w.columns = ["espn_fight", "fighter"] + list(wide)
    h = pd.read_csv(path("espn_history.csv"), dtype={"espn_fight": str}).drop_duplicates("espn_fight")
    h = h[["espn_fight", "date", "a", "b", "winner", "end_round", "status_detail"]]
    w = w.merge(h, on="espn_fight")
    w["opponent"] = np.where(w["fighter"] == w["a"], w["b"], w["a"])
    w["won"] = ((w["fighter"] == w["a"]) & (w["winner"] == "a") | (w["fighter"] == w["b"]) & (w["winner"] == "b")).astype(int)
    w["fight_secs"] = [fight_seconds(d, r) for d, r in zip(w["status_detail"], w["end_round"])]
    opp = w[["espn_fight", "fighter"] + [c for c in ["sig_landed", "td_landed", "td_att"] if c in w]].rename(
        columns={"fighter": "opponent", "sig_landed": "sig_absorbed", "td_landed": "td_allowed", "td_att": "td_faced"})
    w = w.merge(opp, on=["espn_fight", "opponent"], how="left")
    w["fight_id"] = w["date"] + "|" + w["a"] + "|" + w["b"]
    cols = ["fight_id", "date", "fighter", "opponent", "won", "kd", "sig_landed", "sig_att", "sig_absorbed",
            "td_landed", "td_att", "td_allowed", "td_faced", "sub_att", "ctrl_secs", "fight_secs"]
    for c in cols:
        if c not in w:
            w[c] = 0 if c in ("kd", "sub_att", "ctrl_secs") else np.nan
    out = w[cols]
    g = path("fight_stats.csv")
    if os.path.exists(g):
        out = pd.concat([pd.read_csv(g), out]).drop_duplicates(["date", "fighter"], keep="last")
    out.to_csv(g, index=False)
    print(f"fight_stats.csv: {len(out)} fighter-fights")


if __name__ == "__main__":
    main()

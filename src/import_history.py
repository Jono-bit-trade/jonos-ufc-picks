"""Turn the history backfill's raw tables into the model's files.

The backfill workflow runs the open-source ufcscraper package
(https://github.com/balaustrada/ufcscraper), which scrapes every UFC fight from
UFCStats and every fighter's opening and closing lines from BestFightOdds into
data/ufcscraper/. This script converts those tables into:

  data/history_fights.csv   one row per fight, fights.csv columns plus opening lines
  data/fight_stats.csv      per-fighter totals for every fight (merged with your weekly scrape)

Run:  python src/import_history.py
"""
import os
import numpy as np
import pandas as pd
from common import path, implied

SRC = path("ufcscraper")


def read(name):
    f = os.path.join(SRC, name)
    return pd.read_csv(f, dtype=str) if os.path.exists(f) else pd.DataFrame()


def secs(x):
    try:
        m, s = str(x).split(":")
        return int(m) * 60 + int(s)
    except ValueError:
        return np.nan


def finish_of(result, details):
    r, d = str(result), str(details)
    if "KO" in r:
        return "KO/TKO", "KO"
    if "Submission" in r:
        return "SUB", "SUB"
    if "Decision" in r:
        return {"Unanimous": "U-DEC", "Split": "S-DEC", "Majority": "M-DEC"}.get(d.strip(), "U-DEC"), "DEC"
    return r.strip() or None, "OTHER"


def to_american(p):
    p = np.asarray(p, float)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(p >= 0.5, -100 * p / (1 - p), 100 * (1 - p) / p).round()


def mid_line(lo, hi):
    """Middle of a closing range, averaged as probabilities (averaging -110 and +110 directly gives 0)."""
    return to_american((implied(lo) + implied(hi)) / 2)


def build():
    ev, fi, fr, rd, od = (read("event_data.csv"), read("fight_data.csv"), read("fighter_data.csv"),
                          read("round_data.csv"), read("BestFightOdds_odds.csv"))
    if fi.empty or ev.empty or fr.empty:
        print("no backfill tables in data/ufcscraper yet")
        return None
    fr["name"] = (fr["fighter_f_name"].fillna("") + " " + fr["fighter_l_name"].fillna("")).str.strip()
    names = fr.set_index("fighter_id")
    ev["location"] = ev[["event_city", "event_state", "event_country"]].apply(
        lambda r: ", ".join(x for x in r if isinstance(x, str) and x), axis=1)
    d = fi.merge(ev[["event_id", "event_name", "event_date", "location"]], on="event_id", how="left")
    d = d[d["event_date"].notna()]

    out = pd.DataFrame({"date": d["event_date"].str[:10], "event": d["event_name"], "location": d["location"],
                        "weight_class": d["weight_class"].str.replace(r"(UFC |Interim |Title |Bout)", "", regex=True).str.strip(),
                        "gender": d["gender"], "title": d["title_fight"].eq("T"),
                        "rounds": pd.to_numeric(d["num_rounds"], errors="coerce"),
                        "a_id": d["fighter_1"], "b_id": d["fighter_2"],
                        "end_round": pd.to_numeric(d["finish_round"], errors="coerce"),
                        "ufcstats_fight": d["fight_id"]})
    out["a"] = out["a_id"].map(names["name"])
    out["b"] = out["b_id"].map(names["name"])
    w = d["winner"].fillna("")
    out["winner"] = np.where(w == d["fighter_1"], "a", np.where(w == d["fighter_2"], "b",
                    np.where(w.str.lower() == "draw", "draw", "nc")))
    fm = [finish_of(r, x) for r, x in zip(d["result"], d["result_details"])]
    out["finish"], out["method"] = [f[0] for f in fm], [f[1] for f in fm]
    out["fight_secs"] = (out["end_round"] - 1) * 300 + d["finish_time"].map(secs).values
    for s in "ab":
        ids = out[f"{s}_id"]
        out[f"height_{s}"] = pd.to_numeric(ids.map(names["fighter_height_cm"]), errors="coerce")
        out[f"reach_{s}"] = pd.to_numeric(ids.map(names["fighter_reach_cm"]), errors="coerce")
        out[f"stance_{s}"] = ids.map(names["fighter_stance"])
        dob = pd.to_datetime(ids.map(names["fighter_dob"]), errors="coerce")
        out[f"age_{s}"] = ((pd.to_datetime(out["date"]) - dob).dt.days // 365.25)

    # BestFightOdds: opening line and the middle of the closing range, per fighter
    if not od.empty:
        od = od.copy()
        for c in ["opening", "closing_range_min", "closing_range_max"]:
            od[c] = pd.to_numeric(od[c], errors="coerce")
        od["close"] = mid_line(od["closing_range_min"], od["closing_range_max"])
        o = od.set_index(["fight_id", "fighter_id"])
        for s in "ab":
            key = list(zip(out["ufcstats_fight"], out[f"{s}_id"]))
            out[f"open_{s}"] = o["opening"].reindex(key).values
            out[f"odds_{s}"] = o["close"].reindex(key).values
    else:
        for c in ["open_a", "open_b", "odds_a", "odds_b"]:
            out[c] = np.nan

    out = out.dropna(subset=["a", "b", "date"])
    out["fight_id"] = out["date"] + "|" + out["a"] + "|" + out["b"]
    out["source"] = "ufcscraper"
    out.sort_values("date").to_csv(path("history_fights.csv"), index=False)
    print(f"history_fights.csv: {len(out)} fights {out['date'].min()} to {out['date'].max()}, "
          f"{out['open_a'].notna().sum()} with opening lines, {out['odds_a'].notna().sum()} with closing lines")

    # per-fighter fight totals from the round table
    if not rd.empty:
        num = [c for c in rd.columns if c not in ("fight_id", "fighter_id", "round", "ctrl_time")]
        rd[num] = rd[num].apply(pd.to_numeric, errors="coerce")
        rd["ctrl_secs"] = rd["ctrl_time"].map(secs)
        tot = rd.groupby(["fight_id", "fighter_id"])[num + ["ctrl_secs"]].sum().reset_index()
        opp = tot.rename(columns={c: "opp_" + c for c in num + ["ctrl_secs"]}).rename(columns={"fighter_id": "opp_id"})
        pairs = tot.merge(opp, on="fight_id")
        pairs = pairs[pairs["fighter_id"] != pairs["opp_id"]]
        info = out.set_index("ufcstats_fight")
        pairs = pairs[pairs["fight_id"].isin(info.index)]
        st = pd.DataFrame({
            "fight_id": pairs["fight_id"].map(info["fight_id"]), "date": pairs["fight_id"].map(info["date"]),
            "fighter": pairs["fighter_id"].map(names["name"]), "opponent": pairs["opp_id"].map(names["name"]),
            "kd": pairs["knockdowns"], "sig_landed": pairs["strikes_succ"], "sig_att": pairs["strikes_att"],
            "sig_absorbed": pairs["opp_strikes_succ"], "td_landed": pairs["takedown_succ"],
            "td_att": pairs["takedown_att"], "td_allowed": pairs["opp_takedown_succ"],
            "td_faced": pairs["opp_takedown_att"], "sub_att": pairs["submission_att"],
            "ctrl_secs": pairs["ctrl_secs"], "fight_secs": pairs["fight_id"].map(info["fight_secs"])})
        f = path("fight_stats.csv")
        if os.path.exists(f):
            st = pd.concat([pd.read_csv(f), st]).drop_duplicates(["date", "fighter"], keep="first")
        st.dropna(subset=["fighter"]).to_csv(f, index=False)
        print(f"fight_stats.csv: {len(st)} fighter-fights")
    return out


if __name__ == "__main__":
    build()

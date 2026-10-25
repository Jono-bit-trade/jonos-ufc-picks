"""Step 2: build data/fights.csv (one row per fight, oldest first).

Two sources, merged:
  1. The Ultimate UFC Dataset (GitHub): results, closing odds, method odds,
     fighter attributes, from 2010. Updated by its author every so often.
  2. Your own UFCStats scrape (scrape_ufcstats.py): any event newer than
     the dataset, plus the upcoming card. No odds; those come from get_odds.py.

Run:  python src/get_data.py            (download + merge)
      python src/get_data.py --offline  (merge files already in data/raw)
"""
import os, sys, requests, pandas as pd
from common import path

RAW = path("raw")
URL = "https://raw.githubusercontent.com/shortlikeafox/ultimate_ufc_dataset/main/{}"

# columns every fight row carries, whatever its source
COLUMNS = ["fight_id", "date", "event", "location", "weight_class", "gender", "title",
           "rounds", "a", "b", "winner", "method", "finish", "end_round", "fight_secs",
           "odds_a", "odds_b", "dec_odds_a", "dec_odds_b", "ko_odds_a", "ko_odds_b",
           "sub_odds_a", "sub_odds_b", "age_a", "age_b", "height_a", "height_b",
           "reach_a", "reach_b", "stance_a", "stance_b", "source"]

# The dataset's career-average stat columns are NOT used: they include fights after
# the one being predicted (debut fights already show averages), which leaks the future.
# Style stats come from your own scrape instead (scrape_ufcstats.py --backfill).


def download():
    os.makedirs(RAW, exist_ok=True)
    for name in ["ufc-master.csv", "upcoming.csv"]:
        r = requests.get(URL.format(name), timeout=60)
        r.raise_for_status()
        open(os.path.join(RAW, name), "wb").write(r.content)
        print("downloaded", name, len(r.content) // 1024, "KB")


def method_of(finish):
    f = str(finish)
    if "KO" in f:
        return "KO"
    if f == "SUB":
        return "SUB"
    if "DEC" in f:
        return "DEC"
    return "OTHER"   # DQ, overturned, no contest


def normalize_ultimate(df):
    out = pd.DataFrame({
        "date": pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d"),
        "event": "", "location": df["location"], "weight_class": df["weight_class"],
        "gender": df["gender"].str.upper().str[0], "title": df["title_bout"].astype(bool),
        "rounds": df["no_of_rounds"], "a": df["R_fighter"], "b": df["B_fighter"],
        "method": df["finish"].map(method_of), "finish": df["finish"],
        "end_round": df.get("finish_round"), "fight_secs": df.get("total_fight_time_secs"),
        "odds_a": df["R_odds"], "odds_b": df["B_odds"],
        "dec_odds_a": df.get("r_dec_odds"), "dec_odds_b": df.get("b_dec_odds"),
        "ko_odds_a": df.get("r_ko_odds"), "ko_odds_b": df.get("b_ko_odds"),
        "sub_odds_a": df.get("r_sub_odds"), "sub_odds_b": df.get("b_sub_odds"),
        "age_a": df["R_age"], "age_b": df["B_age"],
        "height_a": df["R_Height_cms"], "height_b": df["B_Height_cms"],
        "reach_a": df["R_Reach_cms"], "reach_b": df["B_Reach_cms"],
        "stance_a": df["R_Stance"], "stance_b": df["B_Stance"], "source": "ultimate",
    })
    w = df["Winner"].astype(str)
    out["winner"] = w.map({"Red": "a", "Blue": "b", "Draw": "draw"}).fillna("nc")
    for c in ["height_a", "height_b", "reach_a", "reach_b", "age_a", "age_b"]:
        out[c] = out[c].where(out[c] > 0)   # the dataset uses 0 for unknown
    out["fight_id"] = out["date"] + "|" + out["a"] + "|" + out["b"]
    return out


def same_fight_key(d):
    pair = d.apply(lambda r: "|".join(sorted([r["a"], r["b"]])), axis=1)
    return d["date"] + "|" + pair


def fill_logged_odds(fights):
    """Scraped fights have no odds. Fill them from the lines predict.py logged before
    each fight, so new fights join future backtests."""
    log = path("pick_log.csv")
    if not os.path.exists(log):
        return fights
    from get_odds import norm
    lut = {}
    for p in pd.read_csv(log).dropna(subset=["odds_a", "odds_b"]).itertuples():
        lut[(p.date, norm(p.a), norm(p.b))] = (p.odds_a, p.odds_b)
        lut[(p.date, norm(p.b), norm(p.a))] = (p.odds_b, p.odds_a)
    miss = fights["odds_a"].isna()
    for i in fights.index[miss]:
        o = lut.get((fights.at[i, "date"], norm(fights.at[i, "a"]), norm(fights.at[i, "b"])))
        if o:
            fights.at[i, "odds_a"], fights.at[i, "odds_b"] = o
    return fights


def drop_known(new, known, days=2):
    """Rows of `new` whose pairing isn't already in `known` within `days` days
    (sources disagree on dates by a day around midnight and overseas cards)."""
    from get_odds import norm
    seen = {}
    for a, b, d in zip(known["a"], known["b"], pd.to_datetime(known["date"])):
        seen.setdefault(frozenset((norm(a), norm(b))), []).append(d)
    keep = []
    for a, b, d in zip(new["a"], new["b"], pd.to_datetime(new["date"])):
        ds = seen.get(frozenset((norm(a), norm(b))), [])
        keep.append(not any(abs((d - x).days) <= days for x in ds))
    return new[keep]


def canonical(df, known):
    """Use the history's spelling of each fighter's name."""
    from get_odds import norm
    names = {norm(n): n for n in pd.concat([known["a"], known["b"]]).unique()}
    for s in "ab":
        df[s] = df[s].map(lambda n: names.get(norm(n), n))
    return df


def espn_results():
    """Finished bouts from the ESPN live feed, in fights.csv columns (no stats or attributes)."""
    f = path("espn_results.csv")
    if not os.path.exists(f):
        return pd.DataFrame()
    e = pd.read_csv(f)
    e = e[e["winner"].isin(["a", "b", "draw"])].copy()
    e["fight_id"] = e["date"] + "|" + e["a"] + "|" + e["b"]
    e["source"] = "espn"
    e["fight_secs"] = None
    return e


def build(offline=False):
    from config import OFFLINE
    if not (offline or OFFLINE):
        download()
    hist = normalize_ultimate(pd.read_csv(os.path.join(RAW, "ufc-master.csv")))
    frames = [hist]
    known = hist
    for name, extra in [("UFCStats", pd.read_csv(path("scraped_fights.csv"))
                         if os.path.exists(path("scraped_fights.csv")) else pd.DataFrame()),
                        ("ESPN", espn_results())]:
        if extra.empty:
            continue
        extra = drop_known(canonical(extra, known), known)   # earlier sources win on overlap
        frames.append(extra)
        known = pd.concat([known, extra], ignore_index=True)
        print(f"added {len(extra)} {name} fights not already in the history")
    fights = pd.concat(frames, ignore_index=True)
    for c in COLUMNS:
        if c not in fights:
            fights[c] = None
    fights = fill_logged_odds(fights)
    fights = fights.sort_values(["date", "fight_id"]).reset_index(drop=True)
    fights[COLUMNS].to_csv(path("fights.csv"), index=False)
    print(f"fights.csv: {len(fights)} fights, {fights.date.min()} to {fights.date.max()}")
    return fights


if __name__ == "__main__":
    build(offline="--offline" in sys.argv)

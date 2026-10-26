"""Step 2: build data/fights.csv (one row per fight, oldest first).

Sources, merged in this order (an earlier source wins when two have the same fight):
  1. The Ultimate UFC Dataset (GitHub): results, closing odds, method odds,
     fighter attributes, from 2010. Updated by its author every so often.
  2. ESPN results: the live feed (espn.py) and its history backfill (espn.py --history).
Then: one spelling per fighter, impossible lines blanked, and opening and closing lines
from ESPN's sportsbooks (espn_backfill.py) and SplitPicks attached where a fight lacks them.

Run:  python src/get_data.py            (download + merge)
      python src/get_data.py --offline  (merge files already in data/raw)
"""
import os, sys, requests, numpy as np, pandas as pd
from common import path

RAW = path("raw")
URL = "https://raw.githubusercontent.com/shortlikeafox/ultimate_ufc_dataset/main/{}"

# columns every fight row carries, whatever its source
COLUMNS = ["fight_id", "date", "event", "location", "weight_class", "gender", "title",
           "rounds", "bout_order", "a", "b", "winner", "method", "finish", "end_round", "fight_secs",
           "odds_a", "odds_b", "dec_odds_a", "dec_odds_b", "ko_odds_a", "ko_odds_b",
           "sub_odds_a", "sub_odds_b", "open_a", "open_b", "age_a", "age_b", "height_a", "height_b",
           "reach_a", "reach_b", "stance_a", "stance_b", "source"]

# The dataset's career-average stat columns are NOT used: they include fights after
# the one being predicted (debut fights already show averages), which leaks the future.
# Per-fight stats come from ESPN instead (espn_backfill.py -> import_espn_stats.py).


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
        "bout_order": df.groupby("date").cumcount() + 1,   # the dataset lists each card main event first
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
    """Rows of `new` that aren't already in `known`. A fight counts as known when either
    fighter already has a fight within `days` days: sources disagree on dates around
    midnight and overseas cards, and on spellings ("Zhang Weili" / "Weili Zhang")."""
    from get_odds import norm
    seen = {}
    for a, b, d in zip(known["a"], known["b"], pd.to_datetime(known["date"])):
        for n in (a, b):
            seen.setdefault(norm(n), []).append(d)
    keep = []
    for a, b, d in zip(new["a"], new["b"], pd.to_datetime(new["date"])):
        hit = any(abs((d - x).days) <= days for n in (a, b) for x in seen.get(norm(n), []))
        keep.append(not hit)
    return new[keep]


def valid_line(oa, ob):
    """A believable two-way moneyline: both numbers real (|odds| >= 100), the bookmaker's
    margin between -3% and +30%, and not both fighters priced as clear favorites."""
    from common import implied
    try:
        oa, ob = float(oa), float(ob)
    except (TypeError, ValueError):
        return False
    if oa != oa or ob != ob or abs(oa) < 100 or abs(ob) < 100:
        return False
    over = float(implied(oa)) + float(implied(ob))
    return 0.97 <= over <= 1.30 and not (oa < -130 and ob < -130)


def clean_lines(fights):
    """Blank lines that can't be right, so better sources can fill them; drop opening lines
    that differ from the close by 25+ points (almost always the two sides swapped)."""
    from common import no_vig
    bad = [not valid_line(a, b) if (pd.notna(a) or pd.notna(b)) else False for a, b in zip(fights["odds_a"], fights["odds_b"])]
    fights.loc[bad, ["odds_a", "odds_b"]] = np.nan
    bado = [not valid_line(a, b) if (pd.notna(a) or pd.notna(b)) else False for a, b in zip(fights["open_a"], fights["open_b"])]
    fights.loc[bado, ["open_a", "open_b"]] = np.nan
    mv = (no_vig(pd.to_numeric(fights["odds_a"], errors="coerce"), pd.to_numeric(fights["odds_b"], errors="coerce"))
          - no_vig(pd.to_numeric(fights["open_a"], errors="coerce"), pd.to_numeric(fights["open_b"], errors="coerce")))
    swapped = np.abs(np.nan_to_num(mv)) > 0.25
    fights.loc[swapped, ["open_a", "open_b"]] = np.nan
    print(f"lines: blanked {sum(bad)} closing and {sum(bado) + int(swapped.sum())} opening lines that can't be right")
    return fights


def one_spelling(fights):
    """Each fighter under one spelling everywhere ("Kai Kara-France" / "Kai Kara France"),
    so ratings and records aren't split. Uses the most recent spelling."""
    import re, unicodedata
    key = lambda n: re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", str(n)).encode("ascii", "ignore").decode().lower())
    for s_ in "ab":
        fights[s_] = fights[s_].astype(str).str.strip()
    long = pd.concat([fights[["date", "a"]].rename(columns={"a": "n"}), fights[["date", "b"]].rename(columns={"b": "n"})])
    long = long.sort_values("date")
    best = {}
    for n in long["n"]:
        best[key(n)] = n     # latest wins
    changed = 0
    for s_ in "ab":
        new = fights[s_].map(lambda n: best.get(key(n), n))
        changed += int((new != fights[s_]).sum())
        fights[s_] = new
    fights["fight_id"] = fights["date"] + "|" + fights["a"] + "|" + fights["b"]
    print(f"names: unified {changed} spellings")
    return fights


def canonical(df, known):
    """Use the history's spelling of each fighter's name."""
    from get_odds import norm
    names = {norm(n): n for n in pd.concat([known["a"], known["b"]]).unique()}
    for s in "ab":
        df[s] = df[s].map(lambda n: names.get(norm(n), n))
    return df


NOT_UFC = r"contender series|road to ufc|ultimate fighter|tuf |looking for a fight"


def espn_results(name="espn_results.csv"):
    """Finished bouts from ESPN, in fights.csv columns (no stats or attributes)."""
    f = path(name)
    if not os.path.exists(f):
        return pd.DataFrame()
    e = pd.read_csv(f)
    if "winner" not in e:
        return pd.DataFrame()
    e = e[e["winner"].isin(["a", "b", "draw"])].copy()
    if "event" in e:   # ESPN's UFC calendar also lists the Contender Series and other non-UFC shows
        e = e[~e["event"].fillna("").str.contains(NOT_UFC, case=False, regex=True)]
    e = e.drop_duplicates(["date", "a", "b"], keep="last")
    e["fight_id"] = e["date"] + "|" + e["a"] + "|" + e["b"]
    e["source"] = "espn"
    e["fight_secs"] = None
    if "espn_odds_a" in e:
        e["odds_a"], e["odds_b"] = e["espn_odds_a"], e["espn_odds_b"]
    return e


def read_csv(name):
    f = path(name)
    return pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()


def attach_lines(fights, sources, days=2):
    """Fill missing opening and closing lines from other sources, matching the pair within `days`."""
    from get_odds import norm
    lut = {}
    for src in sources:
        if src.empty:
            continue
        for c in ["open_a", "open_b", "odds_a", "odds_b"]:
            if c not in src:
                src[c] = None
        for r in src.itertuples():
            if not valid_line(r.odds_a, r.odds_b):
                r = r._replace(odds_a=None, odds_b=None)
            if not valid_line(r.open_a, r.open_b):
                r = r._replace(open_a=None, open_b=None)
            k = frozenset((norm(r.a), norm(r.b)))
            lut.setdefault(k, []).append((pd.Timestamp(r.date), norm(r.a), r.open_a, r.open_b, r.odds_a, r.odds_b))
    filled = {"open": 0, "close": 0}
    for i, r in fights.iterrows():
        cands = lut.get(frozenset((norm(r["a"]), norm(r["b"]))), [])
        d = pd.Timestamp(r["date"])
        for cd, ca, oa, ob, ca_, cb_ in cands:
            if abs((cd - d).days) > days:
                continue
            same = ca == norm(r["a"])
            oa, ob, ca_, cb_ = (oa, ob, ca_, cb_) if same else (ob, oa, cb_, ca_)
            if pd.isna(fights.at[i, "open_a"]) and pd.notna(oa) and pd.notna(ob):
                fights.at[i, "open_a"], fights.at[i, "open_b"] = oa, ob
                filled["open"] += 1
            if pd.isna(fights.at[i, "odds_a"]) and pd.notna(ca_) and pd.notna(cb_):
                fights.at[i, "odds_a"], fights.at[i, "odds_b"] = ca_, cb_
                filled["close"] += 1   # earlier sources win; later ones only fill gaps
    print(f"attached {filled['open']} opening and {filled['close']} closing lines from other sources")
    return fights


def build(offline=False):
    from config import OFFLINE
    if not (offline or OFFLINE):
        download()
    hist = normalize_ultimate(pd.read_csv(os.path.join(RAW, "ufc-master.csv")))
    frames = [hist]
    known = hist
    espn_hist = espn_results("espn_history.csv")
    for name, extra in [("ESPN live", espn_results()), ("ESPN history", espn_hist)]:
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
    sp = read_csv("expert_consensus.csv")   # SplitPicks shows each bout's line: a last resort
    sp = sp.rename(columns={"sp_odds_a": "odds_a", "sp_odds_b": "odds_b"})[["date", "a", "b", "odds_a", "odds_b"]] \
        if not sp.empty else sp
    eo = read_csv("espn_odds_history.csv")   # every book's opening and closing line, from ESPN's core API
    if not eo.empty:
        # median across books in probability space: a plain median of American odds breaks
        # across even money (the median of -110 and +110 is 0)
        from common import implied, to_american
        for c in ["open_a", "open_b", "close_a", "close_b"]:
            eo[c] = implied(pd.to_numeric(eo[c], errors="coerce"))
        eo = eo.groupby(["date", "a", "b"], as_index=False)[["open_a", "open_b", "close_a", "close_b"]].median()
        for c in ["open_a", "open_b", "close_a", "close_b"]:
            eo[c] = [to_american(x) if x == x else np.nan for x in eo[c]]
        eo = eo.rename(columns={"close_a": "odds_a", "close_b": "odds_b"})
    fights = one_spelling(fights)
    fights = clean_lines(fights)
    fights = attach_lines(fights, [eo, espn_hist, sp])
    fights = fill_logged_odds(fights)
    fights = clean_lines(fights)
    fights = fights.sort_values(["date", "fight_id"]).reset_index(drop=True)
    fights[COLUMNS].to_csv(path("fights.csv"), index=False)
    print(f"fights.csv: {len(fights)} fights, {fights.date.min()} to {fights.date.max()}")
    return fights


if __name__ == "__main__":
    build(offline="--offline" in sys.argv)

"""Steps 4-5: one row of pre-fight features per fight.

Every value is computed from fights BEFORE this one (the no-peeking rule).
Upcoming bouts (no winner yet) get features too but never update anyone's history.
"""
import math
import numpy as np
import pandas as pd
from ratings import pre_fight_ratings

WEIGHTS = ["Strawweight", "Flyweight", "Bantamweight", "Featherweight", "Lightweight",
           "Welterweight", "Middleweight", "Light Heavyweight", "Heavyweight"]
HIGH_ALTITUDE = ["Mexico City", "Salt Lake City", "Denver", "Bogota"]


def wc_rank(wc):
    wc = str(wc).replace("Women's ", "")
    for i, w in enumerate(WEIGHTS):
        if wc == w:
            return i
    return np.nan   # catch weight, open weight


class History:
    """Running record for one fighter, updated after each of their fights."""
    def __init__(self):
        self.n = self.wins = self.ko_w = self.sub_w = self.ko_l = self.sub_l = self.dec = 0
        self.secs = 0.0
        self.streak = 0
        self.last = None
        self.wc = np.nan
        self.recent = []   # 1/0 results, last 3
        # fight-stat totals (only for fights with UFCStats stats scraped)
        self.st_mins = self.sig_l = self.sig_a = self.td_l = self.td_att = 0.0
        self.td_allowed = self.td_faced = self.ctrl = self.kd = 0.0

    def add_stats(self, st):
        mins = st["fight_secs"] / 60 if st["fight_secs"] == st["fight_secs"] else 0
        if mins <= 0:
            return
        self.st_mins += mins
        self.sig_l += st["sig_landed"]
        self.sig_a += st["sig_absorbed"]
        self.td_l += st["td_landed"]
        self.td_att += st["td_att"]
        self.td_allowed += st["td_allowed"]
        self.td_faced += st["td_faced"]
        self.ctrl += st["ctrl_secs"] / 60
        self.kd += st["kd"]

    def style(self):
        """Per-minute rates, shrunk toward the league average while minutes are few."""
        if self.st_mins < 5:
            return None
        k = 15   # minutes of 'average fighter' blended in
        m = self.st_mins + k
        return {"slpm": (self.sig_l + 4.0 * k) / m, "sapm": (self.sig_a + 4.0 * k) / m,
                "td15": 15 * (self.td_l + 0.08 * k) / m,
                "td_def": (self.td_faced - self.td_allowed + 3) / (self.td_faced + 5),
                "ctrl_share": (self.ctrl + 0.2 * k) / m, "kd15": 15 * (self.kd + 0.01 * k) / m}

    def add(self, won, method, secs, date, wc):
        self.n += 1
        self.wins += won
        if method == "KO":
            self.ko_w += won
            self.ko_l += 1 - won
        elif method == "SUB":
            self.sub_w += won
            self.sub_l += 1 - won
        elif method == "DEC":
            self.dec += 1
        self.secs += secs if secs == secs else 0
        self.streak = (max(self.streak, 0) + 1) if won else (min(self.streak, 0) - 1)
        self.recent = (self.recent + [won])[-3:]
        self.last, self.wc = date, wc


def side(h, date, wc):
    """Features describing one fighter before this fight."""
    layoff = (date - h.last).days if h.last is not None else np.nan
    return {
        "ufc_fights": h.n, "debut": int(h.n == 0),
        "win_rate": (h.wins + 1) / (h.n + 2),            # shrunk toward 50% for small samples
        "ko_rate": (h.ko_w + 0.5) / (h.n + 2),
        "sub_rate": (h.sub_w + 0.5) / (h.n + 2),
        "ko_loss_rate": (h.ko_l + 0.3) / (h.n + 2),       # durability
        "dec_rate": (h.dec + 1) / (h.n + 2),
        "avg_mins": h.secs / 60 / h.n if h.n else 10.0,
        "streak": h.streak, "recent3": np.mean(h.recent) if h.recent else 0.5,
        "layoff": min(layoff, 1500) if layoff == layoff else 365,
        "long_layoff": int(layoff == layoff and layoff > 450),
        "wc_change": (wc_rank(wc) - h.wc) if h.wc == h.wc and wc_rank(wc) == wc_rank(wc) else 0,
    }


def fill_attributes(df):
    """Fill missing height/reach/stance/age from the fighter's most recent known values."""
    df = df.copy()
    long = pd.concat([
        df[["date", "a", "height_a", "reach_a", "stance_a", "age_a"]].set_axis(
            ["date", "name", "height", "reach", "stance", "age"], axis=1),
        df[["date", "b", "height_b", "reach_b", "stance_b", "age_b"]].set_axis(
            ["date", "name", "height", "reach", "stance", "age"], axis=1)])
    long = long.dropna(subset=["height"]).sort_values("date")
    last = long.groupby("name").last()
    for s in "ab":
        n = df[s]
        for col in ["height", "reach", "stance"]:
            df[f"{col}_{s}"] = df[f"{col}_{s}"].fillna(n.map(last[col]))
        years = (pd.to_datetime(df["date"]) - pd.to_datetime(n.map(last["date"]))).dt.days / 365.25
        df[f"age_{s}"] = df[f"age_{s}"].fillna(n.map(last["age"]) + years.round())
    return df


def load_stats():
    """Per-fighter fight totals from your UFCStats scrape, keyed by (date, fighter)."""
    import os
    from common import path
    f = path("fight_stats.csv")
    if not os.path.exists(f):
        return {}
    st = pd.read_csv(f)
    return {(r["date"], r["fighter"]): r for r in st.to_dict("records")}


def build(fights, upcoming=None, glicko=None):
    """fights: history (winner known). upcoming: optional bouts to predict (winner blank)."""
    df = fights.copy()
    if upcoming is not None and len(upcoming):
        up = upcoming.copy()
        up["winner"] = None
        up["fight_id"] = up["date"].astype(str) + "|" + up["a"] + "|" + up["b"]
        df = pd.concat([df, up], ignore_index=True)
    df = df.sort_values("date", kind="stable").reset_index(drop=True)
    df = fill_attributes(df)
    ratings, G = pre_fight_ratings(df, **(glicko or {}))
    df = df.merge(ratings, on="fight_id", how="left")

    stats = load_stats()
    H = {}
    rows = []
    for f in df.itertuples():
        d = pd.Timestamp(f.date)
        ha, hb = H.setdefault(f.a, History()), H.setdefault(f.b, History())
        sa, sb = side(ha, d, f.weight_class), side(hb, d, f.weight_class)
        loc = str(f.location)
        p = min(max(f.p_glicko, 1e-4), 1 - 1e-4)
        row = {
            "fight_id": f.fight_id,
            # CORE: ratings and physical matchup
            "glicko_logit": math.log(p / (1 - p)),
            "rating_diff": f.rating_a - f.rating_b, "rd_a": f.rd_a, "rd_b": f.rd_b,
            "age_diff": f.age_a - f.age_b, "reach_diff": f.reach_a - f.reach_b,
            "height_diff": f.height_a - f.height_b,
            "age_a": f.age_a, "age_b": f.age_b,
            "exp_diff": math.log1p(sa["ufc_fights"]) - math.log1p(sb["ufc_fights"]),
            "debut_a": sa["debut"], "debut_b": sb["debut"],
            # FORM: record-based
            "win_rate_diff": sa["win_rate"] - sb["win_rate"],
            "streak_diff": sa["streak"] - sb["streak"],
            "recent3_diff": sa["recent3"] - sb["recent3"],
            "ko_rate_diff": sa["ko_rate"] - sb["ko_rate"],
            "sub_rate_diff": sa["sub_rate"] - sb["sub_rate"],
            "durability_diff": sb["ko_loss_rate"] - sa["ko_loss_rate"],
            "dec_rate_sum": sa["dec_rate"] + sb["dec_rate"],
            "avg_mins_sum": sa["avg_mins"] + sb["avg_mins"],
            # CONTEXT: fight-specific situations
            "layoff_a": sa["layoff"], "layoff_b": sb["layoff"],
            "long_layoff_a": sa["long_layoff"], "long_layoff_b": sb["long_layoff"],
            "wc_change_a": sa["wc_change"], "wc_change_b": sb["wc_change"],
            "five_rounds": int(f.rounds == 5), "title": int(bool(f.title)),
            "women": int(str(f.gender).upper().startswith("F")),
            "heavyweight": int(str(f.weight_class) in ("Heavyweight", "Light Heavyweight")),
            "altitude": int(any(c in loc for c in HIGH_ALTITUDE)),
            "stance_mismatch": int(str(f.stance_a) != str(f.stance_b)),
            "southpaw_a": int(str(f.stance_a) == "Southpaw"),
            "southpaw_b": int(str(f.stance_b) == "Southpaw"),
        }
        # STYLE: per-minute rates from earlier scraped fight stats (blank until you backfill)
        ya, yb = ha.style(), hb.style()
        for k in ["slpm", "sapm", "td15", "td_def", "ctrl_share", "kd15"]:
            row[f"{k}_diff"] = (ya[k] - yb[k]) if (ya and yb) else np.nan
        rows.append(row)
        # update histories only for completed fights
        if f.winner in ("a", "b", "draw"):
            won_a = 1 if f.winner == "a" else 0
            won_b = 1 if f.winner == "b" else 0
            ha.add(won_a, f.method, f.fight_secs, d, wc_rank(f.weight_class))
            hb.add(won_b, f.method, f.fight_secs, d, wc_rank(f.weight_class))
            for h, name in ((ha, f.a), (hb, f.b)):
                if (f.date, name) in stats:
                    h.add_stats(stats[(f.date, name)])
    feats = pd.DataFrame(rows)
    keep = ["fight_id", "date", "a", "b", "winner", "method", "end_round", "rounds", "weight_class",
            "location", "odds_a", "odds_b", "rating_a", "rating_b", "p_glicko",
            "dec_odds_a", "dec_odds_b", "ko_odds_a", "ko_odds_b", "sub_odds_a", "sub_odds_b"]
    keep = [c for c in keep if c in df.columns]
    return df[keep].merge(feats, on="fight_id"), G


CORE = ["glicko_logit", "rd_a", "rd_b", "age_diff", "reach_diff", "height_diff",
        "age_a", "age_b", "exp_diff", "debut_a", "debut_b"]
FORM = ["win_rate_diff", "streak_diff", "recent3_diff", "ko_rate_diff", "sub_rate_diff",
        "durability_diff", "dec_rate_sum", "avg_mins_sum"]
CONTEXT = ["layoff_a", "layoff_b", "long_layoff_a", "long_layoff_b", "wc_change_a", "wc_change_b",
           "five_rounds", "title", "women", "heavyweight", "altitude", "stance_mismatch",
           "southpaw_a", "southpaw_b"]
# needs data/fight_stats.csv: run  python src/scrape_ufcstats.py --backfill  once
STYLE = ["slpm_diff", "sapm_diff", "td15_diff", "td_def_diff", "ctrl_share_diff", "kd15_diff"]

# columns that change meaning when A and B swap sides
SWAP = [("rd_a", "rd_b"), ("age_a", "age_b"), ("debut_a", "debut_b"), ("layoff_a", "layoff_b"),
        ("long_layoff_a", "long_layoff_b"), ("wc_change_a", "wc_change_b"),
        ("southpaw_a", "southpaw_b"), ("odds_a", "odds_b"), ("rating_a", "rating_b"),
        ("dec_odds_a", "dec_odds_b"), ("ko_odds_a", "ko_odds_b"), ("sub_odds_a", "sub_odds_b"),
        ("a", "b")]
NEGATE = ["glicko_logit", "age_diff", "reach_diff", "height_diff", "exp_diff", "win_rate_diff",
          "streak_diff", "recent3_diff", "ko_rate_diff", "sub_rate_diff", "durability_diff",
          "rating_diff"] + STYLE


def flip(t):
    """The same fights seen from the other corner. Training on both sides keeps the
    model symmetric: it can't learn anything from who happens to be listed first."""
    f = t.copy()
    for x, y in SWAP:
        if x in f and y in f:
            f[x], f[y] = t[y], t[x]
    for c in NEGATE:
        if c in f:
            f[c] = -t[c]
    if "p_glicko" in f:
        f["p_glicko"] = 1 - t["p_glicko"]
    if "winner" in f:
        f["winner"] = t["winner"].map({"a": "b", "b": "a"}).fillna(t["winner"])
    return f


if __name__ == "__main__":
    from common import path
    t, _ = build(pd.read_csv(path("fights.csv")))
    t.to_csv(path("features.csv"), index=False)
    print(t.shape)
    print(t[CORE + FORM + CONTEXT + STYLE].describe().T[["mean", "min", "max"]].round(2))

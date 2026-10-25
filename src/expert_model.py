"""Which prediction is best: the line, our model, the experts, or a combination?

Tested walk-forward, card by card, on every bout SplitPicks covers: each card is predicted
using only earlier cards. Analysts only count once they're "winning": a positive return
betting their picks on earlier cards (at least MIN_PICKS of them), so no analyst is chosen
with hindsight.

Writes:
  data/expert_walkforward.csv  every bout with each candidate's chance
  data/final_stack.json        the winning combination's weights, used by predict.py
  docs/data/model_test.json    the comparison table for the site

Run:  python src/expert_model.py
"""
import json, os
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from common import path, SITE, no_vig, payout
from config import EDGE
from get_odds import norm

MIN_PICKS = 20      # an analyst needs this many graded picks before they can qualify
FIRST_CARDS = 6     # cards used to learn the first combination weights
lg = lambda p: np.log(np.clip(p, .02, .98) / (1 - np.clip(p, .02, .98)))


def winning_analysts(picks, before):
    """Analysts with a positive return on cards before `before` (and enough picks)."""
    p = picks[picks["date"] < before]
    if p.empty:
        return set()
    g = p.groupby("analyst").agg(n=("units", "size"), units=("units", "sum"))
    return set(g[(g["n"] >= MIN_PICKS) & (g["units"] > 0)].index)


def table():
    c = pd.read_csv(path("expert_consensus.csv"))
    picks = pd.read_csv(path("expert_picks.csv")).drop(columns=["winner", "sp_odds_a", "sp_odds_b"], errors="ignore")
    c = c[c["winner"].isin(["a", "b"]) & c["sp_odds_a"].notna() & c["sp_odds_b"].notna()].copy()
    c["fair"] = no_vig(c["sp_odds_a"], c["sp_odds_b"])
    c = c[c["fair"].notna()]
    c["y"] = (c["winner"] == "a").astype(int)
    # grade every analyst pick, for the running "winning analysts" list
    picks = picks.merge(c[["slug", "bout", "y", "sp_odds_a", "sp_odds_b"]], on=["slug", "bout"])
    picks["on_a"] = picks["pick"] == picks["a"]
    picks["won"] = picks["on_a"] == (picks["y"] == 1)
    odds = np.where(picks["on_a"], picks["sp_odds_a"], picks["sp_odds_b"])
    picks["units"] = np.where(picks["won"], payout(odds), -1.0)
    # the model's walk-forward chances
    m = pd.read_csv(path("model_history.csv"))
    mh = {}
    for r in m.itertuples():
        for d in pd.date_range(pd.Timestamp(r.date) - pd.Timedelta(days=1), periods=3).strftime("%Y-%m-%d"):
            mh[(d, frozenset((norm(r.a), norm(r.b))))] = r
    rows = []
    for date in sorted(c["date"].unique()):
        good = winning_analysts(picks, date)
        day = picks[picks["date"] == date]
        for r in c[c["date"] == date].itertuples():
            x = mh.get((date, frozenset((norm(r.a), norm(r.b)))))
            if x is None:
                continue
            flip = norm(x.a) != norm(r.a)
            pm = 1 - x.p if flip else x.p
            pb = (1 - x.p_blend if flip else x.p_blend) if x.p_blend == x.p_blend else np.nan
            bp = day[day["bout"] == r.bout]
            w = bp[bp["analyst"].isin(good)]
            rows.append({"date": date, "slug": r.slug, "a": r.a, "b": r.b, "y": r.y, "odds_a": r.sp_odds_a,
                         "odds_b": r.sp_odds_b, "line": r.fair, "model": pm, "blend": pb,
                         "experts_all": (r.picks_a + 0.5) / (r.picks_a + r.picks_b + 1),
                         "experts_winning": (w["on_a"].sum() + 0.5) / (len(w) + 1),
                         "n_winning": len(w), "winning_analysts": len(good)})
    return pd.DataFrame(rows), picks


COMBOS = {   # name: inputs to a logistic combination (log-odds of each)
    "Line + model": ["line", "model"],
    "Line + winning experts": ["line", "experts_winning"],
    "Line + model + winning experts": ["line", "model", "experts_winning"],
    "Line + model + all experts": ["line", "model", "experts_all"],
}


def walk(t):
    t = t.sort_values("date").copy()
    dates = sorted(t["date"].unique())
    for name, cols in COMBOS.items():
        t[name] = np.nan
        for i, d in enumerate(dates[FIRST_CARDS:], FIRST_CARDS):
            tr, te = t["date"] < d, t["date"] == d
            X = lambda s: np.column_stack([lg(s[c].values) for c in cols])
            mdl = LogisticRegression(C=1.0).fit(X(t[tr]), t.loc[tr, "y"])
            t.loc[te, name] = mdl.predict_proba(X(t[te]))[:, 1]
    return t[t["date"] >= dates[FIRST_CARDS]]


def grade(t, col):
    p, y = t[col].values, t["y"].values
    pick_a = p > 0.5
    odds = np.where(pick_a, t["odds_a"], t["odds_b"])
    won = pick_a == (y == 1)
    units = np.where(won, payout(odds), -1.0)
    edge = p - t["line"].values
    val = np.abs(edge) > EDGE
    v_a = edge > 0
    v_won = v_a == (y == 1)
    v_units = np.where(v_won, payout(np.where(v_a, t["odds_a"], t["odds_b"])), -1.0)
    return {"prediction": col, "bouts": int(len(t)), "correct": int(won.sum()), "pct": round(100 * won.mean(), 1),
            "units": round(float(units.sum()), 1), "log_loss": round(log_loss(y, np.clip(p, .02, .98)), 4),
            "value_bets": int(val.sum()) if col != "line" else 0, "value_won": int(v_won[val].sum()) if col != "line" else 0,
            "value_units": round(float(v_units[val].sum()), 1) if col != "line" else 0.0}


def main():
    t, picks = table()
    if len(t) < 100:
        print("not enough expert bouts yet")
        return
    w = walk(t).dropna(subset=list(COMBOS) + ["blend"])
    names = {"line": "Betting line", "model": "Our model alone", "blend": "Our model + line (current site)",
             "experts_all": "All experts' consensus", "experts_winning": "Winning experts' consensus"}
    res = [grade(w, c) | {"prediction": names.get(c, c)} for c in ["line", "model", "blend", "experts_all", "experts_winning"] + list(COMBOS)]
    res = pd.DataFrame(res)
    print(f"{len(w)} bouts on {w['date'].nunique()} cards, {w['date'].min()} to {w['date'].max()}")
    print(res.to_string(index=False))
    w.to_csv(path("expert_walkforward.csv"), index=False)

    # choose by log loss among combinations that can be applied live (all need the line)
    combo = res[res["prediction"].isin(COMBOS)].sort_values("log_loss").iloc[0]
    base = res[res["prediction"] == "Our model + line (current site)"].iloc[0]
    use = combo["log_loss"] < base["log_loss"]
    cols = COMBOS[combo["prediction"]]
    full = LogisticRegression(C=1.0).fit(np.column_stack([lg(t[c].values) for c in cols]), t["y"])
    json.dump({"use": bool(use), "name": combo["prediction"], "inputs": cols,
               "coef": [round(float(x), 4) for x in full.coef_[0]], "intercept": round(float(full.intercept_[0]), 4),
               "min_picks": MIN_PICKS, "trained_on_bouts": int(len(t))},
              open(path("final_stack.json"), "w"), indent=1)
    # the analysts who currently qualify
    g = picks.groupby("analyst").agg(n=("units", "size"), units=("units", "sum"), won=("won", "sum")).reset_index()
    g["winning"] = (g["n"] >= MIN_PICKS) & (g["units"] > 0)
    os.makedirs(os.path.join(SITE, "data"), exist_ok=True)
    json.dump({"bouts": int(len(w)), "cards": int(w["date"].nunique()), "first": str(w["date"].min()), "last": str(w["date"].max()),
               "results": json.loads(res.to_json(orient="records")), "chosen": combo["prediction"] if use else "Our model + line (current site)",
               "uses_experts": bool(use and "experts" in " ".join(cols)),
               "winning_analysts": sorted(g.loc[g["winning"], "analyst"].tolist()),
               "dropped_analysts": sorted(g.loc[~g["winning"], "analyst"].tolist())},
              open(os.path.join(SITE, "data", "model_test.json"), "w"), indent=1)
    # consensus of the analysts who currently have a winning record, for every bout (upcoming too)
    allp = pd.read_csv(path("expert_picks.csv"))
    win_set = set(g.loc[g["winning"], "analyst"])
    wp = allp[allp["analyst"].isin(win_set)].copy()
    wp["on_a"] = (wp["pick"] == wp["a"]).astype(int)
    wc = wp.groupby(["slug", "date", "bout", "a", "b"], as_index=False).agg(win_a=("on_a", "sum"), win_n=("on_a", "size"))
    wc["win_b"] = wc["win_n"] - wc["win_a"]
    wc.drop(columns="win_n").to_csv(path("expert_consensus_winning.csv"), index=False)
    print("chosen:", combo["prediction"] if use else "keep current", "| winning analysts:", ", ".join(sorted(g.loc[g["winning"], "analyst"])))


if __name__ == "__main__":
    main()

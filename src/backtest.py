"""Step 7: walk-forward backtest.

Stage 1 - the model alone: for each test year, train only on earlier fights,
predict that year, and compare with the betting line on the same fights.
Stage 2 - the market blend: for each year, fit the blend on earlier years'
walk-forward predictions only, then bet that year where blend and line disagree.

Saves data/model_config.json (best feature group and learner) and
data/market_blend.json, which predict.py uses.

Run:  python src/backtest.py
"""
import json, datetime as dt
import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss
from common import path, no_vig, payout
from features import build, STYLE
from model import GROUPS, WinModel, MarketBlend

from config import BACKTEST_YEARS as TEST_YEARS, TRAIN_FROM, BLEND_FROM_YEAR as BLEND_FROM
EDGES = [0.0, 0.01, 0.02, 0.03, 0.04, 0.05]


def walk_forward(t, features, kind):
    out = []
    for yr in TEST_YEARS:
        train = t[(t["date"] >= TRAIN_FROM) & (t["date"] < f"{yr}-01-01")]
        test = t[t["date"].str.startswith(str(yr)) & t["winner"].isin(["a", "b"])].copy()
        if test.empty:
            continue
        test["p"] = WinModel(features, kind).fit(train).predict(test)
        out.append(test)
    return pd.concat(out)


def score(p, y):
    return {"log_loss": log_loss(y, p, labels=[0, 1]), "brier": brier_score_loss(y, p),
            "accuracy": np.mean((np.asarray(p) > 0.5) == y)}


def bets(r, edge, col="p"):
    """Flat 1-unit bets wherever `col` beats the no-vig line by more than `edge`."""
    r = r.dropna(subset=["odds_a", "odds_b"])
    fair = no_vig(r["odds_a"], r["odds_b"])
    y = (r["winner"] == "a").values
    pick_a = (r[col] - fair > edge).values
    pick_b = ((fair - r[col]) > edge).values
    mask = pick_a | pick_b
    if not mask.any():
        return {"bets": 0, "win_%": np.nan, "units": 0.0, "roi_%": np.nan}
    won = np.where(pick_a, y, ~y)[mask]
    odds = np.where(pick_a, r["odds_a"], r["odds_b"])[mask]
    profit = np.where(won, payout(odds), -1.0)
    return {"bets": int(mask.sum()), "win_%": 100 * won.mean(), "units": profit.sum(),
            "roi_%": 100 * profit.mean()}


def market_blend_walk(r):
    r = r.dropna(subset=["odds_a", "odds_b"]).copy()
    r["fair"] = no_vig(r["odds_a"], r["odds_b"])
    y = (r["winner"] == "a").astype(int)
    out = []
    for yr in range(BLEND_FROM, TEST_YEARS.stop):
        tr, te = r["date"] < str(yr), r["date"].str.startswith(str(yr))
        if te.sum() == 0:
            continue
        b = MarketBlend().fit(r.loc[tr, "fair"], r.loc[tr, "p"], y[tr])
        d = r[te].copy()
        d["p_blend"] = b.predict(d["fair"], d["p"])
        out.append(d)
    return pd.concat(out)


def main():
    t, _ = build(pd.read_csv(path("fights.csv")))
    has_style = t[STYLE].notna().mean().min() > 0.5
    groups = [g for g in GROUPS if g != "all" or has_style]
    configs = [(g, "logistic") for g in groups] + [(groups[-1], "boost"), (groups[-1], "blend")]

    rows, keep = [], {}
    for g, kind in configs:
        r = walk_forward(t, GROUPS[g], kind)
        o = r.dropna(subset=["odds_a", "odds_b"])
        rows.append({"features": g, "learner": kind,
                     **score(o["p"].values, (o["winner"] == "a").astype(int).values)})
        keep[(g, kind)] = r
    o = next(iter(keep.values())).dropna(subset=["odds_a", "odds_b"])
    rows.insert(0, {"features": "betting line (no-vig)", "learner": "market",
                    **score(no_vig(o["odds_a"], o["odds_b"]), (o["winner"] == "a").astype(int).values)})
    res = pd.DataFrame(rows)
    print(f"STAGE 1: model alone. Test years {TEST_YEARS.start}-{TEST_YEARS.stop - 1}, "
          f"{len(o)} fights with odds. Lower log loss and Brier are better.")
    print(res.round(4).to_string(index=False))

    best = min(keep, key=lambda k: res.set_index(["features", "learner"]).loc[k, "log_loss"])
    r = keep[best]
    r.to_csv(path("backtest_predictions.csv"), index=False)
    json.dump({"features": best[0], "learner": best[1]}, open(path("model_config.json"), "w"))
    print("\nBest model:", best)

    s = market_blend_walk(r)
    y = (s["winner"] == "a").astype(int).values
    print(f"\nSTAGE 2: market blend, test years {BLEND_FROM}-{TEST_YEARS.stop - 1}, {len(s)} fights")
    print(pd.DataFrame([{"probability": "betting line", **score(s["fair"].values, y)},
                        {"probability": "model alone", **score(s["p"].values, y)},
                        {"probability": "line + model blend", **score(s["p_blend"].values, y)}])
          .round(4).to_string(index=False))
    print("\nFlat 1-unit bets where the blend beats the line by more than the edge:")
    roi = pd.DataFrame([{"edge": e, **bets(s, e, "p_blend")} for e in EDGES])
    print(roi.round(2).to_string(index=False))
    print("\nBy year at a 3% edge:")
    print(pd.DataFrame([{"year": yr, **bets(d, 0.03, "p_blend")}
                        for yr, d in s.groupby(s["date"].str[:4])]).round(2).to_string(index=False))

    rr = r.dropna(subset=["odds_a", "odds_b"])
    final = MarketBlend().fit(no_vig(rr["odds_a"], rr["odds_b"]), rr["p"], (rr["winner"] == "a").astype(int))
    json.dump(final.weights() | {"intercept": float(final.m.intercept_[0])},
              open(path("market_blend.json"), "w"))
    s.to_csv(path("backtest_blend.csv"), index=False)
    byyear = [{"year": yr, **bets(d, 0.03, "p_blend")} for yr, d in s.groupby(s["date"].str[:4])]
    clean = lambda df: json.loads(df.round(4).to_json(orient="records"))
    json.dump({"run_at": dt.datetime.now().strftime("%Y-%m-%d"), "best": {"features": best[0], "learner": best[1]},
               "stage1": clean(res), "stage2": clean(pd.DataFrame([
                   {"probability": "Betting line", **score(s["fair"].values, y)},
                   {"probability": "Model alone", **score(s["p"].values, y)},
                   {"probability": "Line + model blend", **score(s["p_blend"].values, y)}])),
               "roi": clean(roi), "by_year": clean(pd.DataFrame(byyear)),
               "years": f"{BLEND_FROM}-{TEST_YEARS.stop - 1}", "fights": int(len(s))},
              open(path("backtest_summary.json"), "w"), indent=1)

    res.insert(0, "run_at", dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
    log = path("backtest_log.csv")
    res.to_csv(log, mode="a", header=not pd.io.common.file_exists(log), index=False)
    return res, roi


if __name__ == "__main__":
    main()

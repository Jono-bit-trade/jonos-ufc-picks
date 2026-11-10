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
from model import GROUPS, WinModel, MarketBlend, situations

from config import BACKTEST_YEARS as TEST_YEARS, TRAIN_FROM, BLEND_FROM_YEAR as BLEND_FROM, PINNED_FEATURES
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
        b = MarketBlend().fit(r.loc[tr, "fair"], r.loc[tr, "p"], y[tr], situations(r[tr]))
        d = r[te].copy()
        d["p_blend"] = b.predict(d["fair"], d["p"], situations(d))
        out.append(d)
    return pd.concat(out)


def espn_lines():
    """Opening and closing lines per fight from ESPN (the same books at both ends, averaged), keyed
    date|a|b. The opening lines in fights.csv mix sources, which shows movement that never happened."""
    from get_odds import norm as wnorm
    try:
        from common import pregame_books
        h = pregame_books(pd.read_csv(path("espn_odds_history.csv"))).dropna(subset=["open_a", "open_b", "close_a", "close_b"])
    except Exception:
        return {}
    ok = lambda x, y: (x.abs() >= 100) & (y.abs() >= 100) & ((x < 0) | (y < 0))
    h = h[ok(h["open_a"], h["open_b"]) & ok(h["close_a"], h["close_b"])].copy()
    h["fo"], h["fc"] = no_vig(h["open_a"], h["open_b"]), no_vig(h["close_a"], h["close_b"])
    h["k"] = [f"{d}|{wnorm(a)}|{wnorm(b)}" for d, a, b in zip(h["date"], h["a"], h["b"])]
    g = h.groupby("k").agg(fo=("fo", "mean"), fc=("fc", "mean"), oa=("open_a", "median"), ob=("open_b", "median"))
    return g.to_dict("index")


def early_line(r):
    """The model's picks made at the OPENING line (ESPN, 2023 on), bets placed at opening odds,
    and how often the line then moved toward the model's side (closing line value).
    The blend is fitted on earlier fights only and applied to the opening line."""
    from get_odds import norm as wnorm
    lines = espn_lines()
    r = r.dropna(subset=["odds_a", "odds_b"]).copy()
    r["fair"] = no_vig(r["odds_a"], r["odds_b"])
    y = (r["winner"] == "a").astype(int)
    rows = []
    for i, x in zip(r.index, r.itertuples()):
        g = lines.get(f"{x.date}|{wnorm(x.a)}|{wnorm(x.b)}")
        if g is not None:
            rows.append((i, g["fo"], g["fc"], g["oa"], g["ob"]))
            continue
        g = lines.get(f"{x.date}|{wnorm(x.b)}|{wnorm(x.a)}")
        if g is not None:
            rows.append((i, 1 - g["fo"], 1 - g["fc"], g["ob"], g["oa"]))
    if len(rows) < 300:
        return None, None
    e = pd.DataFrame(rows, columns=["i", "fair_open", "fair_close", "eo_a", "eo_b"]).set_index("i")
    e = r.join(e, how="inner")
    out = []
    for yr in sorted(e["date"].str[:4].unique()):
        tr = r["date"] < yr
        if tr.sum() < 1000:
            continue
        b = MarketBlend().fit(r.loc[tr, "fair"], r.loc[tr, "p"], y[tr])
        d = e[e["date"].str.startswith(yr)].copy()
        d["p_open_blend"] = b.predict(d["fair_open"], d["p"])
        out.append(d)
    s = pd.concat(out)
    s = s[s["date"] >= "2023"]   # ESPN's book-by-book opening lines are nearly complete from 2023 on
    moved = s["fair_close"] - s["fair_open"]
    rows, summary = [], None
    for ed in EDGES:
        side_a = s["p_open_blend"] - s["fair_open"] > ed
        side_b = s["fair_open"] - s["p_open_blend"] > ed
        picked = side_a | side_b
        toward = ((side_a & (moved > 0.005)) | (side_b & (moved < -0.005)))[picked]
        away = ((side_a & (moved < -0.005)) | (side_b & (moved > 0.005)))[picked]
        at_open = bets(s.assign(odds_a=s["eo_a"], odds_b=s["eo_b"], p=s["p_open_blend"], fair=s["fair_open"]), ed)
        at_close = bets(s.assign(p=s["p_open_blend"] + s["fair_close"] - s["fair_open"], fair=s["fair_close"]), ed)   # same picks graded at the close
        pct = 100 * toward.sum() / max(toward.sum() + away.sum(), 1)
        rows.append({"edge": ed, **{k + "_open": v for k, v in at_open.items()},
                     "roi_close_%": at_close["roi_%"], "moved_toward_%": pct})
    # the summary on the site: our picks' own rule (3+ points over the opening line, on the favorite at the
    # opening price), each graded at the opening price and at the closing price, so it lines up with the record
    side_a = (s["p_open_blend"] - s["fair_open"] > 0.03) & (s["eo_a"] < 0)
    side_b = (s["fair_open"] - s["p_open_blend"] > 0.03) & (s["eo_b"] < 0)
    picked = side_a | side_b
    won = np.where(side_a, s["winner"] == "a", s["winner"] == "b")
    o_open = np.where(side_a, s["eo_a"], s["eo_b"])
    o_close = np.where(side_a, s["odds_a"], s["odds_b"])
    u_open = np.where(won, payout(o_open), -1.0)[picked.values]
    u_close = np.where(won, payout(o_close), -1.0)[picked.values]
    toward = ((side_a & (moved > 0.005)) | (side_b & (moved < -0.005)))[picked]
    away = ((side_a & (moved < -0.005)) | (side_b & (moved > 0.005)))[picked]
    yrs = s["date"].str[:4]
    pct = 100 * toward.sum() / max(toward.sum() + away.sum(), 1)
    summary = {"from": int(yrs.min()), "to": int(yrs.max()), "fights": int(len(s)), "picks": int(picked.sum()),
               "won": int(won[picked.values].sum()), "toward": int(toward.sum()), "away": int(away.sum()),
               "flat": int(picked.sum() - toward.sum() - away.sum()), "pct": round(float(pct), 1),
               "units_open": round(float(np.nansum(u_open)), 1), "units_close": round(float(np.nansum(u_close)), 1),
               "rule": "our picks: 3+ points over the opening line, favorites"}
    t = pd.DataFrame(rows)
    print(f"\nSTAGE 3: early line (ESPN opening lines), {len(s)} fights")
    print(t.round(2).to_string(index=False))
    print(summary)
    s.to_csv(path("backtest_early.csv"), index=False)
    return t, summary


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
    if PINNED_FEATURES and (PINNED_FEATURES, best[1]) in keep:
        best = (PINNED_FEATURES, best[1])   # see config.py: the lowest log loss alone isn't the test that matters
    r = keep[best]
    r.to_csv(path("backtest_predictions.csv"), index=False)
    # small copy kept in the repo: each past fight's walk-forward chance, for the site's past cards
    json.dump({"features": best[0], "learner": best[1]}, open(path("model_config.json"), "w"))
    print("\nBest model:", best)

    s = market_blend_walk(r)
    # small copy kept in the repo: each past fight's walk-forward chances (model alone, and
    # blended with the line where the blend could be tested), for the site's track record
    mh = r[["fight_id", "date", "a", "b", "p"]].merge(s[["fight_id", "p_blend"]], on="fight_id", how="left")
    mh.round(4).to_csv(path("model_history.csv"), index=False)
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
    final = MarketBlend().fit(no_vig(rr["odds_a"], rr["odds_b"]), rr["p"], (rr["winner"] == "a").astype(int), situations(rr))
    json.dump(final.weights() | {"intercept": float(final.m.intercept_[0])},
              open(path("market_blend.json"), "w"))
    s.to_csv(path("backtest_blend.csv"), index=False)
    byyear = [{"year": yr, **bets(d, 0.03, "p_blend")} for yr, d in s.groupby(s["date"].str[:4])]
    early, early_moves = early_line(r)
    clean = lambda df: json.loads(df.round(4).to_json(orient="records"))
    json.dump({"run_at": dt.datetime.now().strftime("%Y-%m-%d"), "best": {"features": best[0], "learner": best[1]},
               "stage1": clean(res), "stage2": clean(pd.DataFrame([
                   {"probability": "Betting line", **score(s["fair"].values, y)},
                   {"probability": "Model alone", **score(s["p"].values, y)},
                   {"probability": "Line + model blend", **score(s["p_blend"].values, y)}])),
               "roi": clean(roi), "by_year": clean(pd.DataFrame(byyear)),
               "years": f"{BLEND_FROM}-{TEST_YEARS.stop - 1}", "fights": int(len(s)),
               "early": clean(early) if early is not None else None, "early_moves": early_moves},
              open(path("backtest_summary.json"), "w"), indent=1)

    res.insert(0, "run_at", dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
    log = path("backtest_log.csv")
    res.to_csv(log, mode="a", header=not pd.io.common.file_exists(log), index=False)
    return res, roi


if __name__ == "__main__":
    main()

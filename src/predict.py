"""Step 8: predict the next card and write the website's data files.

Card, best source first: ESPN live feed (espn.py) -> UFCStats upcoming page
(scrape_ufcstats.py) -> whatever The Odds API lists in the next few days.
Lines: The Odds API median across books, else ESPN's line (get_odds.py).

Once a fight starts, its prediction is frozen: the site keeps showing the last
pre-fight numbers next to the live status and result.

Writes docs/data/predictions.json, results.json, ratings.json and data/pick_log.csv
Run:  python src/predict.py
"""
import json, os, datetime as dt
import numpy as np
import pandas as pd
from common import path, SITE, no_vig, payout, to_american
from config import EDGE, BIG_EDGE, TRAIN_FROM, MARKET_BLEND, FEATURE_GROUPS, LEARNER
from features import build, CORE, FORM, CONTEXT, STYLE
from model import GROUPS, WinModel, MethodModel
from get_odds import attach, lines, norm, snapshot
from ratings import table

OUT = os.path.join(SITE, "data")
os.makedirs(OUT, exist_ok=True)
NOW = dt.datetime.now(dt.timezone.utc)


def read(name):
    f = path(name)
    return pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()


def publish_common(fights, log, G):
    """Record, rankings and backtest pages: published on every run, card or not."""
    res = grade(log, fights)
    res["ours"] = grade(log, fights, "our_pick")
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    rt = table(G, NOW.date().isoformat())
    cutoff = (NOW.date() - dt.timedelta(days=550)).isoformat()
    json.dump({"updated": NOW.strftime("%Y-%m-%dT%H:%MZ"),
               "fighters": rt[rt["last_fight"] >= cutoff].head(50).to_dict("records")},
              open(os.path.join(OUT, "ratings.json"), "w"), indent=1)
    bt = path("backtest_summary.json")
    if os.path.exists(bt):
        json.dump(json.load(open(bt)), open(os.path.join(OUT, "backtest.json"), "w"), indent=1)


def slugify(n):
    from site_data import slug
    return slug(n)


def str_or_none(x):
    if x is None or (isinstance(x, float) and x != x):
        return None
    s = str(x)
    return s[:-2] if s.endswith(".0") and s[:-2].isdigit() else s


_EXPERTS = None


def experts_for(date, a, b):
    """SplitPicks consensus for a bout, oriented to (a, b), or None."""
    global _EXPERTS
    if _EXPERTS is None:
        c = read("expert_consensus.csv")
        _EXPERTS = {}
        for r in c.itertuples():
            for d in pd.date_range(pd.Timestamp(r.date) - pd.Timedelta(days=1), periods=3).strftime("%Y-%m-%d"):
                _EXPERTS[(d, frozenset((norm(r.a), norm(r.b))))] = r
    r = _EXPERTS.get((str(date), frozenset((norm(a), norm(b)))))
    if r is None:
        return None
    on_a = norm(r.a) == norm(a)
    out = {"picks_a": int(r.picks_a if on_a else r.picks_b), "picks_b": int(r.picks_b if on_a else r.picks_a),
           "high_a": int(r.high_a if on_a else r.high_b), "high_b": int(r.high_b if on_a else r.high_a),
           "url": f"https://splitpicks.com/events/{r.slug}.html"}
    from site_data import winning_counts
    out.update(winning_counts(r.slug, r.bout, on_a))
    return out


def load_card(fights):
    """The next card, with names in the history's spelling and the current lines attached."""
    known = {norm(n): n for n in pd.concat([fights["a"], fights["b"]]).unique()}
    yesterday = (NOW - dt.timedelta(days=1)).strftime("%Y-%m-%d")   # keep fight night on the board
    espn, ufcs, odds = read("espn_card.csv"), read("upcoming.csv"), lines()
    if not espn.empty and str(espn["date"].max()) >= yesterday:
        card, source = espn.copy(), "ESPN"
    elif not ufcs.empty and str(ufcs["date"].iloc[0]) >= yesterday:
        card, source = ufcs.copy(), "UFCStats"
    elif not odds.empty:
        soon = pd.to_datetime(odds["commence"], utc=True)
        odds = odds[(soon >= NOW - pd.Timedelta(hours=12)) & (soon <= soon[soon >= NOW - pd.Timedelta(hours=12)].min()
                                                              + pd.Timedelta(days=2))]
        card = pd.DataFrame({"date": pd.to_datetime(odds["commence"], utc=True).dt.tz_convert("America/New_York")
                             .dt.strftime("%Y-%m-%d"), "start": odds["commence"], "a": odds["a"], "b": odds["b"],
                             "event": "", "location": "", "weight_class": "", "gender": "M", "title": False})
        card["rounds"] = 3
        card["bout_order"] = range(len(card), 0, -1)
        source = "The Odds API"
    else:
        raise SystemExit("No upcoming card: run src/espn.py, src/scrape_ufcstats.py or src/get_odds.py first")
    if card.empty:
        raise SystemExit("The next card has no bouts listed yet")
    if "state" not in card:
        card["state"] = "pre"
    for s in "ab":
        card[s] = card[s].map(lambda n: known.get(norm(n), n))
    for col in ["age", "height", "reach", "stance"]:
        for s in "ab":
            if f"{col}_{s}" not in card:
                card[f"{col}_{s}"] = np.nan
    card = attach(card, odds) if not odds.empty else card.assign(odds_a=np.nan, odds_b=np.nan, best_a=np.nan,
                                                                  best_b=np.nan, books=np.nan, odds_source=None,
                                                                  open_a=np.nan, open_b=np.nan,
                                                                  line_history=[[]] * len(card))
    if "bout_order" not in card:
        card["bout_order"] = range(1, len(card) + 1)
    card = card.sort_values("bout_order").reset_index(drop=True)
    card["fight_id"] = card["date"].astype(str) + "|" + card["a"] + "|" + card["b"]
    print(f"card from {source}: {len(card)} bouts")
    return card, source


def blended(p_market, p_model, rows=None):
    """Apply the market blend saved by backtest.py (with its situation terms)."""
    from model import situations
    w = json.load(open(path("market_blend.json")))
    lg = lambda p: np.log(np.clip(p, .01, .99) / (1 - np.clip(p, .01, .99)))
    z = w["intercept"] + w["market"] * lg(np.asarray(p_market, float)) + w["model"] * lg(np.asarray(p_model, float))
    if rows is not None:
        sit = situations(rows)
        for k in sit.columns:
            z = z + w.get(k, 0.0) * sit[k].values
    return 1 / (1 + np.exp(-z))


def model_features():
    f = path("model_config.json")
    if os.path.exists(f):
        cfg = json.load(open(f))
        return GROUPS[cfg["features"]], cfg
    feats = sum((globals()[g] for g in FEATURE_GROUPS), [])
    return feats, {"features": "+".join(g.lower() for g in FEATURE_GROUPS), "learner": LEARNER}


def grade(log, fights, col="pick"):
    """Match logged picks to results; grade at the logged (closing) line and track line movement."""
    empty = {"bets": 0, "wins": 0, "units": 0.0, "roi_pct": None, "moved_toward_pct": None, "recent": []}
    if log.empty or col not in log:
        return empty
    log = log.assign(pick=log[col])
    res = {}
    for f in fights[fights["winner"].isin(["a", "b"])].itertuples():
        w = f.a if f.winner == "a" else f.b
        for d in pd.date_range(pd.Timestamp(f.date) - pd.Timedelta(days=1), periods=3).strftime("%Y-%m-%d"):
            res[(d, frozenset((norm(f.a), norm(f.b))))] = (w, getattr(f, "method", None))
    graded = []
    for p in log[log["pick"].notna()].itertuples():
        r = res.get((p.date, frozenset((norm(p.a), norm(p.b)))))
        if r is None:
            continue
        on_a = norm(p.pick) == norm(p.a)
        odds = p.odds_a if on_a else p.odds_b
        won = norm(r[0]) == norm(p.pick)
        moved = None
        if getattr(p, "open_a", None) == getattr(p, "open_a", None) and getattr(p, "open_a", None) is not None:
            fo, fc = float(no_vig(p.open_a, p.open_b)), float(no_vig(p.odds_a, p.odds_b))
            if abs(fc - fo) > 0.005:
                moved = (fc > fo) == on_a
        graded.append({"date": p.date, "fight": f"{p.a} vs {p.b}", "pick": p.pick, "odds": int(odds),
                       "won": bool(won), "method": r[1] if isinstance(r[1], str) else None,
                       "units": round(float(payout(odds)) if won else -1.0, 2), "moved_toward": moved})
    g = pd.DataFrame(graded)
    if g.empty:
        return empty
    mv = g["moved_toward"].dropna()
    return {"bets": len(g), "wins": int(g["won"].sum()), "units": round(float(g["units"].sum()), 2),
            "roi_pct": round(100 * float(g["units"].mean()), 1),
            "moved_toward_pct": round(100 * float(mv.astype(bool).mean()), 1) if len(mv) else None,
            "recent": g.sort_values("date", ascending=False).head(60).to_dict("records")}


def num(x, nd=3):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if x != x else round(x, nd)


def main():
    fights = pd.read_csv(path("fights.csv"))
    if read("odds_upcoming.csv").empty:
        es = lines()
        if not es.empty:
            snapshot(es)   # no Odds API key: keep ESPN's lines as the line history
    try:
        card, source = load_card(fights)
    except SystemExit as e:   # no card yet: keep the site up with a clear message
        print(e)
        json.dump({"updated": NOW.strftime("%Y-%m-%dT%H:%MZ"), "event": "Next UFC card", "date": NOW.date().isoformat(),
                   "location": "", "card_source": "none", "edge_threshold": EDGE, "big_edge": BIG_EDGE,
                   "message": "The next card isn't listed yet. It appears here as soon as ESPN or UFCStats posts it.",
                   "fights": []}, open(os.path.join(OUT, "predictions.json"), "w"), indent=1)
        from ratings import pre_fight_ratings
        publish_common(fights, read("pick_log.csv"), pre_fight_ratings(fights)[1])
        return
    from get_data import drop_known
    todo = drop_known(card.drop(columns=["line_history"], errors="ignore"), fights)   # not yet in the history
    t, G = build(fights, todo)
    hist = t[t["winner"].isin(["a", "b", "draw", "nc"]) & (t["date"] >= TRAIN_FROM)]
    # each card bout's feature row: new bouts, or finished ones already in the history (features are pre-fight)
    pair = lambda a, b: frozenset((norm(a), norm(b)))
    recent = t[t["date"] >= (pd.Timestamp(card["date"].min()) - pd.Timedelta(days=2)).strftime("%Y-%m-%d")]
    rows = {pair(a, b): i for i, a, b in zip(recent.index, recent["a"], recent["b"])}
    idx = [rows.get(pair(a, b)) for a, b in zip(card["a"], card["b"])]
    up = t.loc[[i for i in idx if i is not None]].copy()
    up.index = [fid for fid, i in zip(card["fight_id"], idx) if i is not None]
    flipped = [norm(x) != norm(a) for x, a in zip(up["a"], card.set_index("fight_id").loc[up.index, "a"])]
    if any(flipped):   # history lists the pair the other way round: view it from the card's red corner
        from features import flip
        fl = pd.Series(flipped, index=up.index)
        up.loc[fl] = flip(up.loc[fl])
    up["winner"] = None
    feats, cfg = model_features()
    up["p_model"] = WinModel(feats, cfg["learner"]).fit(hist).predict(up)
    meth = MethodModel().fit(hist).predict(up)

    card = card.set_index("fight_id")
    for c in ["odds_a", "odds_b", "best_a", "best_b", "open_a", "open_b", "books"]:
        up[c] = card[c].reindex(up.index)
    up["fair_a"] = no_vig(up["odds_a"], up["odds_b"])
    has = up["fair_a"].notna()
    up["p_final"] = up["p_model"]
    if MARKET_BLEND and os.path.exists(path("market_blend.json")) and has.any():
        up.loc[has, "p_final"] = blended(up.loc[has, "fair_a"], up.loc[has, "p_model"], up.loc[has])
    up["edge_a"] = up["p_final"] - up["fair_a"]
    up["pick"] = np.where(up["edge_a"] > EDGE, up["a"], np.where(-up["edge_a"] > EDGE, up["b"], None))
    from picks import our_side
    sides = [our_side(pf, fa, oa, ob) for pf, fa, oa, ob in zip(up["p_final"], up["fair_a"], up["odds_a"], up["odds_b"])]
    up["our_pick"] = [a if s_ == "a" else b if s_ == "b" else None for s_, a, b in zip(sides, up["a"], up["b"])]

    # freeze fights that have started: keep their last pre-fight prediction
    logf = path("pick_log.csv")
    log = read("pick_log.csv")
    started = card["state"].reindex(up.index).isin(["in", "post"])
    if not log.empty:
        lg = log.set_index("fight_id")
        frozen = up.index[started & up.index.isin(lg.index)]
        for c in ["p_model", "p_final", "fair_a", "odds_a", "odds_b", "edge_a", "pick", "our_pick"]:
            if c in lg:
                up.loc[frozen, c] = lg.loc[frozen, c]
    fresh = up[~started].reset_index()
    if len(fresh):
        cols = ["fight_id", "date", "a", "b", "p_model", "p_final", "fair_a", "odds_a", "odds_b",
                "open_a", "open_b", "edge_a", "pick", "our_pick"]
        new = fresh[cols].assign(run=NOW.strftime("%Y-%m-%dT%H:%MZ"))
        log = pd.concat([log, new]) if not log.empty else new
        log = log.drop_duplicates("fight_id", keep="last")
        log.to_csv(logf, index=False)

    out = []
    for fid, f in up.iterrows():
        c = card.loc[fid]
        pick = f["pick"] if isinstance(f["pick"], str) else None
        our_pick = f["our_pick"] if isinstance(f.get("our_pick"), str) else None
        edge = num(f["edge_a"])
        res = None
        if c.get("state") == "post":
            w = c.get("winner")
            res = {"winner": f["a"] if w == "a" else f["b"] if w == "b" else None, "draw": w == "draw",
                   "detail": c.get("status_detail") or "", "pick_won": (pick is not None and w in ("a", "b")
                                                                        and pick == (f["a"] if w == "a" else f["b"]))}
        out.append({
            "a": f["a"], "b": f["b"], "a_slug": slugify(f["a"]), "b_slug": slugify(f["b"]),
            "a_id": str_or_none(c.get("espn_id_a")), "b_id": str_or_none(c.get("espn_id_b")),
            "record_a": str_or_none(c.get("record_a")), "record_b": str_or_none(c.get("record_b")),
            "experts": experts_for(f["date"], f["a"], f["b"]),
            "weight_class": c.get("weight_class") or "",
            "rounds": int(f["rounds"]) if f["rounds"] == f["rounds"] else 3,
            "segment": c.get("card_segment") if isinstance(c.get("card_segment"), str) else "",
            "start": c.get("start") if isinstance(c.get("start"), str) else None,
            "state": c.get("state") or "pre", "status": c.get("status_detail") if isinstance(c.get("status_detail"), str) else "",
            "result": res,
            "rating_a": round(f["rating_a"]), "rating_b": round(f["rating_b"]),
            "debut_a": bool(f["debut_a"]), "debut_b": bool(f["debut_b"]),
            "p_model_a": num(f["p_model"]), "p_a": num(f["p_final"]),
            "fair_odds_a": to_american(f["p_final"]), "fair_odds_b": to_american(1 - f["p_final"]),
            "market_p_a": num(f["fair_a"]), "odds_a": num(f["odds_a"], 0), "odds_b": num(f["odds_b"], 0),
            "best_a": num(f["best_a"], 0), "best_b": num(f["best_b"], 0),
            "open_a": num(f["open_a"], 0), "open_b": num(f["open_b"], 0), "books": num(f["books"], 0),
            "line_history": c.get("line_history") if isinstance(c.get("line_history"), list) else [],
            "edge_a": edge, "pick": pick, "our_pick": our_pick,
            "check_news": edge is not None and abs(edge) >= BIG_EDGE,
            "method": {k: round(float(meth.loc[fid, k]), 3) for k in meth.columns},
        })
    first = card.iloc[0]
    json.dump({"updated": NOW.strftime("%Y-%m-%dT%H:%MZ"), "event": str(first.get("event") or "Next UFC card"),
               "date": str(first["date"]), "location": str(first.get("location") or ""), "card_source": source,
               "edge_threshold": EDGE, "big_edge": BIG_EDGE, "model": cfg, "fights": out},
              open(os.path.join(OUT, "predictions.json"), "w"), indent=1)
    publish_common(fights, log, G)

    print(f"{len(out)} bouts, {sum(1 for f in out if f['pick'])} picks at a {EDGE:.0%} edge")
    for f in out:
        mk = f"line {f['market_p_a']:.0%}" if f["market_p_a"] is not None else "no line"
        print(f"  {f['a']} {f['p_a']:.0%} vs {f['b']}  ({mk})  [{f['state']}]  pick: {f['pick'] or '-'}")


if __name__ == "__main__":
    main()

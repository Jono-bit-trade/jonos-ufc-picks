"""Step 8: predict the next card and write the website's data files.

Card, best source first: ESPN live feed (espn.py) -> whatever The Odds API lists in
the next few days.
Lines: The Odds API average across books, else ESPN's line (get_odds.py).

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
from model import GROUPS, WinModel, MethodModel, MethodByWinner
from get_odds import attach, lines, norm, snapshot
from ratings import table
from picks import tier

OUT = os.path.join(SITE, "data")
os.makedirs(OUT, exist_ok=True)
NOW = dt.datetime.now(dt.timezone.utc)


def read(name):
    f = path(name)
    return pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()


def update_ledger(log, fights):
    """Lock graded live picks into data/ledger.csv: the pick, price and stake logged before the
    fight, and the result. Rows are only ever added, never changed."""
    from config import LEDGER_FROM
    from picks import stake
    f = path("ledger.csv")
    led = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()
    done = set(led["fight_id"]) if not led.empty else set()
    res = {}
    for r in fights[fights["winner"].isin(["a", "b", "draw", "nc"])].itertuples():
        for d in pd.date_range(pd.Timestamp(r.date) - pd.Timedelta(days=1), periods=3).strftime("%Y-%m-%d"):
            res[(d, frozenset((norm(r.a), norm(r.b))))] = (r.a if r.winner == "a" else r.b if r.winner == "b" else None, r.winner)
    new = []
    if not log.empty:
        for p in log[log["date"] >= LEDGER_FROM].itertuples():
            if p.fight_id in done:
                continue
            r = res.get((p.date, frozenset((norm(p.a), norm(p.b)))))
            if r is None:
                continue
            winner, how = r
            lean = p.expert_lean if isinstance(getattr(p, "expert_lean", None), str) else None
            mp = model_pick(p.a, p.b, p.p_final, p.fair_a, lean)   # the model's winner pick, as on the card
            ours = p.our_pick if isinstance(getattr(p, "our_pick", None), str) else None
            vp = p.pick if isinstance(getattr(p, "pick", None), str) else None   # value pick, as on the card
            imp = lambda o: None if o is None or o != o else (100 / (o + 100) if o > 0 else -o / (-o + 100))
            def clv(first, close):   # implied-chance points the price moved against us after we picked (+ = beat the close)
                a_, b_ = imp(first), imp(close)
                return None if a_ is None or b_ is None else round(100 * (b_ - a_), 2)
            row = {"fight_id": p.fight_id, "date": p.date, "a": p.a, "b": p.b, "winner": winner, "result": how,
                   "model_pick": mp, "model_odds": p.odds_a if mp == p.a else p.odds_b, "our_pick": ours,
                   "our_odds": (p.odds_a if ours == p.a else p.odds_b) if ours else None,
                   "expert_lean": lean, "logged_at": p.run, "value_pick": vp,
                   "value_odds": (p.odds_a if vp == p.a else p.odds_b) if vp else None}
            for k in ("model", "our", "value"):
                pk, o = row[f"{k}_pick"], row[f"{k}_odds"]
                if pk is None or how in ("draw", "nc") or o != o or o is None:
                    row[f"{k}_units"] = 0.0 if pk else None      # draws and no contests: stake returned
                    continue
                row[f"{k}_units"] = round(float(payout(o)) if pk == winner else -1.0, 3)
            row["model_rule"] = 2
            row["our_source"] = None if not ours else "model" if ours == vp else "experts"   # model pick or expert lean
            ed = None if row["our_source"] != "model" or p.p_final != p.p_final or p.fair_a != p.fair_a else \
                float(p.p_final - p.fair_a) * (1 if ours == p.a else -1)   # analyst picks keep the full stake
            row["stake"] = stake(row["our_odds"], ed) if ours else None
            row["our_staked_units"] = round(row["stake"] * row["our_units"], 3) if ours else None
            fo = lambda c: getattr(p, c, None) if pd.notna(getattr(p, c, None)) else None
            row["our_first_odds"], row["value_first_odds"] = (fo("our_pick_first_odds") if ours else None), (fo("pick_first_odds") if vp else None)
            row["our_clv"] = clv(row["our_first_odds"], row["our_odds"]) if ours else None
            row["value_clv"] = clv(row["value_first_odds"], row["value_odds"]) if vp else None
            new.append(row)
    # rows locked before value picks were tracked: add the value pick logged before that fight
    if not led.empty and not log.empty and ("value_pick" not in led or led["value_pick"].isna().any()):
        lp = log.drop_duplicates("fight_id", keep="last").set_index("fight_id")
        for c in ("value_pick", "value_odds", "value_units"):
            if c not in led:
                led[c] = None
        for i, r in led[led["value_pick"].isna()].iterrows():
            if r["fight_id"] not in lp.index or not isinstance(lp.at[r["fight_id"], "pick"], str):
                continue
            q = lp.loc[r["fight_id"]]
            vp, o = q["pick"], (q["odds_a"] if q["pick"] == q["a"] else q["odds_b"])
            led.at[i, "value_pick"], led.at[i, "value_odds"] = vp, o
            led.at[i, "value_units"] = 0.0 if r["result"] in ("draw", "nc") else round(float(payout(o)) if vp == r["winner"] else -1.0, 3)
        led.to_csv(f, index=False)
    if not led.empty and ("our_source" not in led or led.loc[led["our_pick"].notna(), "our_source"].isna().any()):
        src_ = np.where(led["our_pick"].isna(), None, np.where(led["our_pick"] == led.get("value_pick"), "model", "experts"))
        led["our_source"] = led["our_source"].fillna(pd.Series(src_, index=led.index)) if "our_source" in led else src_
        led.to_csv(f, index=False)
    # coin-flip rule (Oct 31, 2026): in a 45-55% fight the value pick is the model's winner. Applied
    # once to rows locked before it, from the prediction logged before each fight.
    if not led.empty and not log.empty and ("model_rule" not in led or led["model_rule"].isna().any()):
        lp = log.drop_duplicates("fight_id", keep="last").set_index("fight_id")
        if "model_rule" not in led:
            led["model_rule"] = None
        for i, r in led[led["model_rule"].isna()].iterrows():
            if r["fight_id"] in lp.index:
                q = lp.loc[r["fight_id"]]
                mp = model_pick(q["a"], q["b"], q["p_final"], q["fair_a"], r.get("expert_lean"))
                if mp and mp != r["model_pick"]:
                    o = q["odds_a"] if mp == q["a"] else q["odds_b"]
                    led.at[i, "model_pick"], led.at[i, "model_odds"] = mp, o
                    led.at[i, "model_units"] = 0.0 if r["result"] in ("draw", "nc") else round(float(payout(o)) if mp == r["winner"] else -1.0, 3)
            led.at[i, "model_rule"] = 2
        led.to_csv(f, index=False)
    if new:
        led = pd.concat([led, pd.DataFrame(new)], ignore_index=True) if not led.empty else pd.DataFrame(new)
        led.to_csv(f, index=False)
    if not led.empty and not log.empty:   # confidence tier, from the chance logged before each fight
        from picks import tier
        lp = log.drop_duplicates("fight_id", keep="last").set_index("fight_id")["p_final"]
        led["tier"] = [tier(lp.get(i)) for i in led["fight_id"]]
    summ = {"from": LEDGER_FROM, "fights": 0, "model_right": 0, "our_bets": 0, "our_won": 0, "our_units": 0.0,
            "our_risked": 0.0, "our_staked_units": 0.0, "value_bets": 0, "value_won": 0, "value_units": 0.0, "rows": []}
    if not led.empty:
        o = led[led["our_pick"].notna()]
        summ.update({"fights": int(len(led)), "model_right": int((led["model_pick"] == led["winner"]).sum()),
                     "our_bets": int(len(o)), "our_won": int((o["our_pick"] == o["winner"]).sum()),
                     "our_units": round(float(o["our_units"].sum()), 2), "our_risked": round(float(o["stake"].sum()), 2),
                     "our_staked_units": round(float(o["our_staked_units"].sum()), 2),
                     **{f"{k}_{m}": v for k in ("model", "experts") for m, v in (lambda q: (
                         ("bets", int(len(q))), ("won", int((q["our_pick"] == q["winner"]).sum())),
                         ("staked_units", round(float(q["our_staked_units"].sum()), 2))))(o[o["our_source"] == k])},
                     **({"value_bets": int(led["value_pick"].notna().sum()),
                         "value_won": int((led["value_pick"] == led["winner"]).sum()),
                         "value_units": round(float(pd.to_numeric(led["value_units"], errors="coerce").sum()), 2)} if "value_pick" in led else {}),
                     **{f"{k}_clv": (lambda c: {"bets": int(c.notna().sum()), "beat": int((c > 0).sum()), "even": int((c == 0).sum()),
                                                "avg": round(float(c.mean()), 2) if c.notna().any() else None})(
                         pd.to_numeric(led[f"{k}_clv"], errors="coerce") if f"{k}_clv" in led else pd.Series(dtype=float))
                        for k in ("our", "value")},
                     **({"tiers": {t: {"picks": int((led["tier"] == t).sum()),
                                        "right": int(((led["tier"] == t) & (led["model_pick"] == led["winner"])).sum())}
                                   for t in ("High", "Medium", "Low")}} if "tier" in led else {}),
                     "rows": json.loads(led.sort_values("date", ascending=False).to_json(orient="records"))})
    json.dump(summ, open(os.path.join(OUT, "ledger.json"), "w"), indent=1)
    return summ


def model_pick(a, b, p_final, fair_a, lean=None):
    """The model's winner by name: value side in a coin flip, then an expert lean, then the higher chance."""
    from picks import winner_side
    lean = lean if isinstance(lean, str) else None
    s_ = winner_side(None if p_final != p_final else p_final, fair_a, "a" if lean == a else "b" if lean == b else None)
    return a if s_ == "a" else b if s_ == "b" else None



PREMIUM = ("our_pick", "pick", "stake", "why", "expert_lean", "check_news", "moved_against", "posted", "bet_to")
MODEL = ("p_a", "p_model_a", "model_pick", "tier", "fair_odds_a", "fair_odds_b", "method", "how", "edge_a")   # our numbers: members only


def pick_runs(start, end):
    """Scheduled runs that can still change picks (the fight-week workflow's crons, minus the 20-minute live-score ones),
    between two UTC datetimes."""
    import re as _re
    wf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".github", "workflows", "fight-week.yml")
    try:
        crons = _re.findall(r'cron:\s*"([^"]+)"', open(wf).read())
    except OSError:
        return []
    def field(x, lo, hi):
        return set(range(lo, hi + 1)) if x == "*" else {int(v) for v in x.split(",")}
    out = []
    for c in crons:
        m, h, dom, mon, dow = c.split()
        if any(ch in m + h for ch in "/-"):
            continue   # live status/results runs don't re-pick
        M, H, D = field(m, 0, 59), field(h, 0, 23), field(dow, 0, 6)
        day = start.replace(hour=0, minute=0, second=0, microsecond=0)
        while day <= end:
            if (day.weekday() + 1) % 7 in D:
                for hh in H:
                    for mm in M:
                        t = day.replace(hour=hh, minute=mm)
                        if start < t <= end:
                            out.append(t)
            day += dt.timedelta(days=1)
    return sorted(out)


def final_status(fights):
    """Picks are final once no scheduled update that could change them is left before the first fight
    (the line-movement pass can drop a pick until then). Returns (final, when picks become final, UTC ISO)."""
    starts = []
    for f in fights:
        try:
            starts.append(dt.datetime.strptime(f["start"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=dt.timezone.utc))
        except (KeyError, TypeError, ValueError):
            pass
    if any(f.get("state") in ("in", "post") for f in fights):
        return True, None
    if not starts:
        return False, None
    first = min(starts)
    runs = pick_runs(NOW - dt.timedelta(days=1), first - dt.timedelta(minutes=10))
    later = [t for t in runs if t > NOW]
    last = runs[-1] if runs else None
    return not later, last.strftime("%Y-%m-%dT%H:%MZ") if last else None


def public_card(full):
    """The card as a free visitor gets it once the paywall is on: betting lines for every fight, our chances and picks only on
    finished fights and on the free sample (the first pick at -250 or better). The full file is for members and,
    behind a real paywall, would be served only to signed-in members."""
    out = dict(full, gated=True)
    def pick_odds(f):
        return f.get("odds_a") if f.get("our_pick") == f.get("a") else f.get("odds_b")
    open_ = [i for i, f in enumerate(full["fights"]) if f.get("our_pick") and f.get("state") != "post"]
    # the free sample: the first open pick at a normal price (-250 or better) shows the value; else the first pick
    sample = next((i for i in open_ if pick_odds(full["fights"][i]) is not None and pick_odds(full["fights"][i]) >= -250), open_[0] if open_ else None)
    fights = []
    for i, f in enumerate(full["fights"]):
        if f.get("state") == "post" or i == sample:
            fights.append(dict(f, sample=i == sample))
            continue
        had = bool(f.get("our_pick") or f.get("pick") or f.get("expert_lean"))
        g = {k: v for k, v in f.items() if k not in PREMIUM + MODEL}
        g.update(locked=had, hidden=True, our_pick=None, pick=None, stake=None, why=None, expert_lean=None)
        if g.get("experts"):
            g["experts"] = dict(g["experts"], win_a=0, win_b=0, analysts=[dict(x, winning=False) for x in g["experts"].get("analysts", [])])
        fights.append(g)
    out["fights"], out["locked_count"] = fights, sum(1 for f in fights if f.get("locked"))
    return out

def publish_common(fights, log, G):
    """Record, rankings and backtest pages: published on every run, card or not."""
    update_ledger(log, fights)
    res = grade(log, fights)
    res["ours"] = grade(log, fights, "our_pick")
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    rt = table(G, NOW.date().isoformat())
    cutoff = (NOW.date() - dt.timedelta(days=550)).isoformat()
    active = rt[rt["last_fight"] >= cutoff].copy()
    # each fighter's division: their latest fight that wasn't at catch weight
    long = pd.concat([fights[["date", "a", "weight_class", "winner"]].rename(columns={"a": "fighter"}).assign(won=fights["winner"] == "a",
                                                                                                         lost=fights["winner"] == "b"),
                      fights[["date", "b", "weight_class", "winner"]].rename(columns={"b": "fighter"}).assign(won=fights["winner"] == "b",
                                                                                                         lost=fights["winner"] == "a")])
    long = long.sort_values("date")
    div = long[~long["weight_class"].fillna("").str.contains("Catch|Open", case=False)].groupby("fighter")["weight_class"].last()
    rec = long.groupby("fighter").agg(w=("won", "sum"), l=("lost", "sum"))
    active["division"] = active["fighter"].map(div)
    active["record"] = [f"{int(rec.loc[n, 'w'])}-{int(rec.loc[n, 'l'])}" if n in rec.index else "" for n in active["fighter"]]
    order = ["Heavyweight", "Light Heavyweight", "Middleweight", "Welterweight", "Lightweight", "Featherweight",
             "Bantamweight", "Flyweight", "Women's Featherweight", "Women's Bantamweight", "Women's Flyweight", "Women's Strawweight"]
    divisions = [{"division": d, "fighters": active[active["division"] == d].head(15).to_dict("records")}
                 for d in order if (active["division"] == d).any()]
    json.dump({"updated": NOW.strftime("%Y-%m-%dT%H:%MZ"),
               "fighters": active.head(50).to_dict("records"), "divisions": divisions},
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
           "url": None}
    from site_data import winning_counts, analyst_picks
    out.update(winning_counts(r.slug, r.bout, on_a))
    out["analysts"] = analyst_picks(r.slug, r.bout, on_a)
    return out


_SPLITS = None


def splits_for(a, b):
    """The latest DraftKings money/bets split for a bout, oriented to (a, b), or None."""
    global _SPLITS
    if _SPLITS is None:
        sp = read("splits_history.csv")
        _SPLITS = sp[sp["snapshot"] == sp["snapshot"].max()] if not sp.empty else sp
    if _SPLITS.empty:
        return None
    from names import same_fighter
    ra = _SPLITS[[same_fighter(n, a) for n in _SPLITS["fighter"]]]
    rb = _SPLITS[[same_fighter(n, b) for n in _SPLITS["fighter"]]]
    if ra.empty or rb.empty or ra.iloc[-1]["title"] != rb.iloc[-1]["title"]:
        return None
    x, y = ra.iloc[-1], rb.iloc[-1]
    return {"handle_a": float(x["handle"]), "handle_b": float(y["handle"]), "bets_a": float(x["bets"]),
            "bets_b": float(y["bets"]), "at": x["snapshot"]}


def schedule(card):
    """When each part of the card starts, and where to watch: the latest start time is the main card,
    the one before it the prelims, anything earlier the early prelims."""
    if card is None or card.empty or "start" not in card:
        return []
    c = card[card["start"].notna()].copy()
    if c.empty:
        return []
    groups = sorted(c["start"].astype(str).unique())
    names = ["Main card", "Prelims", "Early prelims"]
    out = []
    for i, st in enumerate(reversed(groups)):
        g = c[c["start"].astype(str) == st]
        seg = next((x for x in g.get("card_segment", pd.Series(dtype=str)).dropna() if str(x).strip()), None)
        tv = sorted({x for v in g.get("broadcast", pd.Series(dtype=str)).dropna() for x in str(v).split(", ") if x})
        out.append({"segment": seg or (names[i] if i < 3 else "Early prelims"), "start": st, "bouts": int(len(g)), "tv": tv})
    return list(reversed(out))   # earliest first


def why(f, ex, sp, pick):
    """Plain reasons behind an our pick, strongest first (shown under the pick on the site)."""
    if not pick:
        return []
    on_a = pick == f["a"]
    me, opp = ("a", "b") if on_a else ("b", "a")
    out = []
    him = "her" if str(f.get("gender", "M")).upper().startswith("F") else "him"
    lean = isinstance(f.get("expert_lean"), str) and f["expert_lean"] == pick and ex
    if lean:   # an analyst pick: lead with the analysts, the real reason behind it
        k, n = ex[f"picks_{me}"], ex["picks_a"] + ex["picks_b"]
        out.append(f"Close fight and {k} of {n} analysts pick {pick.split()[-1]}")
    pf, fair = f.get("p_final"), f.get("fair_a")
    if pf == pf and fair == fair and pf is not None and fair is not None:
        mine, line = (pf, fair) if on_a else (1 - pf, 1 - fair)
        r = lambda x: int(np.floor(100 * round(float(x), 3) + 0.5))   # as the site shows it: 3 decimals, then half up
        m_, l_ = r(mine), r(line)
        if m_ >= l_:   # our chance is shown only when it backs the pick (a posted pick stays up after the line moves)
            out.append(f"Our chance {m_}% vs the line's {l_}%" + (f" ({m_ - l_} point{'s' if m_ - l_ != 1 else ''} of value)" if m_ - l_ >= 1 else ""))
    if not lean and ex and ex["picks_a"] + ex["picks_b"] >= 5:
        k, n = ex[f"picks_{me}"], ex["picks_a"] + ex["picks_b"]
        if k / n >= 0.65:
            out.append(f"{k} of {n} analysts agree")
    if f.get(f"long_layoff_{opp}") == 1:
        out.append("Opponent is back from a 15+ month layoff (those fighters win less than priced)")
    if f.get(f"debut_{opp}") and not f.get(f"debut_{me}"):
        out.append("Opponent is making " + ("her" if him == "her" else "his") + " UFC debut")
    if f.get("rating_a") == f.get("rating_a") and f.get("rating_b") == f.get("rating_b"):
        diff = (f["rating_a"] - f["rating_b"]) * (1 if on_a else -1)
        if diff >= 75:
            out.append(f"Rated {round(diff)} points higher")
    if sp:
        h, b = sp[f"handle_{me}"], sp[f"bets_{me}"]
        if h - b >= 0.2:
            out.append(f"Bigger bettors on {him}: {round(100 * h)}% of DraftKings money from {round(100 * b)}% of bets")
    return out[:4]


def load_card(fights):
    """The next card, with names in the history's spelling and the current lines attached."""
    known = {norm(n): n for n in pd.concat([fights["a"], fights["b"]]).unique()}
    yesterday = (NOW - dt.timedelta(days=1)).strftime("%Y-%m-%d")   # keep fight night on the board
    espn, odds = read("espn_card.csv"), lines()
    if not espn.empty and str(espn["date"].max()) >= yesterday:
        card, source = espn.copy(), "ESPN"
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
        raise SystemExit("No upcoming card: run src/espn.py or src/get_odds.py first")
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
                                                                  best_book_a=None, best_book_b=None, book_prices=None,
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


def bet_to(f, side, from_experts):
    """The worst price for our pick where it still passes our rules ("playable to"): a model pick while
    the line's no-vig chance stays 3+ points under our current chance (held fixed: as the line moves our
    way the blend nudges our chance up too, so this is the safe side); an analyst pick while the fight
    stays close by the line (EXPERT_LEAN_LINE). Same bookmaker margin as now. Rounded to 5, toward
    the safe side. None if unknown."""
    from config import EXPERT_LEAN_LINE
    implied = lambda o: -o / (-o + 100) if o < 0 else 100 / (o + 100)
    oa, ob, pf = f.get("odds_a"), f.get("odds_b"), f.get("p_final")
    if any(x is None or x != x for x in (oa, ob, pf)):
        return None
    over = float(implied(oa) + implied(ob))
    mine = pf if side == "a" else 1 - pf
    fair = EXPERT_LEAN_LINE[1] if from_experts else mine - EDGE
    q = fair * over                       # the most this side's price can imply
    if not 0.05 < q < 0.97:
        return None
    if q >= 0.5:
        o = -100 * q / (1 - q)
        return int(-5 * (-o // 5))         # toward the safe side: -207 -> -205
    o = 100 * (1 - q) / q
    return int(5 * -(-o // 5))             # +112 -> +115


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
                   "message": "The next card isn't listed yet. It appears here as soon as ESPN posts it.",
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
    how_model = MethodByWinner().fit(hist)

    card = card.set_index("fight_id")
    for c in ["odds_a", "odds_b", "best_a", "best_b", "open_a", "open_b", "books", "best_book_a", "best_book_b", "book_prices"]:
        up[c] = card[c].reindex(up.index) if c in card else None
    up["fair_a"] = no_vig(up["odds_a"], up["odds_b"])
    has = up["fair_a"].notna()
    up["p_final"] = up["p_model"]
    if MARKET_BLEND and os.path.exists(path("market_blend.json")) and has.any():
        up.loc[has, "p_final"] = blended(up.loc[has, "fair_a"], up.loc[has, "p_model"], up.loc[has])
    up["edge_a"] = up["p_final"] - up["fair_a"]
    how_a, how_b = how_model.predict(up, up["p_final"])   # who wins and how, from our final win chance
    up["pick"] = np.where(up["edge_a"] > EDGE, up["a"], np.where(-up["edge_a"] > EDGE, up["b"], None))
    from picks import our_side
    sides = [our_side(pf, fa, oa, ob) for pf, fa, oa, ob in zip(up["p_final"], up["fair_a"], up["odds_a"], up["odds_b"])]
    up["our_pick"] = [a if s_ == "a" else b if s_ == "b" else None for s_, a, b in zip(sides, up["a"], up["b"])]
    # expert lean: close fight + most analysts agree -> our pick when the model has none
    from picks import expert_lean
    leans = []
    for i, r in up.iterrows():
        ex = experts_for(r["date"], r["a"], r["b"])
        side_ = expert_lean(r["fair_a"], ex["picks_a"], ex["picks_b"]) if ex else None
        leans.append(r["a"] if side_ == "a" else r["b"] if side_ == "b" else None)
    up["expert_lean"] = leans
    from config import EXPERT_LEAN_AS_PICK
    if EXPERT_LEAN_AS_PICK:
        no_ours = up["our_pick"].isna() & up["expert_lean"].notna()
        up.loc[no_ours, "our_pick"] = up.loc[no_ours, "expert_lean"]
    # line-movement filter: drop our pick when the line has moved against it since it opened
    from config import LINE_MOVE_AGAINST
    up["moved_against"] = False
    if LINE_MOVE_AGAINST is not None and "open_a" in up:
        has_open = up["open_a"].notna() & up["open_b"].notna() & up["fair_a"].notna()
        fo = pd.Series(np.nan, index=up.index)
        fo[has_open] = no_vig(up.loc[has_open, "open_a"], up.loc[has_open, "open_b"])
        mv = up["fair_a"] - fo   # + = toward fighter A
        against = up["our_pick"].notna() & has_open & (((up["our_pick"] == up["a"]) & (mv < -LINE_MOVE_AGAINST)) |
                                                        ((up["our_pick"] == up["b"]) & (mv > LINE_MOVE_AGAINST)))
        up.loc[against, "moved_against"] = True
        up.loc[against, "our_pick"] = None
    from config import OUR_PICKS_SKIP_BOTH_DEBUT
    if OUR_PICKS_SKIP_BOTH_DEBUT:
        both_new = (up["debut_a"] == 1) & (up["debut_b"] == 1)
        up.loc[both_new, "our_pick"] = None

    # freeze fights that have started: keep their last pre-fight prediction
    logf = path("pick_log.csv")
    log = read("pick_log.csv")
    # a posted pick is pulled only when our edge for it is gone (it no longer passes the pick rules at the
    # current line). Tested Nov 2026 on 2023-26 opening/closing lines: picks made at the open that were still
    # picks at the close made +7.3u at opening prices; the ones whose edge was gone by the close went 11-11, -7.1u.
    # moved_against marks a pulled pick so the card can say we passed.
    up["pulled"] = None   # the pick we passed on, kept until fight night (pick_log.csv carries it between runs)
    if not log.empty and "our_pick" in log:
        last = log.drop_duplicates("fight_id", keep="last").set_index("fight_id")
        for fid in up.index[up.index.isin(last.index)]:
            if isinstance(up.at[fid, "our_pick"], str):
                continue
            was = last.at[fid, "our_pick"] if isinstance(last.at[fid, "our_pick"], str) else \
                (last.at[fid, "pulled"] if "pulled" in last and isinstance(last.at[fid, "pulled"], str) else None)
            if was in (up.at[fid, "a"], up.at[fid, "b"]):
                up.at[fid, "pulled"], up.at[fid, "moved_against"] = was, True
    started = card["state"].reindex(up.index).isin(["in", "post"])
    if not log.empty:
        lg = log.set_index("fight_id")
        frozen = up.index[started & up.index.isin(lg.index)]
        for c in ["p_model", "p_final", "fair_a", "odds_a", "odds_b", "edge_a", "pick", "our_pick", "expert_lean"]:
            if c in lg:
                up.loc[frozen, c] = lg.loc[frozen, c]
    fresh = up[~started].reset_index()
    if len(fresh):
        cols = ["fight_id", "date", "a", "b", "p_model", "p_final", "fair_a", "odds_a", "odds_b",
                "open_a", "open_b", "edge_a", "pick", "our_pick", "expert_lean", "pulled"]
        new = fresh[cols].assign(run=NOW.strftime("%Y-%m-%dT%H:%MZ"))
        # the price when each pick first appeared, kept while the pick stays the same: closing line value later
        prev = log.drop_duplicates("fight_id", keep="last").set_index("fight_id") if not log.empty else pd.DataFrame()
        for k in ("our_pick", "pick"):
            fo, fs = f"{k}_first_odds", f"{k}_first_seen"
            fo_v, fs_v = [], []
            for r in new.itertuples():
                side = getattr(r, k)
                cur = (r.odds_a if side == r.a else r.odds_b) if isinstance(side, str) else None
                q = prev.loc[r.fight_id] if (not prev.empty and r.fight_id in prev.index) else None
                if q is not None and isinstance(side, str) and q.get(k) == side and pd.notna(q.get(fo)):
                    fo_v.append(q[fo]); fs_v.append(q[fs])
                else:
                    fo_v.append(cur if cur is not None and pd.notna(cur) else None); fs_v.append(r.run if isinstance(side, str) else None)
            new[fo], new[fs] = fo_v, fs_v
        log = pd.concat([log, new]) if not log.empty else new
        log = log.drop_duplicates("fight_id", keep="last")
        log.to_csv(logf, index=False)

    # when each our pick first went up, and at what price (closing line value on the card)
    posted = {}
    if not log.empty and "our_pick_first_seen" in log:
        for q in log.drop_duplicates("fight_id", keep="last").itertuples():
            if isinstance(q.our_pick, str) and isinstance(q.our_pick_first_seen, str) and pd.notna(q.our_pick_first_odds):
                posted[q.fight_id] = (q.our_pick, q.our_pick_first_seen, float(q.our_pick_first_odds))
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
            "experts": (ex_ := experts_for(f["date"], f["a"], f["b"])),
            "splits": (sp_ := splits_for(f["a"], f["b"])),
            "why": why(f, ex_, sp_, our_pick),
            "weight_class": c.get("weight_class") or "",
            "rounds": int(f["rounds"]) if f["rounds"] == f["rounds"] else 3,
            "segment": c.get("card_segment") if isinstance(c.get("card_segment"), str) else "",
            "start": c.get("start") if isinstance(c.get("start"), str) else None,
            "state": c.get("state") or "pre", "status": c.get("status_detail") if isinstance(c.get("status_detail"), str) else "",
            "result": res,
            "rating_a": round(f["rating_a"]), "rating_b": round(f["rating_b"]),
            "debut_a": bool(f["debut_a"]), "debut_b": bool(f["debut_b"]),
            "p_model_a": num(f["p_model"]), "p_a": num(f["p_final"]),
            "model_pick": model_pick(f["a"], f["b"], f["p_final"], f["fair_a"], f.get("expert_lean")),
            "tier": tier(f["p_final"]),
            "fair_odds_a": to_american(f["p_final"]), "fair_odds_b": to_american(1 - f["p_final"]),
            "market_p_a": num(f["fair_a"]), "odds_a": num(f["odds_a"], 0), "odds_b": num(f["odds_b"], 0),
            "best_a": num(f["best_a"], 0), "best_b": num(f["best_b"], 0),
            "open_a": num(f["open_a"], 0), "open_b": num(f["open_b"], 0), "books": num(f["books"], 0),
            "best_book_a": f["best_book_a"] if isinstance(f.get("best_book_a"), str) else None,
            "best_book_b": f["best_book_b"] if isinstance(f.get("best_book_b"), str) else None,
            "book_prices": [{"book": k, "a": num(x, 0), "b": num(y, 0)} for k, x, y in json.loads(f["book_prices"])]
                           if isinstance(f.get("book_prices"), str) else [],
            "line_history": c.get("line_history") if isinstance(c.get("line_history"), list) else [],
            "edge_a": edge, "pick": pick, "our_pick": our_pick,
            "bet_to": bet_to(f, "a" if our_pick == f["a"] else "b", our_pick != pick) if our_pick else None,
            "stake": __import__("picks").stake(f["odds_a"] if our_pick == f["a"] else f["odds_b"],
                                               (edge if our_pick == f["a"] else -edge) if (our_pick == pick and edge is not None) else None) if our_pick else None,
            "expert_lean": f["expert_lean"] if isinstance(f.get("expert_lean"), str) else None,
            "check_news": edge is not None and abs(edge) >= BIG_EDGE,
            "moved_against": bool(f.get("moved_against")) if f.get("moved_against") == f.get("moved_against") else False,
            "posted": {"at": posted[fid][1], "odds": num(posted[fid][2], 0)} if our_pick and fid in posted and posted[fid][0] == our_pick else None,
            "method": {k: round(float(how_a.loc[fid, k] + how_b.loc[fid, k]), 3) for k in how_a.columns},
            "how": {"a": {k: round(float(how_a.loc[fid, k]), 3) for k in how_a.columns},
                    "b": {k: round(float(how_b.loc[fid, k]), 3) for k in how_b.columns}},
        })
    first = card.iloc[0]
    full = {"updated": NOW.strftime("%Y-%m-%dT%H:%MZ"), "event": str(first.get("event") or "Next UFC card"),
            "date": str(first["date"]), "location": str(first.get("location") or ""), "card_source": source,
            "edge_threshold": EDGE, "big_edge": BIG_EDGE, "model": cfg, "schedule": schedule(card), "fights": out}
    full["final"], full["final_at"] = final_status(out)
    json.dump(full, open(os.path.join(OUT, "predictions.json"), "w"), indent=1)
    json.dump(public_card(full), open(os.path.join(OUT, "predictions_public.json"), "w"), indent=1)
    publish_common(fights, log, G)

    print(f"{len(out)} bouts, {sum(1 for f in out if f['pick'])} picks at a {EDGE:.0%} edge")
    for f in out:
        mk = f"line {f['market_p_a']:.0%}" if f["market_p_a"] is not None else "no line"
        print(f"  {f['a']} {f['p_a']:.0%} vs {f['b']}  ({mk})  [{f['state']}]  pick: {f['pick'] or '-'}")


if __name__ == "__main__":
    main()

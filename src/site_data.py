"""Fighter profiles and past cards for the website.

Writes (deterministic, so unchanged fighters don't create new commits):
  docs/data/fighters/index.json        every fighter: name, record, rating, division, photo id
  docs/data/fighters/<slug>.json       one fighter: bio, record, how they win and lose, style
                                       stats, rating history and every UFC fight
  docs/data/events/index.json          every past card, newest first
  docs/data/events/<slug>.json         one card: every bout with result, odds, the model's
                                       pre-fight chance and the expert consensus where known

Photos are ESPN headshots, linked by ESPN athlete id (from the ESPN feeds), not copied.
Run:  python src/site_data.py
"""
import json, os, re, unicodedata, warnings, datetime as dt
warnings.filterwarnings("ignore")
import numpy as np
import pandas as pd
from common import path, SITE, no_vig, payout
from config import GLICKO, WIN_SCORE, EDGE
from ratings import Glicko2, SCALE

OUT = os.path.join(SITE, "data")


def slug(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "unknown"


def num(x, nd=None):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if x != x:
        return None
    return round(x, nd) if nd is not None else int(round(x))


def read(name, **kw):
    f = path(name)
    return pd.read_csv(f, **kw) if os.path.exists(f) else pd.DataFrame()


def norm(n):
    from get_odds import norm as _n
    return _n(n)


def write(rel, obj):
    f = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(f), exist_ok=True)
    txt = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    if os.path.exists(f) and open(f, encoding="utf-8").read() == txt:
        return
    open(f, "w", encoding="utf-8").write(txt)


def espn_lookup():
    """ESPN athlete id and latest pro record per fighter, and event names by date."""
    ids, recs, events = {}, {}, {}
    for f in ["espn_history.csv", "espn_results.csv", "espn_card.csv"]:
        d = read(f, dtype={"espn_id_a": str, "espn_id_b": str})
        if d.empty or "espn_id_a" not in d:
            continue
        d = d.sort_values("date")
        for r in d.itertuples():
            for s in "ab":
                n, i, rec = getattr(r, s), getattr(r, f"espn_id_{s}"), getattr(r, f"record_{s}", None)
                if isinstance(i, str) and i:
                    ids[norm(n)] = i
                if isinstance(rec, str):
                    recs[norm(n)] = rec
            if isinstance(r.event, str) and r.event:
                events.setdefault(r.date, r.event)
    return ids, recs, events


def ratings_through(fights):
    """Each fight's ratings before and after, for both fighters."""
    G = Glicko2(**GLICKO)
    rows = []
    for f in fights.itertuples():
        d = pd.Timestamp(f.date)
        pre = [G.state(n, d) for n in (f.a, f.b)]
        w = WIN_SCORE.get(f.finish, 1.0) if isinstance(f.finish, str) else 1.0
        score = {"a": w, "b": 1 - w, "draw": 0.5}.get(f.winner)
        if score is not None:
            G.play(f.a, f.b, score, d)
        post = [G.state(n, d) for n in (f.a, f.b)]
        rows.append((1500 + SCALE * pre[0][0], 1500 + SCALE * pre[1][0], SCALE * pre[0][1], SCALE * pre[1][1],
                     1500 + SCALE * post[0][0], 1500 + SCALE * post[1][0], SCALE * post[0][1], SCALE * post[1][1]))
    r = pd.DataFrame(rows, columns=["pre_a", "pre_b", "rd_pre_a", "rd_pre_b", "post_a", "post_b", "rd_a", "rd_b"],
                     index=fights.index)
    return fights.join(r)


def style_stats(stats):
    """Career per-minute stats per fighter from the fight stats table."""
    if stats.empty:
        return {}
    s = stats.copy()
    s["mins"] = pd.to_numeric(s["fight_secs"], errors="coerce").fillna(0) / 60
    g = s.groupby("fighter").agg(mins=("mins", "sum"), fights=("mins", "size"), sig_l=("sig_landed", "sum"),
                                 sig_att=("sig_att", "sum"), sig_abs=("sig_absorbed", "sum"),
                                 td_l=("td_landed", "sum"), td_att=("td_att", "sum"),
                                 td_allowed=("td_allowed", "sum"), td_faced=("td_faced", "sum"),
                                 sub=("sub_att", "sum"), ctrl=("ctrl_secs", "sum"), kd=("kd", "sum"))
    out = {}
    for name, r in g.iterrows():
        if r["mins"] < 1:
            continue
        m = r["mins"]
        out[norm(name)] = {
            "fights_with_stats": int(r["fights"]), "minutes": round(m, 1),
            "sig_strikes_landed_per_min": round(r["sig_l"] / m, 2),
            "sig_strikes_absorbed_per_min": round(r["sig_abs"] / m, 2),
            "sig_strike_accuracy": round(r["sig_l"] / r["sig_att"], 3) if r["sig_att"] else None,
            "takedowns_per_15": round(15 * r["td_l"] / m, 2),
            "takedown_accuracy": round(r["td_l"] / r["td_att"], 3) if r["td_att"] else None,
            "takedown_defense": round(1 - r["td_allowed"] / r["td_faced"], 3) if r["td_faced"] else None,
            "submission_attempts_per_15": round(15 * r["sub"] / m, 2),
            "control_time_share": round(r["ctrl"] / 60 / m, 3),
            "knockdowns_per_15": round(15 * r["kd"] / m, 2),
        }
    return out


def track_record(rows):
    """The model's record by year and in total: winners picked, and units from betting
    (1) the model's winner at the moneyline, (2) only value picks, where the model beat the line."""
    def summary(rs):
        picks = [r["pick"] for r in rs if r["pick"]]
        bets = [x for x in picks if x["units"] is not None]
        vals = [r["value"] for r in rs if r["value"]]
        return {"picks": len(picks), "right": sum(x["right"] for x in picks),
                "pct": round(100 * sum(x["right"] for x in picks) / len(picks), 1) if picks else None,
                "bets": len(bets), "units": round(sum(x["units"] for x in bets), 1),
                "roi_pct": round(100 * sum(x["units"] for x in bets) / len(bets), 1) if bets else None,
                "value_bets": len(vals), "value_won": sum(x["right"] for x in vals),
                "value_pct": round(100 * sum(x["right"] for x in vals) / len(vals), 1) if vals else None,
                "value_units": round(sum(x["units"] for x in vals), 1),
                "value_roi_pct": round(100 * sum(x["units"] for x in vals) / len(vals), 1) if vals else None}
    years = sorted({r["date"][:4] for r in rows if r["pick"]}, reverse=True)
    return {"all": summary(rows), "since_2018": summary([r for r in rows if r["date"] >= "2018"]),
            "years": [{"year": y, **summary([r for r in rows if r["date"].startswith(y)])} for y in years],
            "edge": EDGE}


def style_label(st, win_methods, wins):
    """Striker, Wrestler, Grappler or Balanced: from fight stats when we have them,
    otherwise from how the fighter wins."""
    ko, sub = win_methods.get("KO", 0), win_methods.get("SUB", 0)
    if st and st.get("minutes", 0) >= 10:
        if (st.get("takedowns_per_15") or 0) >= 1.8 or (st.get("control_time_share") or 0) >= 0.22:
            return "Wrestler"
        if (st.get("submission_attempts_per_15") or 0) >= 0.9 or (wins >= 3 and sub / wins >= 0.4):
            return "Grappler"
        if (st.get("sig_strikes_landed_per_min") or 0) >= 4.0 or (wins >= 3 and ko / wins >= 0.5):
            return "Striker"
        return "Balanced"
    if wins >= 3 and sub / wins >= 0.4:
        return "Grappler"
    if wins >= 3 and ko / wins >= 0.5:
        return "Striker"
    return "Balanced" if wins >= 3 else None


def splits(g, labels):
    """How a fighter has done against each style, stance, reach and in five-rounders."""
    g = g[g["result"].isin(["W", "L", "D"])]
    def rec(d):
        return {"w": int((d["result"] == "W").sum()), "l": int((d["result"] == "L").sum()), "d": int((d["result"] == "D").sum())}
    opp_style = g["opp"].map(lambda n: labels.get(norm(n)))
    out = {"vs_style": {k: rec(g[opp_style == k]) for k in ["Striker", "Wrestler", "Grappler", "Balanced"] if (opp_style == k).any()},
           "vs_stance": {k: rec(g[g["opp_stance"] == k]) for k in ["Orthodox", "Southpaw", "Switch"] if (g["opp_stance"] == k).any()}}
    diff = g["reach"] - g["opp_reach"]
    out["vs_reach"] = {"longer": rec(g[diff <= -5]), "similar": rec(g[diff.abs() < 5]), "shorter": rec(g[diff >= 5])}
    five = g[pd.to_numeric(g["rounds"], errors="coerce") == 5]
    if len(five):
        out["five_rounds"] = rec(five)
    return out


def expert_lookup():
    """Expert consensus per bout (SplitPicks), keyed by (date, pair)."""
    c = read("expert_consensus.csv")
    out = {}
    for r in c.itertuples():
        for d in pd.date_range(pd.Timestamp(r.date) - pd.Timedelta(days=1), periods=3).strftime("%Y-%m-%d"):
            out[(d, frozenset((norm(r.a), norm(r.b))))] = r
    return out


def main():
    fights = read("fights.csv")
    fights = fights[fights["winner"].isin(["a", "b", "draw", "nc"])].copy()
    fights["bout_order"] = pd.to_numeric(fights.get("bout_order"), errors="coerce").fillna(99)
    fights = fights.sort_values(["date", "bout_order"], kind="stable").reset_index(drop=True)
    fights = ratings_through(fights)
    model = read("model_history.csv")
    mp = dict(zip(model["fight_id"], model["p"])) if not model.empty else {}
    fp = dict(zip(model["fight_id"], model["p_blend"])) if "p_blend" in model else {}
    fp = {k: v for k, v in fp.items() if v == v}
    log = read("pick_log.csv")
    if not log.empty:   # live predictions made before each fight take precedence
        mp.update(dict(zip(log["fight_id"], log["p_model"])))
        fp.update({k: v for k, v in zip(log["fight_id"], log["p_final"]) if v == v})
    ids, recs, ev_names = espn_lookup()
    styles = style_stats(read("fight_stats.csv"))
    experts = expert_lookup()
    profiles = read("fighter_profiles.csv")
    dob = {norm(n): d for n, d in zip(profiles.get("name", []), profiles.get("dob", []))} if not profiles.empty else {}

    # ---- events, with the model's track record ----
    events_index, graded_rows = [], []
    fights["event_name"] = [e if isinstance(e, str) and e else ev_names.get(d, "") for e, d in zip(fights["event"], fights["date"])]
    for (date, ), card in fights.groupby(["date"], sort=False):
        name = next((n for n in card["event_name"] if n), "") or "UFC card"
        loc = next((l for l in card["location"] if isinstance(l, str) and l), "")
        es = f"{date}-{slug(name)}"
        bouts, fav_right = [], 0
        rec = {"picks": 0, "right": 0, "bets": 0, "units": 0.0, "value_bets": 0, "value_won": 0, "value_units": 0.0}
        for f in card.itertuples():
            p, pf = mp.get(f.fight_id), fp.get(f.fight_id)
            fair = no_vig(f.odds_a, f.odds_b) if pd.notna(f.odds_a) and pd.notna(f.odds_b) else None
            fair = float(fair) if fair is not None and fair == fair else None
            ex = experts.get((date, frozenset((norm(f.a), norm(f.b)))))
            exp = None
            if ex is not None:
                on_a = norm(ex.a) == norm(f.a)
                exp = {"picks_a": int(ex.picks_a if on_a else ex.picks_b), "picks_b": int(ex.picks_b if on_a else ex.picks_a),
                       "high_a": int(ex.high_a if on_a else ex.high_b), "high_b": int(ex.high_b if on_a else ex.high_a),
                       "url": f"https://splitpicks.com/events/{ex.slug}.html"}
            pick = value = None
            if f.winner in ("a", "b"):
                won_a = f.winner == "a"
                if fair is not None:
                    fav_right += int((fair > 0.5) == won_a)
                if p is not None:   # the model's winner, bet at its moneyline
                    on_a = p > 0.5
                    right = on_a == won_a
                    o = f.odds_a if on_a else f.odds_b
                    u = (float(payout(o)) if right else -1.0) if pd.notna(o) else None
                    pick = {"side": "a" if on_a else "b", "right": right, "odds": num(o),
                            "units": round(u, 2) if u is not None else None}
                    rec["picks"] += 1
                    rec["right"] += int(right)
                    if u is not None:
                        rec["bets"] += 1
                        rec["units"] += u
                if pf is not None and fair is not None and abs(pf - fair) > EDGE:   # value pick, as on the live card
                    on_a = pf > fair
                    right = on_a == won_a
                    o = f.odds_a if on_a else f.odds_b
                    u = float(payout(o)) if right else -1.0
                    value = {"side": "a" if on_a else "b", "right": right, "odds": num(o), "units": round(u, 2),
                             "edge": round(abs(pf - fair), 3)}
                    rec["value_bets"] += 1
                    rec["value_won"] += int(right)
                    rec["value_units"] += u
                graded_rows.append({"date": date, "pick": pick, "value": value})
            bouts.append({"a": f.a, "b": f.b, "a_slug": slug(f.a), "b_slug": slug(f.b),
                          "a_id": ids.get(norm(f.a)), "b_id": ids.get(norm(f.b)),
                          "weight_class": f.weight_class if isinstance(f.weight_class, str) else "",
                          "rounds": num(f.rounds), "winner": f.winner, "finish": f.finish if isinstance(f.finish, str) else None,
                          "round": num(f.end_round), "odds_a": num(f.odds_a), "odds_b": num(f.odds_b),
                          "line_p_a": round(fair, 3) if fair is not None else None,
                          "model_p_a": round(float(p), 3) if p is not None else None,
                          "final_p_a": round(float(pf), 3) if pf is not None else None,
                          "model_pick": pick, "value_pick": value,
                          "rating_a": num(f.pre_a), "rating_b": num(f.pre_b), "experts": exp})
        rec["units"], rec["value_units"] = round(rec["units"], 2), round(rec["value_units"], 2)
        main = f"{bouts[0]['a']} vs {bouts[0]['b']}"
        write(f"events/{es}.json", {"slug": es, "name": name, "date": date, "location": loc, "bouts": bouts,
                                    "record": rec, "model_right": rec["right"], "graded": rec["picks"],
                                    "favorites_right": fav_right})
        events_index.append({"slug": es, "name": name, "date": date, "location": loc, "bouts": len(bouts), "main": main,
                             "record": rec, "model_right": rec["right"], "graded": rec["picks"]})
    events_index.sort(key=lambda e: e["date"], reverse=True)
    write("events/index.json", events_index)
    write("model_record.json", track_record(graded_rows))

    # ---- fighters ----
    long = []
    for s, o in (("a", "b"), ("b", "a")):
        d = fights.rename(columns={s: "name", o: "opp", f"pre_{s}": "before", f"post_{s}": "after",
                                   f"rd_{s}": "rd", f"odds_{s}": "odds", f"height_{s}": "height",
                                   f"reach_{s}": "reach", f"stance_{s}": "stance", f"age_{s}": "age"})
        d["result"] = np.select([d["winner"] == s, d["winner"] == o, d["winner"] == "draw"], ["W", "L", "D"], "NC")
        d["side"] = s
        d["opp_stance"], d["opp_reach"] = fights[f"stance_{o}"], fights[f"reach_{o}"]
        long.append(d[["date", "fight_id", "event_name", "name", "opp", "result", "method", "finish", "end_round",
                       "weight_class", "before", "after", "rd", "odds", "height", "reach", "stance", "age", "title", "side",
                       "opp_stance", "opp_reach", "rounds"]])
    long = pd.concat(long).sort_values(["date"], kind="stable")
    labels = {}
    for name, g in long.groupby("name", sort=False):
        w = g[g["result"] == "W"]
        labels[norm(name)] = style_label(styles.get(norm(name)), w["method"].value_counts().to_dict(), len(w))
    index = []
    today = dt.date.today()
    for name, g in long.groupby("name", sort=False):
        k = norm(name)
        last = g.iloc[-1]
        res = g["result"].value_counts()
        wins, losses = g[g["result"] == "W"], g[g["result"] == "L"]
        by = lambda d: {m: int((d["method"] == m).sum()) for m in ("KO", "SUB", "DEC")}
        streak = 0
        for r in reversed(g["result"].tolist()):
            if r not in ("W", "L"):
                continue
            if streak == 0 or (r == "W") == (streak > 0):
                streak += 1 if r == "W" else -1
            else:
                break
        age = None
        if isinstance(dob.get(k), str):
            age = int((pd.Timestamp(today) - pd.Timestamp(dob[k])).days // 365.25)
        elif g["age"].notna().any():   # last known age, carried forward to today
            ka = g[g["age"].notna()].iloc[-1]
            age = int(ka["age"] + (pd.Timestamp(today) - pd.Timestamp(ka["date"])).days // 365.25)
        hist = []
        for r in g.iloc[::-1].itertuples():
            p = mp.get(r.fight_id)
            if p is not None and r.side == "b":
                p = 1 - p
            hist.append({"date": r.date, "event": r.event_name or "", "event_slug": f"{r.date}-{slug(r.event_name or 'UFC card')}",
                         "opp": r.opp, "opp_slug": slug(r.opp), "result": r.result,
                         "finish": r.finish if isinstance(r.finish, str) else None, "round": num(r.end_round),
                         "weight_class": r.weight_class if isinstance(r.weight_class, str) else "",
                         "odds": num(r.odds), "model_p": round(float(p), 3) if p is not None else None,
                         "rating_before": num(r.before), "rating_after": num(r.after), "title": bool(r.title)})
        prof = {
            "name": name, "slug": slug(name), "espn_id": ids.get(k), "pro_record": recs.get(k),
            "ufc_record": f"{res.get('W', 0)}-{res.get('L', 0)}-{res.get('D', 0)}" + (f" ({res.get('NC')} NC)" if res.get("NC") else ""),
            "wins_by": by(wins), "losses_by": by(losses), "streak": streak,
            "rating": num(last["after"]), "rd": num(last["rd"]), "peak_rating": num(g["after"].max()),
            "height_cm": num(g["height"].dropna().iloc[-1], 1) if g["height"].notna().any() else None,
            "reach_cm": num(g["reach"].dropna().iloc[-1], 1) if g["reach"].notna().any() else None,
            "stance": g["stance"].dropna().iloc[-1] if g["stance"].notna().any() else None,
            "age": age, "weight_class": last["weight_class"] if isinstance(last["weight_class"], str) else "",
            "first_fight": g["date"].iloc[0], "last_fight": last["date"],
            "title_fights": int(g["title"].fillna(False).astype(bool).sum()),
            "finish_rate": round((wins["method"].isin(["KO", "SUB"])).mean(), 3) if len(wins) else None,
            "style": styles.get(k), "style_label": labels.get(k),
            "splits": splits(g, labels),
            "rating_history": [[d, num(r)] for d, r in zip(g["date"], g["after"])],
            "fights": hist,
        }
        write(f"fighters/{prof['slug']}.json", prof)
        index.append({"name": name, "slug": prof["slug"], "espn_id": prof["espn_id"], "record": prof["ufc_record"],
                      "rating": prof["rating"], "weight_class": prof["weight_class"], "last_fight": prof["last_fight"]})
    index.sort(key=lambda x: -(x["rating"] or 0))
    write("fighters/index.json", index)
    print(f"site data: {len(index)} fighters, {len(events_index)} past cards")


if __name__ == "__main__":
    main()

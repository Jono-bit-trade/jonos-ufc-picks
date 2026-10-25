"""Hunting for edges: situations where the betting line has misjudged fighters.

For each situation (an older fighter, a long layoff, a reach advantage as an underdog,
a tougher past schedule...), it takes the fighter in that situation and compares how often
they actually won with what the closing line implied, and the return from betting them.
Each is checked in two separate periods (2013-2019 and 2020-2026): a real edge should
show up in both, not just one.

Writes docs/data/edges.json and data/edges.csv.
Run:  python src/edges.py
"""
import json, os, warnings
import numpy as np
import pandas as pd
from common import path, SITE, no_vig, payout
from features import build, flip

warnings.filterwarnings("ignore")
PERIODS = [("2013-2019", "2013", "2020"), ("2020-2026", "2020", "2027")]
MIN_N = 80


def schedule_strength(t):
    """Average pre-fight rating of each fighter's last 5 opponents, before this fight;
    and how the fighter's last fight ended."""
    hist, last = {}, {}
    sos_a, sos_b, lk_a, lk_b, lw_a, lw_b = [], [], [], [], [], []
    for r in t.itertuples():
        for side, me, opp, opp_rating, sos, lk, lw in (("a", r.a, r.b, r.rating_b, sos_a, lk_a, lw_a),
                                                       ("b", r.b, r.a, r.rating_a, sos_b, lk_b, lw_b)):
            h = hist.get(me, [])
            sos.append(np.mean(h[-5:]) if h else np.nan)
            l = last.get(me)
            lk.append(int(l is not None and l[0] == "L" and l[1] == "KO"))
            lw.append(int(l is not None and l[0] == "W"))
        if r.winner in ("a", "b", "draw"):
            hist.setdefault(r.a, []).append(r.rating_b)
            hist.setdefault(r.b, []).append(r.rating_a)
            ra = "W" if r.winner == "a" else "L" if r.winner == "b" else "D"
            rb = "W" if r.winner == "b" else "L" if r.winner == "a" else "D"
            last[r.a], last[r.b] = (ra, r.method), (rb, r.method)
    t = t.copy()
    t["sos_a"], t["sos_b"], t["ko_loss_last_a"], t["ko_loss_last_b"] = sos_a, sos_b, lk_a, lk_b
    t["won_last_a"], t["won_last_b"] = lw_a, lw_b
    return t


def sides(t):
    """Every fight from each fighter's side: columns describe 'me' (a) and 'opp' (b)."""
    t = t[t["winner"].isin(["a", "b"]) & t["odds_a"].notna() & t["odds_b"].notna()].copy()
    f = flip(t)
    for x, y in [("sos_a", "sos_b"), ("ko_loss_last_a", "ko_loss_last_b"), ("won_last_a", "won_last_b")]:
        f[x], f[y] = t[y].values, t[x].values
    both = pd.concat([t, f], ignore_index=True)
    both["fair"] = no_vig(both["odds_a"], both["odds_b"])
    both = both[both["fair"].notna()]
    both["won"] = both["winner"] == "a"
    both["units"] = np.where(both["won"], payout(both["odds_a"]), -1.0)
    return both


def situations(s):
    cm = 2.54
    fav, dog = s["fair"] > 0.5, s["fair"] < 0.5
    return {
        "Age: fighter 35 or older": s["age_a"] >= 35,
        "Age: 5+ years younger than opponent": s["age_diff"] <= -5,
        "Age: 5+ years younger, as underdog": (s["age_diff"] <= -5) & dog,
        "Age: 35+ as favorite": (s["age_a"] >= 35) & fav,
        "Layoff: back after 15+ months": s["long_layoff_a"] == 1,
        "Layoff: opponent back after 15+ months": s["long_layoff_b"] == 1,
        "Debut: UFC debut": s["debut_a"] == 1,
        "Debut: UFC debut as favorite": (s["debut_a"] == 1) & fav,
        "Debut: facing a debutant, as favorite": (s["debut_b"] == 1) & fav,
        "Weight: moving up a division": s["wc_change_a"] > 0,
        "Weight: moving down a division": s["wc_change_a"] < 0,
        "Reach: 3+ inches longer, as underdog": (s["reach_diff"] >= 3 * cm) & dog,
        "Reach: 3+ inches longer, as favorite": (s["reach_diff"] >= 3 * cm) & fav,
        "Stance: southpaw vs orthodox": (s["southpaw_a"] == 1) & (s["southpaw_b"] == 0),
        "Form: lost last fight by KO": s["ko_loss_last_a"] == 1,
        "Form: lost last fight by KO, as favorite": (s["ko_loss_last_a"] == 1) & fav,
        "Form: opponent lost last fight by KO": s["ko_loss_last_b"] == 1,
        "Form: 4+ fight win streak, as favorite": (s["streak_diff"] >= 4) & fav,
        "Form: on a losing streak, as underdog": (s["recent3_diff"] < -0.3) & dog,
        "Schedule: tougher past opponents (+100 rating), as underdog": (s["sos_a"] - s["sos_b"] >= 100) & dog,
        "Schedule: tougher past opponents (+100 rating), as favorite": (s["sos_a"] - s["sos_b"] >= 100) & fav,
        "Schedule: weaker past opponents (-100 rating), as favorite": (s["sos_a"] - s["sos_b"] <= -100) & fav,
        "Rating: higher rated but the underdog": (s["glicko_logit"] > 0.2) & dog,
        "Rating: lower rated but the favorite": (s["glicko_logit"] < -0.2) & fav,
        "Style: KO power vs fragile chin": (s["ko_rate_diff"] > 0.15) & (s["durability_diff"] > 0.1),
        "Style: KO power vs fragile chin, as underdog": (s["ko_rate_diff"] > 0.15) & (s["durability_diff"] > 0.1) & dog,
        "Style: submission threat vs opponent with sub losses": (s["sub_rate_diff"] > 0.15),
        "Division: heavyweight underdogs": (s["heavyweight"] == 1) & dog,
        "Division: women's favorites": (s["women"] == 1) & fav,
        "Fight: five-round underdog": (s["five_rounds"] == 1) & dog,
        "Fight: title fight underdog": (s["title"] == 1) & dog,
        "Fight: at altitude, favorite": (s["altitude"] == 1) & fav,
        "Price: favorites -400 or shorter": s["odds_a"] <= -400,
        "Price: favorites -150 to -250": (s["odds_a"] <= -150) & (s["odds_a"] > -250),
        "Price: small favorites (-101 to -149)": (s["odds_a"] < -100) & (s["odds_a"] > -150),
        "Price: small underdogs (+100 to +150)": (s["odds_a"] >= 100) & (s["odds_a"] <= 150),
        "Price: big underdogs (+300 or longer)": s["odds_a"] >= 300,
    }


def main():
    t, _ = build(pd.read_csv(path("fights.csv")))
    t = schedule_strength(t)
    s = sides(t)
    rows = []
    for name, mask in situations(s).items():
        row = {"situation": name}
        ok = True
        for label, a, b in PERIODS:
            d = s[mask & (s["date"] >= a) & (s["date"] < b)]
            n = len(d)
            row[f"n {label}"] = n
            row[f"won {label}"] = round(100 * d["won"].mean(), 1) if n else None
            row[f"line said {label}"] = round(100 * d["fair"].mean(), 1) if n else None
            row[f"roi {label}"] = round(100 * d["units"].mean(), 1) if n else None
            if n < MIN_N:
                ok = False
        roi = [row[f"roi {p[0]}"] for p in PERIODS]
        row["verdict"] = ("edge in both periods" if ok and all(r > 0 for r in roi)
                          else "fade in both periods" if ok and all(r < -6 for r in roi)
                          else "too few fights" if not ok else "no consistent edge")
        rows.append(row)
    r = pd.DataFrame(rows)
    r.to_csv(path("edges.csv"), index=False)
    os.makedirs(os.path.join(SITE, "data"), exist_ok=True)
    json.dump({"periods": [p[0] for p in PERIODS], "min_n": MIN_N, "rows": json.loads(r.to_json(orient="records"))},
              open(os.path.join(SITE, "data", "edges.json"), "w"), indent=1)
    pd.set_option("display.width", 250)
    print(r.to_string(index=False))


if __name__ == "__main__":
    main()

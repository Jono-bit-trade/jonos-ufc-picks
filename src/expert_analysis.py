"""Does expert consensus help predict UFC fights beyond the betting line?

Uses data/expert_consensus.csv and data/expert_picks.csv (splitpicks.py), which hold
each bout's result and moneylines as shown on SplitPicks. Writes docs/data/experts.json:
  - how often the consensus pick won, against how often the betting favorite won
  - flat 1-unit bets on the consensus pick, overall and when it disagrees with the line
  - a cross-validated test: does adding consensus to the no-vig line lower log loss?
  - every analyst's record and return per bet

Run:  python src/expert_analysis.py
"""
import json, os
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss
from common import path, SITE, no_vig, payout

OUT = os.path.join(SITE, "data")


def roi(won, odds):
    won, odds = np.asarray(won, bool), np.asarray(odds, float)
    if len(won) == 0:
        return {"bets": 0, "won": 0, "units": 0.0, "roi_pct": None}
    profit = np.where(won, payout(odds), -1.0)
    return {"bets": int(len(won)), "won": int(won.sum()), "units": round(float(profit.sum()), 2),
            "roi_pct": round(100 * float(profit.mean()), 1)}


def main():
    c = pd.read_csv(path("expert_consensus.csv")) if os.path.exists(path("expert_consensus.csv")) else pd.DataFrame()
    if c.empty:
        print("no expert picks yet")
        return
    c = c[c["winner"].isin(["a", "b"]) & c["sp_odds_a"].notna() & c["sp_odds_b"].notna()].copy()
    c["fair_a"] = no_vig(c["sp_odds_a"], c["sp_odds_b"])
    c = c[c["fair_a"].notna()]
    c["y"] = (c["winner"] == "a").astype(int)
    c["n"] = c["picks_a"] + c["picks_b"]
    split = c[c["picks_a"] != c["picks_b"]].copy()
    split["cons_a"] = split["picks_a"] > split["picks_b"]
    cons_won = split["cons_a"] == (split["y"] == 1)
    cons_odds = np.where(split["cons_a"], split["sp_odds_a"], split["sp_odds_b"])
    fav_a = c["fair_a"] > 0.5
    fav_won = fav_a == (c["y"] == 1)
    disagree = split[(split["cons_a"]) != (split["fair_a"] > 0.5)]
    d_won = disagree["cons_a"] == (disagree["y"] == 1)
    d_odds = np.where(disagree["cons_a"], disagree["sp_odds_a"], disagree["sp_odds_b"])

    by_strength = []
    for lo, hi, label in [(0.5, 0.65, "Split (50-65%)"), (0.65, 0.8, "Lean (65-80%)"), (0.8, 1.01, "Strong (80%+)")]:
        share = split[["picks_a", "picks_b"]].max(axis=1) / split["n"]
        m = (share > lo) & (share <= hi) if lo > 0.5 else (share > lo) & (share <= hi)
        sub = split[m]
        w = sub["cons_a"] == (sub["y"] == 1)
        o = np.where(sub["cons_a"], sub["sp_odds_a"], sub["sp_odds_b"])
        line_p = np.where(sub["cons_a"], sub["fair_a"], 1 - sub["fair_a"])
        by_strength.append({"consensus": label, **roi(w, o),
                            "line_expected_pct": round(100 * float(np.mean(line_p)), 1) if len(sub) else None})

    # does consensus add anything to the line? leave-one-card-out cross-validation
    lg = lambda p: np.log(np.clip(p, .01, .99) / (1 - np.clip(p, .01, .99)))
    X1 = lg(c["fair_a"].values).reshape(-1, 1)
    share_a = ((c["picks_a"] + 0.5) / (c["n"] + 1)).values
    X2 = np.c_[X1, lg(share_a)]
    p1, p2 = np.zeros(len(c)), np.zeros(len(c))
    cards = c["slug"].values
    for card in np.unique(cards):
        te, tr = cards == card, cards != card
        p1[te] = LogisticRegression(C=10).fit(X1[tr], c["y"].values[tr]).predict_proba(X1[te])[:, 1]
        p2[te] = LogisticRegression(C=10).fit(X2[tr], c["y"].values[tr]).predict_proba(X2[te])[:, 1]
    full = LogisticRegression(C=10).fit(X2, c["y"].values)
    test = {"bouts": int(len(c)), "cards": int(len(np.unique(cards))),
            "log_loss_line": round(log_loss(c["y"], c["fair_a"]), 4),
            "log_loss_line_refit": round(log_loss(c["y"], p1), 4),
            "log_loss_line_plus_experts": round(log_loss(c["y"], p2), 4),
            "expert_weight": round(float(full.coef_[0][1]), 3)}
    test["helps"] = test["log_loss_line_plus_experts"] < test["log_loss_line_refit"]

    # analysts
    picks = pd.read_csv(path("expert_picks.csv")).drop(columns=["winner", "sp_odds_a", "sp_odds_b"], errors="ignore")
    picks = picks.merge(c[["slug", "bout", "y", "sp_odds_a", "sp_odds_b", "fair_a"]], on=["slug", "bout"])
    picks["on_a"] = picks["pick"] == picks["a"]
    picks["won"] = picks["on_a"] == (picks["y"] == 1)
    picks["odds"] = np.where(picks["on_a"], picks["sp_odds_a"], picks["sp_odds_b"])
    picks["dog"] = np.where(picks["on_a"], picks["fair_a"] < 0.5, picks["fair_a"] > 0.5)
    analysts = []
    for name, g in picks.groupby("analyst"):
        r = roi(g["won"], g["odds"])
        hi = g[g["confidence"].str.lower() == "high"]
        analysts.append({"analyst": name, **r, "win_pct": round(100 * g["won"].mean(), 1),
                         "underdog_picks": int(g["dog"].sum()),
                         "underdogs_won": int((g["dog"] & g["won"]).sum()),
                         "high_confidence": roi(hi["won"], hi["odds"])})
    analysts.sort(key=lambda a: -(a["units"] / max(a["bets"], 1)))

    out = {"source": "SplitPicks (splitpicks.com)", "source_url": "https://splitpicks.com/",
           "first": str(c["date"].min()), "last": str(c["date"].max()),
           "consensus": {**roi(cons_won, cons_odds), "win_pct": round(100 * cons_won.mean(), 1)},
           "favorites": {"bouts": int(len(c)), "won_pct": round(100 * fav_won.mean(), 1)},
           "against_the_line": {**roi(d_won, d_odds),
                                "note": "consensus pick was the betting underdog"},
           "by_strength": by_strength, "test": test, "analysts": analysts}
    json.dump(out, open(os.path.join(OUT, "experts.json"), "w"), indent=1)
    print(json.dumps({k: out[k] for k in ["consensus", "favorites", "against_the_line", "test"]}, indent=1))
    print(pd.DataFrame(by_strength).to_string(index=False))
    print(pd.DataFrame(analysts).drop(columns=["high_confidence"]).to_string(index=False))


if __name__ == "__main__":
    main()

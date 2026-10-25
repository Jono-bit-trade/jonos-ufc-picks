"""Step 6: turn features into a win probability for fighter A.

Two learners, blended:
  - logistic regression: steady, hard to overfit with ~7,000 fights
  - gradient boosting: can find interactions (age x layoff, heavyweight x KO power)
The betting line is never an input, so the model stays an independent opinion.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from features import CORE, FORM, CONTEXT, STYLE, flip

GROUPS = {
    "glicko_only": ["glicko_logit"],
    "core": CORE,
    "core+form": CORE + FORM,
    "core+form+context": CORE + FORM + CONTEXT,
    "all": CORE + FORM + CONTEXT + STYLE,
}


def recency_weights(dates):
    """Recent fights count more: a fight TRAIN_HALF_LIFE_YEARS older than the newest counts half.
    (Tested 3 and 6 years against equal weights on 2018-2026: 3 years lowered log loss most.)"""
    from config import TRAIN_HALF_LIFE_YEARS
    if not TRAIN_HALF_LIFE_YEARS:
        return None
    d = pd.to_datetime(dates)
    age = (d.max() - d).dt.days / 365.25
    return (0.5 ** (age / TRAIN_HALF_LIFE_YEARS)).values


def labelled(t):
    """Fights with a winner, seen from both corners."""
    d = t[t["winner"].isin(["a", "b"])]
    both = pd.concat([d, flip(d)], ignore_index=True)
    return both, (both["winner"] == "a").astype(int)


def make(kind):
    if kind == "logistic":
        return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                             LogisticRegression(C=0.3, max_iter=2000))
    return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.03, max_iter=300,
                                          min_samples_leaf=80, l2_regularization=1.0)


class WinModel:
    def __init__(self, features, kind="blend", w_logistic=0.6):
        self.features, self.kind, self.w = features, kind, w_logistic

    def fit(self, t):
        X, y = labelled(t)
        w = recency_weights(X["date"])
        self.m = {}
        if self.kind in ("logistic", "blend"):
            self.m["logistic"] = make("logistic").fit(X[self.features], y, logisticregression__sample_weight=w)
        if self.kind in ("boost", "blend") and len(self.features) > 1:
            self.m["boost"] = make("boost").fit(X[self.features], y, sample_weight=w)
        return self

    def _raw(self, X):
        ps = {k: m.predict_proba(X[self.features])[:, 1] for k, m in self.m.items()}
        if len(ps) == 1:
            return next(iter(ps.values()))
        return self.w * ps["logistic"] + (1 - self.w) * ps["boost"]

    def predict(self, t):
        """P(A wins), averaged over both corner orders so it is exactly symmetric."""
        return (self._raw(t) + 1 - self._raw(flip(t))) / 2


# ---- method of victory (KO / submission / decision), for side markets ----
METHOD_FEATURES = ["glicko_logit", "ko_rate_diff", "sub_rate_diff", "durability_diff",
                   "dec_rate_sum", "avg_mins_sum", "five_rounds", "heavyweight", "women",
                   "rd_a", "rd_b", "exp_diff"]


class MethodModel:
    """P(fight ends by KO), P(SUB), P(DEC). Combine with the win model for
    'A by KO' style prices: P(A wins) x P(KO | A wins) is approximated as P(A wins) x P(KO)."""
    def fit(self, t):
        d = t[t["method"].isin(["KO", "SUB", "DEC"]) & t["winner"].isin(["a", "b"])]
        d = pd.concat([d, flip(d)], ignore_index=True)
        self.m = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                               LogisticRegression(C=0.3, max_iter=2000))
        self.m.fit(d[METHOD_FEATURES], d["method"])
        return self

    def predict(self, t):
        p = (self.m.predict_proba(t[METHOD_FEATURES]) + self.m.predict_proba(flip(t)[METHOD_FEATURES])) / 2
        return pd.DataFrame(p, columns=self.m.classes_, index=t.index)


# ---- market blend: the last step, AFTER the model is built ----
SITUATIONS = ["layoff", "bigdog"]


def situations(df):
    """Two situations the line has misjudged in both 2013-2019 and 2020-2026 (src/edges.py),
    and that lowered the blend's log loss in both 2018-2023 and 2024-2026:
      layoff: back after 15+ months (fighters returning from long layoffs win less than priced)
      bigdog: +300 or longer underdogs (win less often than their odds imply)
    Each is +1 for fighter A, -1 for fighter B, 0 for neither or both."""
    la = pd.to_numeric(df.get("long_layoff_a", 0), errors="coerce").fillna(0)
    lb = pd.to_numeric(df.get("long_layoff_b", 0), errors="coerce").fillna(0)
    oa = pd.to_numeric(df.get("odds_a"), errors="coerce")
    ob = pd.to_numeric(df.get("odds_b"), errors="coerce")
    return pd.DataFrame({"layoff": (la - lb).values,
                         "bigdog": ((oa >= 300).astype(int) - (ob >= 300).astype(int)).values})


class MarketBlend:
    """Logistic regression on [market log-odds, model log-odds, situations], fit on
    walk-forward predictions only. The market stays out of the model itself; this step asks
    how much of the model's disagreement with the line has historically been right."""
    def fit(self, p_market, p_model, y, extra=None):
        self.m = LogisticRegression(C=1.0).fit(self._x(p_market, p_model, extra), y)
        return self

    @staticmethod
    def _x(pm, pp, extra=None):
        lg = lambda p: np.log(np.clip(p, 0.01, 0.99) / (1 - np.clip(p, 0.01, 0.99)))
        x = np.c_[lg(np.asarray(pm, float)), lg(np.asarray(pp, float))]
        return np.c_[x, np.asarray(extra, float)] if extra is not None else x

    def predict(self, p_market, p_model, extra=None):
        return self.m.predict_proba(self._x(p_market, p_model, extra))[:, 1]

    def weights(self):
        c = self.m.coef_[0]
        w = {"market": round(float(c[0]), 4), "model": round(float(c[1]), 4)}
        for i, k in enumerate(SITUATIONS[:len(c) - 2]):
            w[k] = round(float(c[2 + i]), 4)
        return w

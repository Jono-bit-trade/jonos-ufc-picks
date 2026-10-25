"""Step 3: Glicko-2 fighter ratings.

Walks every fight oldest-first and records each fighter's rating BEFORE the fight,
so nothing a fight shows can leak into its own prediction.
Rating deviation (RD) is the rating's uncertainty: it starts high for debutants,
shrinks as a fighter fights, and grows again during layoffs.
"""
import math
import pandas as pd

SCALE = 173.7178


class Glicko2:
    def __init__(self, tau=0.5, start_rd=200.0, start_vol=0.06, days_per_period=90,
                 max_rd=350.0, debut_rating=1500.0):
        self.tau, self.start_rd, self.start_vol = tau, start_rd, start_vol
        self.days, self.max_phi = days_per_period, max_rd / SCALE
        self.debut = debut_rating
        self.p = {}   # name -> [mu, phi, sigma, last_date]

    @staticmethod
    def g(phi):
        return 1 / math.sqrt(1 + 3 * phi ** 2 / math.pi ** 2)

    def state(self, name, date):
        """Rating, deviation and volatility right before a fight on `date`."""
        if name not in self.p:
            return (self.debut - 1500) / SCALE, self.start_rd / SCALE, self.start_vol
        mu, phi, sig, last = self.p[name]
        t = max((date - last).days, 0) / self.days
        phi = min(math.sqrt(phi ** 2 + sig ** 2 * t), self.max_phi)   # layoff widens RD
        return mu, phi, sig

    def win_prob(self, a, b, date):
        mu_a, phi_a, _ = self.state(a, date)
        mu_b, phi_b, _ = self.state(b, date)
        return 1 / (1 + math.exp(-self.g(math.sqrt(phi_a ** 2 + phi_b ** 2)) * (mu_a - mu_b)))

    def _update(self, mu, phi, sig, mu_o, phi_o, s):
        g = self.g(phi_o)
        e = 1 / (1 + math.exp(-g * (mu - mu_o)))
        v = 1 / (g ** 2 * e * (1 - e))
        delta = v * g * (s - e)
        # new volatility (Glickman's iterative procedure)
        a = math.log(sig ** 2)
        f = lambda x: (math.exp(x) * (delta ** 2 - phi ** 2 - v - math.exp(x))
                       / (2 * (phi ** 2 + v + math.exp(x)) ** 2) - (x - a) / self.tau ** 2)
        A = a
        if delta ** 2 > phi ** 2 + v:
            B = math.log(delta ** 2 - phi ** 2 - v)
        else:
            k = 1
            while f(a - k * self.tau) < 0:
                k += 1
            B = a - k * self.tau
        fa, fb = f(A), f(B)
        for _ in range(100):
            if abs(B - A) < 1e-6:
                break
            C = A + (A - B) * fa / (fb - fa)
            fc = f(C)
            if fc * fb <= 0:
                A, fa = B, fb
            else:
                fa /= 2
            B, fb = C, fc
        sig2 = math.exp(A / 2)
        phi_star = math.sqrt(phi ** 2 + sig2 ** 2)
        phi2 = 1 / math.sqrt(1 / phi_star ** 2 + 1 / v)
        mu2 = mu + phi2 ** 2 * g * (s - e)
        return mu2, phi2, sig2

    def play(self, a, b, score_a, date):
        """score_a: 1 win, 0 loss, 0.5 draw."""
        mu_a, phi_a, sig_a = self.state(a, date)
        mu_b, phi_b, sig_b = self.state(b, date)
        na = self._update(mu_a, phi_a, sig_a, mu_b, phi_b, score_a)
        nb = self._update(mu_b, phi_b, sig_b, mu_a, phi_a, 1 - score_a)
        self.p[a] = [*na, date]
        self.p[b] = [*nb, date]


# How much a win counts, by how it happened (1.0 = full win, 0.5 = draw).
# A split decision is close to a coin flip on the judges' cards, so it moves ratings less.
from config import WIN_SCORE, GLICKO


def pre_fight_ratings(fights, win_score=None, **settings):
    """One row per fight: both fighters' ratings before it, and the Glicko win probability.
    Also returns the rating object, which holds everyone's state after the last fight."""
    G = Glicko2(**{**GLICKO, **settings})
    ws = WIN_SCORE if win_score is None else win_score
    rows = []
    for f in fights.itertuples():
        d = pd.Timestamp(f.date)
        mu_a, phi_a, _ = G.state(f.a, d)
        mu_b, phi_b, _ = G.state(f.b, d)
        rows.append({"fight_id": f.fight_id,
                     "rating_a": 1500 + SCALE * mu_a, "rd_a": SCALE * phi_a,
                     "rating_b": 1500 + SCALE * mu_b, "rd_b": SCALE * phi_b,
                     "p_glicko": G.win_prob(f.a, f.b, d)})
        w = ws.get(getattr(f, "finish", None), 1.0)
        score = {"a": w, "b": 1 - w, "draw": 0.5}.get(f.winner)
        if score is not None:   # no contests change nothing
            G.play(f.a, f.b, score, d)
    return pd.DataFrame(rows), G


def table(G, as_of):
    """Everyone's current rating, for the site's rankings page."""
    d = pd.Timestamp(as_of)
    out = []
    for name in G.p:
        mu, phi, _ = G.state(name, d)
        out.append({"fighter": name, "rating": round(1500 + SCALE * mu),
                    "rd": round(SCALE * phi), "last_fight": G.p[name][3].strftime("%Y-%m-%d")})
    return pd.DataFrame(out).sort_values("rating", ascending=False)


if __name__ == "__main__":
    from common import path
    fights = pd.read_csv(path("fights.csv"))
    r, G = pre_fight_ratings(fights)
    t = table(G, fights["date"].max())
    active = t[t["last_fight"] >= str(pd.Timestamp(fights["date"].max()) - pd.Timedelta(days=550))[:10]]
    print(active.head(25).to_string(index=False))

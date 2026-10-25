"""Shared paths and helpers."""
import os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SITE = os.path.join(ROOT, "docs")   # GitHub Pages serves this folder
os.makedirs(DATA, exist_ok=True)
os.makedirs(SITE, exist_ok=True)


def path(*parts):
    return os.path.join(DATA, *parts)


def implied(american):
    """American odds -> implied probability (still includes the bookmaker's cut)."""
    a = np.asarray(american, dtype=float)
    a = np.where(np.abs(a) < 100, np.nan, a)   # valid American odds are <= -100 or >= +100
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(a < 0, -a / (-a + 100), 100 / (a + 100))


def no_vig(odds_a, odds_b):
    """Fair probability for fighter A after removing the bookmaker's cut."""
    pa, pb = implied(odds_a), implied(odds_b)
    return pa / (pa + pb)


def payout(american):
    """Profit on a 1-unit stake if the bet wins."""
    a = np.asarray(american, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(a < 0, 100 / -a, a / 100)


def to_american(p):
    """Probability -> fair American odds, for display."""
    p = float(p)
    if p <= 0 or p >= 1:
        return None
    return round(-100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)


def api_key(name, file="key.txt"):
    """Read a key from an environment variable, else from key.txt."""
    if os.environ.get(name):
        return os.environ[name].strip()
    f = os.path.join(ROOT, file)
    return open(f).read().strip() if os.path.exists(f) else None

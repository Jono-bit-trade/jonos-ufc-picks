"""Public betting splits for UFC fights from DraftKings Network's free splits page: for each
fighter's moneyline, the share of money (% handle) and the share of bets (% bets).

When the money and the bets disagree (few bets but a lot of money on one side), the bigger,
usually sharper bettors are on that side. Whether that predicts anything beyond the closing line
is the test once enough cards are logged; the page only shows upcoming fights, so the history
starts now. Each run appends a snapshot to data/splits_history.csv; robots.txt allows the page.

Run:  python src/dk_splits.py
"""
import datetime as dt, os, re
import pandas as pd
import requests
from bs4 import BeautifulSoup
from common import path
from config import OFFLINE

URL = "https://dknetwork.draftkings.com/draftkings-sportsbook-betting-splits/"
PARAMS = {"tb_eg": "9034", "tb_edate": "n30days", "tb_emt": "Moneyline"}   # 9034 = DraftKings' UFC group
NUM = lambda t: float(t.replace("−", "-").replace("+", "").replace("%", "").strip())


def parse(html):
    """Rows: title, when, fighter, odds, handle (0-1), bets (0-1)."""
    soup = BeautifulSoup(html, "lxml")
    for x in soup(["script", "style", "noscript"]):
        x.decompose()
    toks = [t.strip() for t in soup.get_text("|").split("|") if t.strip()]
    rows = []
    for i, t in enumerate(toks):
        m = re.fullmatch(r"(.+?) vs\.? (.+)", t)
        if not m or i + 1 >= len(toks) or not re.match(r"\d{1,2}/\d{1,2}", toks[i + 1]):
            continue
        try:
            j = toks.index("% Bets", i) + 1          # the two fighter rows follow the headers
        except ValueError:
            continue
        for k in (0, 4):
            name, o, h, b = toks[j + k: j + k + 4]
            if not (h.endswith("%") and b.endswith("%")):
                break
            rows.append({"title": t, "when": toks[i + 1], "fighter": name, "odds": NUM(o),
                         "handle": NUM(h) / 100, "bets": NUM(b) / 100})
    return pd.DataFrame(rows)


def main():
    if OFFLINE:
        return
    r = requests.get(URL, params=PARAMS, timeout=30, headers={"User-Agent": "Mozilla/5.0 (compatible; jonos-ufc-picks)"})
    r.raise_for_status()
    rows = parse(r.text)
    if rows.empty:   # the page changed: keep it so the parser can be fixed
        os.makedirs(path("raw"), exist_ok=True)
        open(path("raw", "dk_splits.html"), "w").write(r.text)
        print("DraftKings splits: no fights parsed (page saved to data/raw/dk_splits.html)")
        return
    rows["snapshot"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    f = path("splits_history.csv")
    rows.to_csv(f, mode="a", header=not os.path.exists(f), index=False)
    print(f"DraftKings splits: {rows['title'].nunique()} fights")


if __name__ == "__main__":
    main()

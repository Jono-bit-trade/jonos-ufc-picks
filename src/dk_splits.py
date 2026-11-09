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
    """Rows: title, when, fighter, odds, handle (0-1), bets (0-1). Works on both page layouts seen so far:
    'Title | 11/7, 08:45PM | ... % Bets | name | odds | x% | y% ...' and (Nov 2026)
    'Title | Sat 11/14 · 5:00 PM ET | Selection | Odds | Handle | Bets | Moneyline | name | odds | x% | y% ...'"""
    soup = BeautifulSoup(html, "lxml")
    for x in soup(["script", "style", "noscript"]):
        x.decompose()
    toks = [t.strip() for t in soup.get_text("|").split("|") if t.strip()]
    odds_re = re.compile(r"[+\-−]\d{3,5}|EVEN|even")
    pct_re = re.compile(r"\d{1,3}(\.\d+)?%")
    rows = []
    for i, t in enumerate(toks):
        m = re.fullmatch(r"(.+?) vs\.? (.+)", t)
        if not m or i + 1 >= len(toks) or not re.search(r"\d{1,2}/\d{1,2}", toks[i + 1]):
            continue
        got, j = [], i + 2
        while j + 3 < len(toks) and len(got) < 2 and j < i + 40:   # the two fighter rows that follow
            if re.fullmatch(r"(.+?) vs\.? (.+)", toks[j]) and re.search(r"\d{1,2}/\d{1,2}", toks[j + 1] if j + 1 < len(toks) else ""):
                break   # next fight
            name, o, h, b = toks[j: j + 4]
            if odds_re.fullmatch(o) and pct_re.fullmatch(h) and pct_re.fullmatch(b):
                got.append({"title": t, "when": toks[i + 1], "fighter": name,
                            "odds": 100.0 if o.lower() == "even" else NUM(o), "handle": NUM(h) / 100, "bets": NUM(b) / 100})
                j += 4
            else:
                j += 1
        if len(got) == 2:
            rows += got
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

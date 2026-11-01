"""The official UFC rankings: each division's champion and top 15, plus pound-for-pound.

One request to UFC.com's rankings page (robots.txt allows it; its 15-second crawl delay is
irrelevant for a single page). Only the facts are kept: division, rank (0 = champion), name and
the fighter's UFC.com athlete slug, in data/ufc_rankings.csv. If the page can't be read or
parsed, the last saved rankings stay.

Run:  python src/ufc_rankings.py
"""
import datetime as dt, re, sys
import pandas as pd
import requests
from bs4 import BeautifulSoup
from common import path

URL = "https://www.ufc.com/rankings"
OUT = "ufc_rankings.csv"
UA = "Mozilla/5.0 (compatible; jonos-ufc-picks; +https://github.com/Jono-bit-trade/jonos-ufc-picks)"


def athlete_slug(href):
    m = re.search(r"/athlete/([^/?#]+)", str(href or ""))
    return m.group(1) if m else None


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for g in soup.select(".view-grouping"):
        head = g.select_one(".view-grouping-header")
        div = re.sub(r"\s+", " ", head.get_text(" ", strip=True)).strip() if head else ""
        if not div:
            continue
        div = re.sub(r"\s*Top Rank$", "", div)                  # "Men's Pound-for-Pound Top Rank"
        champ = g.select_one(".rankings--athlete--champion h5 a") or g.select_one("h5 a")
        if champ and "pound" not in div.lower():
            rows.append({"division": div, "rank": 0, "name": champ.get_text(strip=True), "ufc_slug": athlete_slug(champ.get("href"))})
        for tr in g.select("tbody tr"):
            tds = tr.find_all("td")
            a = tr.find("a")
            if not tds or not a:
                continue
            m = re.match(r"\d+", tds[0].get_text(strip=True))
            if m:
                rows.append({"division": div, "rank": int(m.group()), "name": a.get_text(strip=True), "ufc_slug": athlete_slug(a.get("href"))})
    return pd.DataFrame(rows)


def main():
    try:
        r = requests.get(URL, headers={"User-Agent": UA}, timeout=30)
        r.raise_for_status()
        d = parse(r.text)
    except Exception as e:
        print("UFC rankings unavailable:", type(e).__name__, e)
        return
    divs = d["division"].nunique() if len(d) else 0
    if divs < 8:   # page layout changed or partial: keep the last good copy
        print(f"UFC rankings: only {divs} divisions parsed, keeping the saved copy")
        return
    d["as_of"] = dt.date.today().isoformat()
    d.to_csv(path(OUT), index=False)
    print(f"{OUT}: {len(d)} entries in {divs} divisions ({', '.join(d['division'].unique()[:4])}, ...)")


if __name__ == "__main__":
    main()

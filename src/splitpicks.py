"""Expert picks from SplitPicks (splitpicks.com), a community aggregator of UFC analysts' picks.

Step 1 (fetch): saves the events list and each event page to data/raw/splitpicks/,
politely (robots.txt respected, 2 seconds apart). Past events are fetched once;
upcoming ones are refreshed every run, since picks keep coming in during fight week.
Step 2 (parse): turns the saved pages into data/expert_picks.csv, one row per
predictor per bout, and data/expert_consensus.csv, one row per bout.

Run:  python src/splitpicks.py          (fetch, then parse)
      python src/splitpicks.py --parse  (parse saved pages only)
"""
import os, re, sys, time, json
import urllib.robotparser
import requests
import pandas as pd
from bs4 import BeautifulSoup
from common import path
from config import OFFLINE

BASE = "https://splitpicks.com"
RAW = path("raw", "splitpicks")
UA = "jonos-ufc-picks (personal research; github.com/Jono-bit-trade/jonos-ufc-picks)"
S = requests.Session()
S.headers["User-Agent"] = UA


def allowed():
    rp = urllib.robotparser.RobotFileParser()
    try:
        r = S.get(BASE + "/robots.txt", timeout=20)
        rp.parse(r.text.splitlines() if r.ok else [])
    except requests.RequestException:
        rp.parse([])
    return rp


def fetch():
    os.makedirs(RAW, exist_ok=True)
    rp = allowed()
    if not rp.can_fetch(UA, BASE + "/events.html"):
        print("SplitPicks robots.txt disallows fetching: skipped")
        return
    r = S.get(BASE + "/events.html", timeout=30)
    r.raise_for_status()
    open(os.path.join(RAW, "events.html"), "w", encoding="utf-8").write(r.text)
    soup = BeautifulSoup(r.text, "lxml")
    links = []
    for a in soup.select("a[href*='events/']"):
        href = a["href"]
        url = href if href.startswith("http") else BASE + "/" + href.lstrip("/")
        if url.endswith(".html") and url not in links:
            links.append(url)
    upcoming = set(links[:8])   # the page lists upcoming cards first: refresh those every run
    n = 0
    for url in links:
        name = url.rsplit("/", 1)[-1]
        f = os.path.join(RAW, name)
        if os.path.exists(f) and url not in upcoming:
            continue
        if not rp.can_fetch(UA, url):
            continue
        try:
            p = S.get(url, timeout=30)
            p.raise_for_status()
        except requests.RequestException as e:
            print("failed", url, e)
            continue
        open(f, "w", encoding="utf-8").write(p.text)
        n += 1
        time.sleep(2)
    print(f"SplitPicks: {len(links)} events listed, {n} pages saved")


if __name__ == "__main__":
    if "--parse" not in sys.argv and not OFFLINE:
        fetch()
    try:
        from splitpicks_parse import parse_all
        parse_all()
    except ImportError:
        print("parser not written yet: pages saved for review")

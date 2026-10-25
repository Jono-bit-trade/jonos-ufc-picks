"""Expert picks from SplitPicks (splitpicks.com), a community aggregator of UFC analysts' picks.

Each event page lists, for every bout, which analysts picked which fighter, with a
confidence level and sometimes a method. This saves only those facts, not the pages:
  data/expert_picks.csv       one row per analyst per bout
  data/expert_consensus.csv   one row per bout: picks per side, high-confidence picks per side

Polite by design: robots.txt is respected, pages are fetched 2 seconds apart, a finished
card is fetched once, and only upcoming cards are refreshed (their picks keep coming in).
Credit: the site shows "Data from SplitPicks" with a link on every card that uses it.

Run:  python src/splitpicks.py
"""
import os, re, sys, time, datetime as dt
import urllib.robotparser
import requests
import pandas as pd
from bs4 import BeautifulSoup
from common import path
from config import OFFLINE

BASE = "https://splitpicks.com"
UA = "jonos-ufc-picks (personal research; github.com/Jono-bit-trade/jonos-ufc-picks)"
S = requests.Session()
S.headers["User-Agent"] = UA


def header_facts(soup, fid, names):
    """Winner and the moneylines shown in a bout's header (the block holding both names)."""
    lab = soup.select_one(f"#expand-label-{fid}")
    el = lab
    while el is not None:
        el = el.find_parent("div")
        if el is not None and names[0] in el.get_text() and names[1] in el.get_text() and "VS" in el.get_text():
            break
    if el is None:
        return None, (None, None)
    toks = [t for t in el.stripped_strings]
    winner, odds = None, [None, None]
    for k, n in enumerate(names):
        if n not in toks:
            continue
        i = toks.index(n)
        nxt = toks[i + 1:i + 5]
        if any("Winner" in t for t in nxt[:1]):
            winner = "ab"[k]
        for t in nxt:
            if re.fullmatch(r"[+-]\d{3,4}", t):
                odds[k] = int(t)
                break
    return winner, tuple(odds)


def parse_event(html, slug):
    """[(row dict), ...] for every analyst pick on one event page."""
    soup = BeautifulSoup(html, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else ""
    event = re.sub(r"^SplitPicks\s*·\s*", "", title)
    m = re.search(r"\b(20\d\d-\d\d-\d\d)\b", soup.get_text(" ", strip=True))
    date = m.group(1) if m else None
    rows = []
    for block in soup.select("div[id^='f']"):
        if not re.fullmatch(r"f\d+", block.get("id", "")):
            continue
        grid = block.find("div")
        sides = grid.find_all("div", recursive=False) if grid else []
        if len(sides) != 2:
            continue
        names = []
        for side in sides:
            head = side.find("div")
            hm = re.match(r"^(.*?)\s*·\s*(\d+)$", head.get_text(" ", strip=True)) if head else None
            names.append(hm.group(1).strip() if hm else None)
        if not all(names):
            continue
        winner, odds = header_facts(soup, block["id"], names)
        for k, side in enumerate(sides):
            for a in side.find_all("a", recursive=False):
                parts = [t for t in a.stripped_strings]
                if len(parts) < 4:
                    continue
                pick_text = parts[3]
                method = pick_text.split("·", 1)[1].strip() if "·" in pick_text else None
                rows.append({"slug": slug, "event": event, "date": date, "bout": block["id"],
                             "a": names[0], "b": names[1], "analyst": parts[1], "confidence": parts[2],
                             "pick": names[k], "method": method, "winner": winner,
                             "sp_odds_a": odds[0], "sp_odds_b": odds[1]})
    return rows


def consensus(picks):
    if picks.empty:
        return picks
    p = picks.copy()
    p["on_a"] = (p["pick"] == p["a"]).astype(int)
    p["high_any"] = p["confidence"].astype(str).str.lower().eq("high").astype(int)
    p["high_a"] = p["high_any"] * p["on_a"]
    for col in ["winner", "sp_odds_a", "sp_odds_b"]:
        if col not in p:
            p[col] = None
    c = p.groupby(["slug", "event", "date", "bout", "a", "b"], as_index=False, dropna=False).agg(
        winner=("winner", "first"), sp_odds_a=("sp_odds_a", "first"), sp_odds_b=("sp_odds_b", "first"),
        picks_a=("on_a", "sum"), picks=("on_a", "size"), high_a=("high_a", "sum"), high=("high_any", "sum"))
    c["picks_b"] = c["picks"] - c["picks_a"]
    c["high_b"] = c["high"] - c["high_a"]
    c["share_a"] = (c["picks_a"] / c["picks"]).round(3)
    return c.drop(columns=["picks", "high"])


def fetch():
    rp = urllib.robotparser.RobotFileParser()
    try:
        r = S.get(BASE + "/robots.txt", timeout=20)
        rp.parse(r.text.splitlines() if r.ok else [])
    except requests.RequestException:
        rp.parse([])
    if not rp.can_fetch(UA, BASE + "/events.html"):
        print("SplitPicks robots.txt disallows fetching: skipped")
        return
    r = S.get(BASE + "/events.html", timeout=30)
    r.raise_for_status()
    links = []
    for a in BeautifulSoup(r.text, "lxml").select("a[href*='events/']"):
        if a.find_parent(attrs={"aria-hidden": "true"}) or "display:none" in (a.get("style") or ""):
            continue   # hidden links are traps for bots, not real events
        url = a["href"] if a["href"].startswith("http") else BASE + "/" + a["href"].lstrip("./")
        if url.endswith(".html") and url not in links:
            links.append(url)
    f = path("expert_picks.csv")
    old = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame(columns=["slug", "date"])
    yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    finished = set(old.loc[old["date"].astype(str) < yesterday, "slug"])
    new = []
    for url in links:
        slug = url.rsplit("/", 1)[-1].replace(".html", "")
        if slug in finished or not rp.can_fetch(UA, url):
            continue
        try:
            p = S.get(url, timeout=30)
            p.raise_for_status()
        except requests.RequestException as e:
            print("failed", url, e)
            continue
        new += parse_event(p.text, slug)
        time.sleep(2)
    if new:
        fresh = pd.DataFrame(new)
        old = old[~old["slug"].isin(fresh["slug"])]   # refreshed cards replace their old picks
        allp = pd.concat([old, fresh], ignore_index=True)
        allp.to_csv(f, index=False)
    allp = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()
    consensus(allp).to_csv(path("expert_consensus.csv"), index=False)
    print(f"SplitPicks: {len(links)} events listed, {len(set(r['slug'] for r in new))} fetched, "
          f"{len(allp)} analyst picks saved")


if __name__ == "__main__":
    if not OFFLINE:
        fetch()

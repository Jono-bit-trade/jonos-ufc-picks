"""Career grappling numbers from each fighter's UFC.com athlete page.

UFC.com shows takedown defense (which no other free source here has), takedowns and
submission attempts per 15 minutes, and strike defense. Only those numbers are kept
(data/ufc_athletes.csv), not the pages.

Polite: robots.txt allows /athlete/ pages and asks for 15 seconds between requests, so
that's the pace. Fighters on the next card come first, then recently active fighters whose
numbers are missing or more than REFRESH_DAYS old. Each run stops after `minutes`.

Run:  python src/ufc_athletes.py [minutes]   (default 8)
"""
import datetime as dt, os, re, sys, time, unicodedata
import pandas as pd
import requests
from bs4 import BeautifulSoup
from common import path, SITE

DELAY = 15            # seconds between requests (UFC.com robots.txt crawl-delay)
REFRESH_DAYS = 30
OUT = "ufc_athletes.csv"
LABELS = {            # our column: the label UFC.com prints under the number
    "td_per15": "takedown avg",
    "td_def": "takedown defense",
    "sub_per15": "submission avg",
    "str_def": "sig. str. defense",
}
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (compatible; jonos-ufc-picks; +https://github.com/Jono-bit-trade/jonos-ufc-picks)"


def ufc_slug(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'’]", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def parse(html):
    """{column: value} from an athlete page. Each stat is a number followed by its label;
    percentages come as 0-1."""
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    toks = [t.strip() for t in soup.get_text("|").split("|")]
    toks = [t for t in toks if t]
    low = [t.lower().rstrip(":") for t in toks]
    out = {}
    for col, label in LABELS.items():
        for i, t in enumerate(low):
            if t != label:
                continue
            for j in range(i - 1, max(i - 4, -1), -1):       # the number sits just before its label
                m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(%?)", toks[j])
                if m:
                    pct = m.group(2) == "%" or (j + 1 < i and toks[j + 1] == "%") or "defense" in label or "accuracy" in label
                    v = float(m.group(1))
                    out[col] = v / 100 if pct and v > 1 else v
                    break
            if col in out:
                break
    rec = re.search(r"\b(\d+)-(\d+)-(\d+)\s*\(W-L-D\)", soup.get_text(" "))
    if rec:
        out["record"] = "-".join(rec.groups())
    return out


def fetch(name):
    url = f"https://www.ufc.com/athlete/{ufc_slug(name)}"
    try:
        r = S.get(url, timeout=30)
    except requests.RequestException as e:
        return {"status": type(e).__name__, "url": url}
    if r.status_code != 200:
        return {"status": str(r.status_code), "url": url}
    got = parse(r.text)
    return got | {"status": "ok" if got else "no stats", "url": url}


def todo():
    """Next-card fighters first, then fighters active in the last two years."""
    names = []
    up = path("espn_card.csv")
    if os.path.exists(up):
        c = pd.read_csv(up)
        names += list(c["a"]) + list(c["b"])
    f = pd.read_csv(path("fights.csv"))
    recent = f[f["date"] >= (dt.date.today() - dt.timedelta(days=730)).isoformat()].sort_values("date", ascending=False)
    names += list(recent["a"]) + list(recent["b"])
    return list(dict.fromkeys(n for n in names if isinstance(n, str)))


def main(minutes=8):
    f = path(OUT)
    have = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame(columns=["name", "fetched"])
    fresh = set(have.loc[pd.to_datetime(have["fetched"]) > pd.Timestamp.now() - pd.Timedelta(days=REFRESH_DAYS), "name"])
    queue = [n for n in todo() if n not in fresh]
    print(f"{len(queue)} fighters to fetch")
    stop, rows, seen = time.time() + minutes * 60, [], {}
    for n in queue:
        if time.time() > stop:
            break
        r = fetch(n)
        seen[r["status"]] = seen.get(r["status"], 0) + 1
        rows.append({"name": n, "fetched": dt.date.today().isoformat()} | r)
        time.sleep(DELAY)
    if rows:
        have = pd.concat([have[~have["name"].isin([r["name"] for r in rows])], pd.DataFrame(rows)], ignore_index=True)
        have.to_csv(f, index=False)
    print(f"fetched {len(rows)}: {seen}; {int((have.get('status') == 'ok').sum())} fighters with UFC.com numbers")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 8)

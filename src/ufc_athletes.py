"""Career grappling numbers from each fighter's UFC.com athlete page.

UFC.com shows each fighter's career numbers: significant strikes landed and absorbed per
minute, striking accuracy and defense, takedowns and submission attempts per 15 minutes,
takedown defense (which no other free source here has), knockdowns, average fight time, and
where they land strikes (head/body/leg, standing/clinch/ground). Only those numbers are kept
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
BEFORE = {            # our column: label UFC.com prints just AFTER the number
    "slpm": "sig. str. landed",          # per minute
    "sapm": "sig. str. absorbed",        # per minute
    "td_per15": "takedown avg",
    "sub_per15": "submission avg",
    "str_def": "sig. str. defense",
    "td_def": "takedown defense",
    "kd_per15": "knockdown avg",
    "avg_time": "average fight time",    # m:ss -> minutes
    "head": "head", "body": "body", "leg": "leg",   # sig. strikes landed by target
}
AFTER = {             # label printed just BEFORE the number
    "sig_landed": "sig. strikes landed", "sig_att": "sig. strikes attempted",
    "standing": "standing", "clinch": "clinch", "ground": "ground",   # sig. strikes landed by position
}
PCT = {"str_def", "td_def"}
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (compatible; jonos-ufc-picks; +https://github.com/Jono-bit-trade/jonos-ufc-picks)"


def ufc_slug(name):
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'’]", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def _num(tok):
    tok = tok.strip()
    m = re.fullmatch(r"(\d+):(\d\d)", tok)
    if m:
        return int(m.group(1)) + int(m.group(2)) / 60
    m = re.match(r"(\d+(?:\.\d+)?)\s*%?(?:\s*\(\d+%\))?$", tok)
    return float(m.group(1)) if m else None


def parse(html):
    """{column: value} from an athlete page. Percentages come as 0-1."""
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    toks = [t.strip() for t in soup.get_text("|").split("|")]
    toks = [t for t in toks if t]
    low = [t.lower().rstrip(":") for t in toks]
    out = {}
    for col, label in list(BEFORE.items()) + list(AFTER.items()):
        before = col in BEFORE
        for i, t in enumerate(low):
            if t != label:
                continue
            near = range(i - 1, max(i - 4, -1), -1) if before else range(i + 1, min(i + 4, len(toks)))
            for j in near:
                v = _num(toks[j])
                if v is not None:
                    out[col] = round(v / 100 if col in PCT and v > 1 else v, 4)
                    break
            if col in out:
                break
    if out.get("sig_att"):
        out["str_acc"] = round(out["sig_landed"] / out["sig_att"], 3) if out.get("sig_landed") is not None else None
    for group in (("head", "body", "leg"), ("standing", "clinch", "ground")):   # counts -> shares
        tot = sum(out.get(k) or 0 for k in group)
        for k in group:
            if k in out:
                out[k] = round(out[k] / tot, 3) if tot else None
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
    if "slpm" not in have:      # older file without the striking numbers: refetch everyone
        have = have.iloc[0:0]
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

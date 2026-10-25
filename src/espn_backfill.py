"""Per-fight stats and lines for every past bout, from ESPN's open core API (no key).

UFCStats now shows automated visitors a browser check, so this replaces it as the
source of strike, takedown and control-time stats. For every bout in
data/espn_history.csv it fetches:
  - each fighter's fight statistics   -> data/espn_stats_long.csv.gz (fight, fighter, stat, value)
  - every sportsbook's opening and closing moneyline -> data/espn_odds_history.csv
It saves as it goes and resumes where it stopped, so a long first pass can take several runs.
The first raw responses are kept in data/raw/espn_core_samples.json for debugging.

Run:  python src/espn_backfill.py [minutes]   (default 300)
"""
import json, os, subprocess, sys, time
from collections import Counter
import requests
import pandas as pd
from common import path
from espn import _moneyline

BASE = "https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/{e}/competitions/{c}"
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0"
SAMPLES = {}
SEEN = Counter()      # what ESPN answered: status codes, timeouts, other errors
FAILED = False        # set when a request failed for a reason other than "not found"


def get(url):
    """JSON from ESPN, or None. 404 means ESPN has no such data (fine); anything else that
    fails sets FAILED so the bout is retried on a later run instead of marked done."""
    global FAILED
    url = url.replace("http://", "https://")
    for attempt in range(2):
        t = time.time()
        try:
            r = S.get(url, timeout=15)
            SEEN[str(r.status_code)] += 1
            SEEN["slow (5s+)"] += time.time() - t > 5
            if r.status_code == 404:
                return None
            if r.status_code == 429:
                time.sleep(60)
                continue
            r.raise_for_status()
            time.sleep(0.2)
            return r.json()
        except (requests.RequestException, ValueError) as e:
            SEEN[type(e).__name__] += 1
            time.sleep(5 * (attempt + 1))
    FAILED = True
    return None


def stats_rows(js, fight, fighter):
    """Flatten an ESPN statistics response into (stat, value) rows."""
    rows = []
    cats = (((js or {}).get("splits") or {}).get("categories")) or []
    for cat in cats:
        for st in cat.get("stats", []):
            rows.append({"espn_fight": fight, "fighter": fighter, "category": cat.get("name"),
                         "stat": st.get("name"), "value": st.get("value"), "display": st.get("displayValue")})
    return rows


def odds_rows(js, row):
    out = []
    for o in (js or {}).get("items", []):
        if "$ref" in o and len(o) <= 3:
            o = get(o["$ref"]) or {}
        got = {}
        for side in ("home", "away"):
            s = o.get(f"{side}AthleteOdds") or {}
            ref = str(((s.get("athlete") or {}).get("$ref")) or "")
            got[side] = (ref, _moneyline((s.get("open") or {}).get("moneyLine")),
                         _moneyline((s.get("close") or {}).get("moneyLine")) or _moneyline((s.get("current") or {}).get("moneyLine"))
                         or _moneyline(s.get("moneyLine")))
        if not (got["home"][2] and got["away"][2]):
            continue
        a_is_home = f"/athletes/{row['espn_id_a']}" in got["home"][0] or f"/athletes/{row['espn_id_b']}" not in got["home"][0]
        ha, aw = (got["home"], got["away"]) if a_is_home else (got["away"], got["home"])
        out.append({"espn_fight": row["espn_fight"], "date": row["date"], "a": row["a"], "b": row["b"],
                    "book": (o.get("provider") or {}).get("name"), "open_a": ha[1], "open_b": aw[1],
                    "close_a": ha[2], "close_b": aw[2]})
        if "odds" not in SAMPLES:
            SAMPLES["odds"] = o
    return out


def main(minutes=300):
    h = pd.read_csv(path("espn_history.csv"), dtype=str).dropna(subset=["espn_fight", "espn_event", "espn_id_a", "espn_id_b"])
    h = h.drop_duplicates("espn_fight").sort_values("date", ascending=False)   # newest first: most useful soonest
    done_f = path("espn_backfill_done.txt")
    done = set(open(done_f).read().split()) if os.path.exists(done_f) else set()
    todo = h[~h["espn_fight"].isin(done)]
    print(f"{len(todo)} of {len(h)} bouts to fetch")
    stop = time.time() + minutes * 60
    stats, odds, finished = [], [], []

    def flush():
        if stats:
            f = path("espn_stats_long.csv.gz")
            pd.DataFrame(stats).to_csv(f, mode="a", header=not os.path.exists(f), index=False, compression="gzip")
        if odds:
            f = path("espn_odds_history.csv")
            pd.DataFrame(odds).to_csv(f, mode="a", header=not os.path.exists(f), index=False)
        with open(done_f, "a") as fh:
            fh.write("".join(x + "\n" for x in finished))
        if SAMPLES and not os.path.exists(path("raw", "espn_core_samples.json")):
            os.makedirs(path("raw"), exist_ok=True)
            json.dump(SAMPLES, open(path("raw", "espn_core_samples.json"), "w"), indent=1)
        stats.clear(), odds.clear(), finished.clear()

    global FAILED
    t0, retry = time.time(), 0
    for i, r in enumerate(todo.to_dict("records")):
        FAILED = False
        if time.time() > stop:
            print("time limit reached: the next run carries on from here")
            break
        base = BASE.format(e=r["espn_event"], c=r["espn_fight"])
        for side in "ab":
            js = get(f"{base}/competitors/{r['espn_id_' + side]}/statistics")
            if js and "stats" not in SAMPLES:
                SAMPLES["stats"] = js
            stats += stats_rows(js, r["espn_fight"], r[side])
        odds += odds_rows(get(f"{base}/odds"), r)
        if FAILED:
            retry += 1          # not marked done: tried again next run
        else:
            finished.append(r["espn_fight"])
        if (i + 1) % 100 == 0:
            flush()
            print(f"{i + 1} bouts fetched, {retry} to retry, {(time.time() - t0) / (i + 1):.1f}s per bout | ESPN answered: {dict(SEEN)}", flush=True)
        if os.environ.get("CI") and (i + 1) % 1000 == 0:   # on GitHub: commit progress every 1,000 bouts
            subprocess.run(["bash", ".github/save.sh", "Backfill: ESPN stats progress"], check=False)
    flush()
    print(f"done: {retry} bouts to retry | ESPN answered: {dict(SEEN)}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 300)

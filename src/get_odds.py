"""Moneylines for upcoming UFC fights.

Sources, best first:
  1. The Odds API (free key, 500 credits a month; each run costs 1 credit per region):
     every US book's line, the median used as the market and the best price shown.
  2. ESPN's scoreboard odds (no key), from espn.py, when no Odds API line exists.

Every run also appends a snapshot to data/line_history.csv, so the site can show
how each line moved from its opening, and picks can be graded against the close.

Run:  python src/get_odds.py
"""
import os, unicodedata, datetime as dt
import requests
import pandas as pd
from common import path, api_key
from config import ODDS_REGIONS, OFFLINE

URL = "https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds"


def name_map():
    """data/name_map.csv: columns alias,name, for spellings that differ between sites."""
    f = path("name_map.csv")
    return dict(pd.read_csv(f)[["alias", "name"]].values) if os.path.exists(f) else {}


ALIASES = name_map()


def norm(name):
    """'José Aldo Jr.' -> 'jose aldo'. Used to match names across sites."""
    name = ALIASES.get(name, name)
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    for junk in [" jr.", " jr", " sr.", ".", "'", "-"]:
        s = s.replace(junk, " " if junk == "-" else "")
    return " ".join(s.split())


def to_american(decimal):
    return round((decimal - 1) * 100) if decimal >= 2 else round(-100 / (decimal - 1))


def parse(events):
    """The Odds API response -> one row per fight with median and best lines."""
    rows = []
    for ev in events:
        a, b = ev["home_team"], ev["away_team"]
        prices = {a: [], b: []}
        for bk in ev.get("bookmakers", []):
            for m in bk.get("markets", []):
                if m.get("key") == "h2h":
                    for o in m.get("outcomes", []):
                        if o.get("name") in prices:
                            prices[o["name"]].append(o["price"])
        if not prices[a] or not prices[b]:
            continue
        rows.append({"commence": ev["commence_time"], "a": a, "b": b,
                     "odds_a": to_american(pd.Series(prices[a]).median()),
                     "odds_b": to_american(pd.Series(prices[b]).median()),
                     "best_a": to_american(max(prices[a])), "best_b": to_american(max(prices[b])),
                     "books": min(len(prices[a]), len(prices[b])), "source": "odds-api"})
    return pd.DataFrame(rows)


def snapshot(df):
    """Append this run's lines to the line history."""
    if df.empty:
        return
    f = path("line_history.csv")
    snap = df.assign(taken=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"))
    snap = snap[["taken", "commence", "a", "b", "odds_a", "odds_b", "books", "source"]]
    snap.to_csv(f, mode="a", header=not os.path.exists(f), index=False)


def fetch():
    key = api_key("ODDS_API_KEY")
    if OFFLINE or not key:
        print("No Odds API key (ODDS_API_KEY): using ESPN odds only")
        return pd.DataFrame()
    try:
        r = requests.get(URL, params={"apiKey": key, "regions": ODDS_REGIONS, "markets": "h2h",
                                      "oddsFormat": "decimal"}, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print("The Odds API unavailable:", e)
        return pd.DataFrame()
    print("Odds API credits left this month:", r.headers.get("x-requests-remaining"))
    df = parse(r.json())
    df.to_csv(path("odds_upcoming.csv"), index=False)
    snapshot(df)
    print(len(df), "fights with odds")
    return df


def espn_lines():
    """ESPN's own lines from the last espn.py run, in the same shape."""
    f = path("espn_card.csv")
    if not os.path.exists(f):
        return pd.DataFrame()
    c = pd.read_csv(f).dropna(subset=["espn_odds_a", "espn_odds_b"])
    if c.empty:
        return pd.DataFrame()
    df = pd.DataFrame({"commence": c["start"], "a": c["a"], "b": c["b"], "odds_a": c["espn_odds_a"],
                       "odds_b": c["espn_odds_b"], "best_a": c["espn_odds_a"], "best_b": c["espn_odds_b"],
                       "books": 1, "source": "espn"})
    return df


def lines():
    """All current lines: Odds API first, ESPN for fights it doesn't have."""
    f = path("odds_upcoming.csv")
    oa = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()
    es = espn_lines()
    if oa.empty:
        return es
    if es.empty:
        return oa
    have = {frozenset((norm(a), norm(b))) for a, b in zip(oa["a"], oa["b"])}
    extra = es[[frozenset((norm(a), norm(b))) not in have for a, b in zip(es["a"], es["b"])]]
    return pd.concat([oa, extra], ignore_index=True)


def movement():
    """Opening line and number of snapshots per fight, from the line history."""
    f = path("line_history.csv")
    if not os.path.exists(f):
        return {}
    h = pd.read_csv(f).sort_values("taken")
    out = {}
    for r in h.itertuples():
        k = frozenset((norm(r.a), norm(r.b)))
        first = out.setdefault(k, {"open": {norm(r.a): r.odds_a, norm(r.b): r.odds_b},
                                   "opened": r.taken, "history": []})
        first["history"].append({"t": r.taken, norm(r.a): r.odds_a, norm(r.b): r.odds_b})
    return out


def attach(card, odds):
    """Add odds_a/odds_b, best prices, opening lines and line history to a card,
    matching names in either order."""
    card = card.copy()
    lut = {}
    for o in odds.itertuples():
        lut[(norm(o.a), norm(o.b))] = (o.odds_a, o.odds_b, o.best_a, o.best_b, o.books, o.source)
        lut[(norm(o.b), norm(o.a))] = (o.odds_b, o.odds_a, o.best_b, o.best_a, o.books, o.source)
    cols = ["odds_a", "odds_b", "best_a", "best_b", "books", "odds_source"]
    got = [lut.get((norm(a), norm(b)), (None,) * 6) for a, b in zip(card["a"], card["b"])]
    card[cols] = pd.DataFrame(got, index=card.index, columns=cols)
    mv = movement()
    opens, hist = [], []
    for a, b in zip(card["a"], card["b"]):
        m = mv.get(frozenset((norm(a), norm(b))))
        if m:
            opens.append((m["open"].get(norm(a)), m["open"].get(norm(b))))
            hist.append([{"t": x["t"], "a": x.get(norm(a)), "b": x.get(norm(b))} for x in m["history"]][-40:])
        else:
            opens.append((None, None))
            hist.append([])
    card[["open_a", "open_b"]] = pd.DataFrame(opens, index=card.index)
    if "espn_open_a" in card:   # ESPN's opening line (DraftKings), when our own history starts later
        early = card["espn_open_a"].notna() & card["espn_open_b"].notna()
        card.loc[early, "open_a"] = card.loc[early, "espn_open_a"]
        card.loc[early, "open_b"] = card.loc[early, "espn_open_b"]
    card["line_history"] = hist
    missing = card[card["odds_a"].isna()]
    if len(missing):
        print("no odds matched for:", "; ".join(missing["a"] + " vs " + missing["b"]),
              "\n  add spellings to data/name_map.csv if these fights are listed")
    return card


if __name__ == "__main__":
    fetch()

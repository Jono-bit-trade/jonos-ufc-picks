"""Live feed from ESPN's free UFC scoreboard (no key needed).

It gives the next card (fight order, weight class, scheduled rounds), live status
and results as fights finish, and ESPN's own moneylines when it has them.

Writes:
  data/raw/espn_scoreboard.json   the raw response, kept so a format change is easy to debug
  data/espn_card.csv              every bout on the current/next card, with live status
  data/espn_results.csv           finished bouts, appended run after run

Run:  python src/espn.py            (current card)
      python src/espn.py 20261101   (the card on a given date)
"""
import json, os, re, sys, datetime as dt
import requests
import pandas as pd
from common import path
from config import OFFLINE

URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard"


def fetch(date=None):
    if OFFLINE:
        f = path("raw", "espn_scoreboard.json")
        return json.load(open(f)) if os.path.exists(f) else {}
    params = {"dates": date} if date else {}
    r = requests.get(URL, params=params, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    js = r.json()
    os.makedirs(path("raw"), exist_ok=True)
    json.dump(js, open(path("raw", "espn_scoreboard.json"), "w"), indent=1)
    return js


def _get(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


def _moneyline(x):
    """ESPN odds fields come as numbers or strings like '-150', '+130', 'EVEN'."""
    if x is None:
        return None
    if isinstance(x, dict):
        x = x.get("american") or x.get("value") or x.get("moneyLine")
    s = str(x).strip().upper()
    if s in ("EVEN", "EV", "PK"):
        return 100
    try:
        v = float(s.replace("+", ""))
        return v if abs(v) >= 100 else None
    except ValueError:
        return None


def _odds(comp, competitors):
    """Moneylines for (fighter listed first, fighter listed second) from comp['odds'], if any."""
    for o in comp.get("odds") or []:
        lines = {}
        for side in ("home", "away"):
            for key in (f"{side}AthleteOdds", f"{side}TeamOdds", f"{side}CompetitorOdds"):
                if key in o:
                    lines[side] = _moneyline(_get(o, key, "moneyLine") or _get(o, key, "current", "moneyLine"))
        if len(lines) == 2 and all(lines.values()):
            sides = [c.get("homeAway") for c in competitors]
            if sides == ["home", "away"]:
                return lines["home"], lines["away"], _get(o, "provider", "name")
            if sides == ["away", "home"]:
                return lines["away"], lines["home"], _get(o, "provider", "name")
    return None, None, None


def method_of(detail):
    t = str(detail).upper()
    if "SUB" in t:
        return "SUB"
    if "KO" in t:
        return "KO"
    if "DEC" in t:
        return "DEC"
    return None


def finish_of(detail):
    t = str(detail).upper()
    for key, label in [("UNANIMOUS", "U-DEC"), ("U-DEC", "U-DEC"), ("U DEC", "U-DEC"),
                       ("SPLIT", "S-DEC"), ("S-DEC", "S-DEC"), ("MAJORITY", "M-DEC"), ("M-DEC", "M-DEC")]:
        if key in t:
            return label
    m = method_of(detail)
    return {"KO": "KO/TKO", "SUB": "SUB", "DEC": "U-DEC"}.get(m)


def local_date(iso):
    """Event date as US Eastern calendar day (cards run late into the UTC night)."""
    t = pd.Timestamp(iso)
    t = t.tz_localize("UTC") if t.tzinfo is None else t
    return t.tz_convert("America/New_York").strftime("%Y-%m-%d")


def parse(js):
    rows = []
    for ev in js.get("events", []):
        comps = ev.get("competitions", [])
        venue = _get(comps[0], "venue", "address") if comps else None
        loc = ", ".join(x for x in [_get(venue, "city"), _get(venue, "state"), _get(venue, "country")] if x) if venue else ""
        n = len(comps)
        for i, comp in enumerate(comps):
            cs = comp.get("competitors") or []
            if len(cs) != 2:
                continue
            cs = sorted(cs, key=lambda c: c.get("order", 0))
            names = [_get(c, "athlete", "displayName") or _get(c, "athlete", "fullName") for c in cs]
            if not all(names):
                continue
            status = comp.get("status") or ev.get("status") or {}
            state = _get(status, "type", "state", default="pre")
            detail = " ".join(str(x) for x in [_get(status, "type", "detail"), _get(status, "result", "name"),
                                               _get(status, "result", "displayName")] if x)
            winner = "a" if cs[0].get("winner") else "b" if cs[1].get("winner") else None
            if state == "post" and winner is None and re.search(r"draw", detail, re.I):
                winner = "draw"
            periods = _get(comp, "format", "regulation", "periods")
            wc = _get(comp, "type", "text") or _get(comp, "type", "abbreviation") or ""
            odds_a, odds_b, book = _odds(comp, cs)
            rows.append({
                "espn_event": ev.get("id"), "espn_fight": comp.get("id"), "event": ev.get("name", ""),
                "date": local_date(comp.get("date") or ev.get("date")), "start": comp.get("date") or ev.get("date"),
                "location": loc, "a": names[0], "b": names[1],
                "weight_class": re.sub(r"\s*(Bout|Title Fight|Championship)$", "", wc).strip(),
                "gender": "F" if "women" in wc.lower() else "M", "title": "title" in wc.lower(),
                "rounds": int(periods) if periods else (5 if i == n - 1 else 3),   # main event is last
                "bout_order": n - i,   # 1 = main event
                "card_segment": _get(comp, "cardSegment", "description") or _get(comp, "cardSegment", "name") or "",
                "state": state, "status_detail": detail.strip(), "winner": winner,
                "method": method_of(detail) if state == "post" else None,
                "finish": finish_of(detail) if state == "post" else None,
                "end_round": _get(status, "period"),
                "espn_odds_a": odds_a, "espn_odds_b": odds_b, "espn_book": book,
            })
    return pd.DataFrame(rows)


def update(date=None):
    try:
        card = parse(fetch(date))
    except Exception as e:
        print("ESPN feed unavailable:", e)
        return pd.DataFrame()
    if card.empty:
        print("ESPN: no UFC card listed")
        return card
    card = card.sort_values("bout_order")
    card.to_csv(path("espn_card.csv"), index=False)
    done = card[card["state"].eq("post") & card["winner"].notna()]
    if len(done):
        f = path("espn_results.csv")
        old = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()
        allr = pd.concat([old, done], ignore_index=True).drop_duplicates("espn_fight", keep="last")
        allr.to_csv(f, index=False)
    live = card["state"].eq("in").sum()
    print(f"ESPN: {card['event'].iloc[0]} {card['date'].iloc[0]}, {len(card)} bouts, "
          f"{len(done)} finished, {live} live")
    return card


if __name__ == "__main__":
    update(sys.argv[1] if len(sys.argv) > 1 else None)

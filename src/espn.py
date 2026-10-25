"""Live feed from ESPN's free UFC scoreboard (no key needed).

It gives the next card (fight order, weight class, scheduled rounds), live status
and results as fights finish, and ESPN's own moneylines when it has them.

Writes:
  data/raw/espn_scoreboard.json   the raw response, kept so a format change is easy to debug
  data/espn_card.csv              every bout on the current/next card, with live status
  data/espn_results.csv           finished bouts, appended run after run

Run:  python src/espn.py            (current card)
      python src/espn.py 20261101   (the card on a given date)
      python src/espn.py --history  (every past card date since 2020, once: results and ESPN's lines,
                                     saved to data/espn_history.csv; resumes where it stopped)
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
    if date is None:   # keep the latest live response for debugging
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


def result_from(comp, cs):
    """Method from the play log ('Unofficial Winner Decision', '... Kotko', '... Submission'),
    and the decision type from the judges' cards."""
    text = ""
    for d in comp.get("details") or []:
        t = _get(d, "type", "text") or ""
        if t.lower().startswith("unofficial winner"):
            text = t[len("unofficial winner"):].strip()
            break
    t = text.lower()
    if not t:
        return None, None, ""
    if "sub" in t:
        return "SUB", "SUB", text
    if "ko" in t or "tko" in t or "stoppage" in t:
        return "KO", "KO/TKO", "KO/TKO"
    if "dec" in t:
        try:   # per-judge totals: competitors[i].linescores[0].linescores[j].value
            ja = [x["value"] for x in cs[0]["linescores"][0]["linescores"]]
            jb = [x["value"] for x in cs[1]["linescores"][0]["linescores"]]
            w = 0 if cs[0].get("winner") else 1
            mine = [(a > b) if w == 0 else (b > a) for a, b in zip(ja, jb)]
            even = [a == b for a, b in zip(ja, jb)]
            label = "U-DEC" if all(mine) else "M-DEC" if any(even) else "S-DEC"
        except (KeyError, IndexError, TypeError):
            label = "U-DEC"
        return "DEC", label, {"U-DEC": "Unanimous decision", "S-DEC": "Split decision",
                              "M-DEC": "Majority decision"}[label]
    return None, None, text


def weight_class(wc):
    wc = re.sub(r"\s*(Bout|Title Fight|Championship)$", "", wc or "").strip()
    if wc.startswith("W "):
        wc = "Women's " + wc[2:]
    return wc


def record(c):
    for r in c.get("records") or []:
        if r.get("type") == "total" or r.get("name") == "overall":
            return r.get("summary")
    return None


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
            how, finish, how_text = result_from(comp, cs) if state == "post" else (None, None, "")
            if how_text:
                detail = f"{how_text}, round {_get(status, 'period')} {_get(status, 'displayClock') or ''}".strip()
            winner = "a" if cs[0].get("winner") else "b" if cs[1].get("winner") else None
            if state == "post" and winner is None and re.search(r"draw", detail, re.I):
                winner = "draw"
            periods = _get(comp, "format", "regulation", "periods")
            wc = weight_class(_get(comp, "type", "text") or _get(comp, "type", "abbreviation") or "")
            odds_a, odds_b, book = _odds(comp, cs)
            rows.append({
                "espn_event": ev.get("id"), "espn_fight": comp.get("id"), "event": ev.get("name", ""),
                "date": local_date(comp.get("date") or ev.get("date")), "start": comp.get("date") or ev.get("date"),
                "location": loc, "a": names[0], "b": names[1],
                "weight_class": wc, "record_a": record(cs[0]), "record_b": record(cs[1]),
                "espn_id_a": cs[0].get("id"), "espn_id_b": cs[1].get("id"),
                "gender": "F" if "women" in wc.lower() else "M", "title": "title" in wc.lower(),
                "rounds": int(periods) if periods else (5 if i == n - 1 else 3),   # main event is last
                "bout_order": n - i,   # 1 = main event
                "card_segment": _get(comp, "cardSegment", "description") or _get(comp, "cardSegment", "name") or "",
                "state": state, "status_detail": detail.strip(), "winner": winner,
                "method": (how or method_of(detail)) if state == "post" else None,
                "finish": (finish or finish_of(detail)) if state == "post" else None,
                "end_round": _get(status, "period"),
                "espn_odds_a": odds_a, "espn_odds_b": odds_b, "espn_book": book,
            })
    return pd.DataFrame(rows)


def upcoming_cards(js):
    """The next few cards on the calendar, for the site's Events page."""
    from common import SITE
    now = pd.Timestamp.now(tz="UTC")
    out = []
    for c in (_get(js, "leagues", default=[{}]) or [{}])[0].get("calendar", []):
        start = pd.Timestamp(c.get("startDate"))
        start = start.tz_localize("UTC") if start.tzinfo is None else start
        if start > now - pd.Timedelta(hours=8):
            out.append({"name": c.get("label"), "start": start.strftime("%Y-%m-%dT%H:%MZ"),
                        "date": start.tz_convert("America/New_York").strftime("%Y-%m-%d")})
    if out:
        os.makedirs(os.path.join(SITE, "data"), exist_ok=True)
        json.dump(out[:8], open(os.path.join(SITE, "data", "upcoming.json"), "w"), indent=1)


def next_event_date(js):
    """The next card's date (YYYYMMDD) from the league calendar in a scoreboard response."""
    now = pd.Timestamp.now(tz="UTC")
    for c in (_get(js, "leagues", default=[{}]) or [{}])[0].get("calendar", []):
        start = pd.Timestamp(c.get("startDate"))
        start = start.tz_localize("UTC") if start.tzinfo is None else start
        if start > now - pd.Timedelta(hours=8):
            return start.tz_convert("America/New_York").strftime("%Y%m%d")
    return None


def core_odds(card):
    """ESPN's core API lines per bout (the scoreboard often has none)."""
    if OFFLINE:
        return card
    base = "https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/{}/competitions/{}/odds"
    for i, r in card[card["state"].eq("pre") & card["espn_odds_a"].isna()].iterrows():
        try:
            js = requests.get(base.format(r["espn_event"], r["espn_fight"]), timeout=20,
                              headers={"User-Agent": "Mozilla/5.0"}).json()
        except Exception:
            continue
        for o in js.get("items", []):
            if "$ref" in o and len(o) <= 2:
                try:
                    o = requests.get(o["$ref"].replace("http://", "https://"), timeout=20).json()
                except Exception:
                    continue
            got = {}
            for side in ("home", "away"):
                s_ = o.get(f"{side}AthleteOdds") or o.get(f"{side}TeamOdds") or {}
                got[side] = _moneyline(s_.get("moneyLine") or _get(s_, "current", "moneyLine")
                                       or _get(s_, "close", "moneyLine"))
            if got.get("home") and got.get("away"):
                # match each side to a fighter by the athlete id in its $ref; if absent, assume
                # the first listed (red) corner is "home", as on the scoreboard
                ref = lambda side: str(_get(o, f"{side}AthleteOdds", "athlete", "$ref") or "")
                if str(r.get("espn_id_b")) and f"/athletes/{r.get('espn_id_b')}" in ref("home"):
                    got["home"], got["away"] = got["away"], got["home"]
                op = {side: _moneyline(_get(o, f"{side}AthleteOdds", "open", "moneyLine"))
                      for side in ("home", "away")}
                if str(r.get("espn_id_b")) and f"/athletes/{r.get('espn_id_b')}" in ref("home"):
                    op["home"], op["away"] = op["away"], op["home"]
                card.at[i, "espn_open_a"], card.at[i, "espn_open_b"] = op["home"], op["away"]
                card.at[i, "espn_odds_a"], card.at[i, "espn_odds_b"] = got["home"], got["away"]
                card.at[i, "espn_book"] = _get(o, "provider", "name")
                if "odds" not in SAMPLE_SAVED:
                    os.makedirs(path("raw"), exist_ok=True)
                    json.dump(o, open(path("raw", "espn_odds_sample.json"), "w"), indent=1)
                    SAMPLE_SAVED.add("odds")
                break
    return card


SAMPLE_SAVED = set()


def save_results(card):
    done = card[card["state"].eq("post") & card["winner"].notna()]
    if len(done):
        f = path("espn_results.csv")
        old = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame()
        allr = pd.concat([old, done], ignore_index=True)
        allr["espn_fight"] = allr["espn_fight"].astype(str)
        allr = allr.drop_duplicates("espn_fight", keep="last")
        allr.to_csv(f, index=False)
    return done


def update(date=None):
    try:
        js = fetch(date)
        card = parse(js)
    except Exception as e:
        print("ESPN feed unavailable:", e)
        return pd.DataFrame()
    if not card.empty:
        save_results(card)
    upcoming_cards(js)
    # once a card is over (by the next morning), move on to the next one on the calendar
    over = card.empty or (card["state"].eq("post").all()
                          and card["date"].max() < pd.Timestamp.now(tz="America/New_York").strftime("%Y-%m-%d"))
    if over and date is None and not OFFLINE:
        nxt = next_event_date(js)
        if nxt:
            try:
                nxt_card = parse(fetch(nxt))
                if not nxt_card.empty:
                    card = nxt_card
            except Exception as e:
                print("ESPN next card unavailable:", e)
    if card.empty:
        print("ESPN: no UFC card listed")
        return card
    card = core_odds(card.sort_values("bout_order"))
    card.to_csv(path("espn_card.csv"), index=False)
    done = card[card["state"].eq("post") & card["winner"].notna()]
    live = card["state"].eq("in").sum()
    print(f"ESPN: {card['event'].iloc[0]} {card['date'].iloc[0]}, {len(card)} bouts, "
          f"{len(done)} finished, {live} live")
    return card


def calendar(year):
    """[(event id, event date YYYYMMDD)] for every UFC card in a year, from the scoreboard's calendar."""
    js = fetch(f"{year}0601") if not OFFLINE else {}
    out = []
    for c in (_get(js, "leagues", default=[{}]) or [{}])[0].get("calendar", []):
        ref = _get(c, "event", "$ref") or ""
        m = re.search(r"/events/(\d+)", ref)
        start = pd.Timestamp(c.get("startDate"))
        start = start.tz_localize("UTC") if start.tzinfo is None else start
        if m and str(start.year) == str(year):
            out.append((m.group(1), start.tz_convert("America/New_York").strftime("%Y%m%d")))
    return out


def history(first_year=2010):
    """Every past card, from the yearly ESPN calendar: results, bout order, records,
    ESPN athlete ids (for photos) and any lines. Resumes where it stopped."""
    import time
    f = path("espn_history.csv")
    old = pd.read_csv(f, dtype={"espn_event": str, "espn_fight": str}) if os.path.exists(f) else pd.DataFrame()
    done = set(old["espn_event"].dropna()) if "espn_event" in old else set()
    today = dt.date.today().strftime("%Y%m%d")
    rows = []
    for year in range(first_year, dt.date.today().year + 1):
        cal = calendar(year)
        todo = [(e, d) for e, d in cal if e not in done and d < today]
        print(year, len(cal), "cards,", len(todo), "to fetch")
        for eid, day in todo:
            try:
                card = parse(fetch(day))
            except Exception as e:
                print(day, "failed:", e)
                continue
            card = card[card["espn_event"].astype(str).eq(eid) & card["state"].eq("post")] if len(card) else card
            if len(card):
                rows.append(card.assign(queried=day))
            time.sleep(0.4)
    if rows:
        allr = pd.concat([old] + rows, ignore_index=True)
        allr["espn_fight"] = allr["espn_fight"].astype(str)
        allr = allr.drop_duplicates("espn_fight", keep="last").sort_values(["date", "bout_order"])
        allr.to_csv(f, index=False)
        print("espn_history.csv:", len(allr), "finished bouts")


if __name__ == "__main__":
    if "--history" in sys.argv:
        history()
    else:
        update(sys.argv[1] if len(sys.argv) > 1 else None)

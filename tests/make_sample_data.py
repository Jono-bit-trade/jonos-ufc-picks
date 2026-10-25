"""Made-up live-feed responses for the tests (no network needed).

Writes into the given project folder:
  data/raw/espn_scoreboard.json   an ESPN-style card: 1 finished, 1 live, 2 upcoming bouts
  tests/odds_api_sample.json      an Odds API-style response for the same bouts
"""
import json, os, sys, datetime as dt

root = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
now = dt.datetime.now(dt.timezone.utc)
start = (now + dt.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%MZ")

BOUTS = [  # (red, blue, weight class, state, winner index, status detail, odds red, odds blue)
    ("Tommy McMillen", "Manolo Zecchini", "Featherweight", "post", 0, "Final - KO/TKO", "-450", "+340"),
    ("Jose Delano", "Robert Ruchala", "Featherweight", "in", None, "Round 2", "-250", "+200"),
    ("Virna Jandiroba", "Tabatha Ricci", "Women's Strawweight", "pre", None, "", "-120", "+100"),
    ("Renato Moicano", "Chris Duncan", "Lightweight", "pre", None, "", "+150", "-180"),
]


def competitor(name, order, home_away, winner):
    return {"id": str(abs(hash(name)) % 10**7), "order": order, "homeAway": home_away, "winner": winner,
            "athlete": {"displayName": name, "fullName": name}}


comps = []
for i, (r, b, wc, state, w, detail, orr, ob) in enumerate(BOUTS):
    comps.append({
        "id": f"40100000{i}", "date": start,
        "type": {"text": wc, "abbreviation": wc},
        "format": {"regulation": {"periods": 5 if i == len(BOUTS) - 1 else 3}},
        "venue": {"address": {"city": "Las Vegas", "state": "NV", "country": "USA"}},
        "status": {"period": 1 if state == "post" else 2 if state == "in" else 0,
                   "type": {"state": state, "completed": state == "post", "detail": detail}},
        "competitors": [competitor(r, 1, "home", w == 0), competitor(b, 2, "away", w == 1)],
        "odds": [{"provider": {"name": "ESPN BET"},
                  "homeAthleteOdds": {"moneyLine": orr}, "awayAthleteOdds": {"moneyLine": ob}}],
    })
espn = {"events": [{"id": "600099999", "name": "UFC Fight Night: Test Card", "date": start, "competitions": comps}]}
os.makedirs(os.path.join(root, "data", "raw"), exist_ok=True)
json.dump(espn, open(os.path.join(root, "data", "raw", "espn_scoreboard.json"), "w"), indent=1)


def dec(american):
    a = float(american)
    return round(1 + (a / 100 if a > 0 else 100 / -a), 3)


odds = []
for r, b, _, state, _, _, orr, ob in BOUTS:
    if state != "pre":
        continue
    odds.append({"commence_time": start, "home_team": r, "away_team": b, "bookmakers": [
        {"key": k, "markets": [{"key": "h2h", "outcomes": [
            {"name": r, "price": dec(orr) + d}, {"name": b, "price": dec(ob) - d}]}]}
        for k, d in [("draftkings", 0.0), ("fanduel", 0.03), ("betmgm", -0.02)]]})
os.makedirs(os.path.join(root, "tests"), exist_ok=True)
json.dump(odds, open(os.path.join(root, "tests", "odds_api_sample.json"), "w"), indent=1)
print("sample live-feed data written")

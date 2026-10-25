#!/usr/bin/env bash
# Runs the live-feed pipeline end to end on made-up ESPN and odds responses,
# in a temporary copy of the project. No network or API key needed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cp -r "$HERE/src" "$HERE/tests" "$HERE/data" "$TMP/"
mkdir -p "$TMP/docs"
cd "$TMP"
rm -f data/espn_card.csv data/espn_results.csv data/odds_upcoming.csv data/line_history.csv data/pick_log.csv
export UFC_OFFLINE=1
python tests/make_sample_data.py "$TMP"
python src/espn.py
python - <<'PY'
import json, sys
sys.path.insert(0, "src")
import get_odds
o = get_odds.parse(json.load(open("tests/odds_api_sample.json")))
early = o.copy(); early["odds_a"] = early["odds_a"] + 40; early["odds_b"] = early["odds_b"] - 40
get_odds.snapshot(early)          # an earlier line, so the site has movement to show
o.to_csv("data/odds_upcoming.csv", index=False); get_odds.snapshot(o)
PY
python src/get_data.py --offline
python src/predict.py
python src/site_data.py
python src/expert_analysis.py
python - <<'PY'
import json
p = json.load(open("docs/data/predictions.json"))
r = json.load(open("docs/data/ratings.json"))
res = json.load(open("docs/data/results.json"))
f = {x["a"]: x for x in p["fights"]}
assert p["card_source"] == "ESPN" and len(p["fights"]) == 4, p["card_source"]
assert p["fights"][0]["a"] == "Renato Moicano" and p["fights"][0]["rounds"] == 5
done = f["Tommy McMillen"]
assert done["state"] == "post" and done["result"]["winner"] == "Tommy McMillen", done
assert f["Jose Delano"]["state"] == "in"
up = f["Virna Jandiroba"]
assert up["odds_a"] is not None and up["books"] == 3 and up["open_a"] is not None and len(up["line_history"]) == 2, up
assert done["odds_a"] is not None, "ESPN line should fill fights the Odds API doesn't list"
assert all(0 < x["p_a"] < 1 for x in p["fights"])
assert len(r["fighters"]) > 10 and "bets" in res
import os
assert os.path.exists("docs/data/fighters/index.json") and os.path.exists("docs/data/events/index.json")
assert json.load(open("docs/data/experts.json"))["test"]["bouts"] > 100
print(f"smoke test passed: {len(p['fights'])} bouts, {sum(1 for x in p['fights'] if x['pick'])} picks")
PY
rm -rf "$TMP"

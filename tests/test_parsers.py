"""Checks the parsers for each live source on small made-up pages and responses.
Run:  python tests/test_parsers.py   (no network or key needed)"""
import json, os, sys, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
os.environ["UFC_OFFLINE"] = "1"
from bs4 import BeautifulSoup
import pandas as pd

# ---- ESPN scoreboard -------------------------------------------------------
tmp = tempfile.mkdtemp()
subprocess.run([sys.executable, os.path.join(HERE, "make_sample_data.py"), tmp], check=True)
import espn
card = espn.parse(json.load(open(os.path.join(tmp, "data", "raw", "espn_scoreboard.json"))))
assert len(card) == 4, card
main = card.sort_values("bout_order").iloc[0]
assert main["a"] == "Renato Moicano" and main["rounds"] == 5, main
done = card[card["state"] == "post"].iloc[0]
assert done["winner"] == "a" and done["method"] == "KO" and done["finish"] == "KO/TKO", done
assert card[card["state"] == "in"]["winner"].isna().all()
assert main["espn_odds_a"] == 150 and main["espn_odds_b"] == -180, main
assert espn._moneyline("EVEN") == 100 and espn._moneyline("-110") == -110 and espn._moneyline(None) is None
assert espn.finish_of("Decision - Split") == "S-DEC" and espn.method_of("Submission (Rear Naked Choke)") == "SUB"

# ---- The Odds API ----------------------------------------------------------
import get_odds
o = get_odds.parse(json.load(open(os.path.join(tmp, "tests", "odds_api_sample.json"))))
assert len(o) == 2 and set(o["books"]) == {3}, o
r = o[o["a"] == "Renato Moicano"].iloc[0]
assert r["odds_a"] > 0 > r["odds_b"] and r["best_a"] >= r["odds_a"], r
assert get_odds.norm("José Aldo Jr.") == "josealdo" and get_odds.norm("Aori Qileng") == get_odds.norm("Aoriqileng")
assert get_odds.to_american(2.5) == 150 and get_odds.to_american(1.5) == -200

# ---- name matching across sites ---------------------------------------------
import names
idx = names.Index(pd.DataFrame({"date": ["2026-09-19", "2026-07-11"], "a": ["Patricio Pitbull", "Ryan Gandra"],
                                "b": ["Dooho Choi", "Zach Reese"]}))
assert idx.find("2026-09-19", "Choi Doo-ho", "Patrício Pitbull") == ("Dooho Choi", "Patricio Pitbull")
assert idx.find("2026-07-12", "Zachary Reese", "Ryan Gandra") == ("Zach Reese", "Ryan Gandra")
assert idx.find("2026-07-11", "Someone Else", "Another Guy") is None

# ---- betting-line checks ----------------------------------------------------
import get_data
assert get_data.valid_line(-150, 130) and get_data.valid_line(-110, -110)
assert not get_data.valid_line(-165, 375)          # sides from two different lines
assert not get_data.valid_line(-200, -180)         # both clear favorites
assert not get_data.valid_line(0, -132.5) and not get_data.valid_line(None, 120)

# ---- pick rules -------------------------------------------------------------
import picks
assert picks.our_side(0.62, 0.57, -140, 120) == "a"        # value on the favorite, under 70%
assert picks.our_side(0.45, 0.40, 150, -170) is None       # value underdog, not confident
assert picks.expert_lean(0.52, 9, 3) == "a" and picks.expert_lean(0.52, 6, 5) is None
assert picks.expert_lean(0.70, 10, 1) is None              # not a close fight

print("parser tests passed")

# ---- A real ESPN response (UFC 333, saved by the first live run) -------------
real = espn.parse(json.load(open(os.path.join(HERE, "espn_real_ufc333.json"))))
assert len(real) == 14 and real["state"].eq("post").all(), real
r = real.set_index("a")
assert r.loc["Alexander Volkanovski", "finish"] == "KO/TKO" and r.loc["Alexander Volkanovski", "winner"] == "a"
assert r.loc["Colby Thicknesse", "finish"] == "S-DEC" and r.loc["Abus Magomedov", "method"] == "SUB"
assert r.loc["Iasmin Lucindo", "weight_class"] == "Women's Strawweight" and r.loc["Iasmin Lucindo", "gender"] == "F"
assert espn.next_event_date(json.load(open(os.path.join(HERE, "espn_real_ufc333.json")))) is not None
print("real ESPN response parsed")


def test_ufc_athlete_page():
    from ufc_athletes import parse, ufc_slug
    html = ("<div><div class='c-stat-compare__number'>3.22</div><div class='c-stat-compare__label'>Takedown avg</div>"
            "<div class='c-stat-compare__label-suffix'>Per 15 Min</div></div>"
            "<div><div class='c-stat-compare__number'>91 <div class='c-stat-compare__percent'>%</div></div>"
            "<div class='c-stat-compare__label'>Takedown Defense</div></div>"
            "<div><div class='c-stat-compare__number'>0.87</div><div class='c-stat-compare__label'>Submission avg</div></div>")
    got = parse(html)
    assert got["td_per15"] == 3.22 and abs(got["td_def"] - 0.91) < 1e-9 and got["sub_per15"] == 0.87, got
    assert ufc_slug("Jiří Procházka") == "jiri-prochazka" and ufc_slug("Sean O'Malley") == "sean-omalley"
    print("UFC.com athlete page parsed")
test_ufc_athlete_page()

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
assert get_odds.norm("José Aldo Jr.") == "jose aldo"
assert get_odds.to_american(2.5) == 150 and get_odds.to_american(1.5) == -200

# ---- UFCStats pages --------------------------------------------------------
import scrape_ufcstats as su
FIGHT = """
<h2><a class="b-link" href="http://ufcstats.com/event-details/e1">UFC Test</a></h2>
<div class="b-fight-details__person"><i class="b-fight-details__person-status">W</i>
  <a class="b-fight-details__person-link" href="http://ufcstats.com/fighter-details/f1">Alex Red</a></div>
<div class="b-fight-details__person"><i class="b-fight-details__person-status">L</i>
  <a class="b-fight-details__person-link" href="http://ufcstats.com/fighter-details/f2">Ben Blue</a></div>
<i class="b-fight-details__fight-title">Lightweight Bout</i>
<i class="b-fight-details__text-item_first">Method: <i>Decision - Split</i></i>
<i class="b-fight-details__text-item">Round: 3</i>
<i class="b-fight-details__text-item">Time: 5:00</i>
<i class="b-fight-details__text-item">Time format: 3 Rnd (5-5-5)</i>
<table><tbody><tr>
 <td><p>Alex Red</p><p>Ben Blue</p></td><td><p>1</p><p>0</p></td>
 <td><p>60 of 120</p><p>45 of 110</p></td><td><p>50%</p><p>40%</p></td>
 <td><p>80 of 150</p><p>60 of 140</p></td><td><p>2 of 5</p><p>0 of 1</p></td>
 <td><p>40%</p><p>0%</p></td><td><p>1</p><p>0</p></td><td><p>0</p><p>0</p></td>
 <td><p>4:10</p><p>0:20</p></td></tr></tbody></table>"""
f, st = su.parse_fight(BeautifulSoup(FIGHT, "lxml"))
assert f["winner"] == "a" and f["finish"] == "S-DEC" and f["fight_secs"] == 900 and f["rounds"] == 3, f
assert st[0]["sig_landed"] == 60 and st[0]["sig_absorbed"] == 45 and st[0]["ctrl_secs"] == 250, st[0]
assert st[1]["td_faced"] == 5 and st[1]["td_allowed"] == 2, st[1]
FIGHTER = """<span class="b-content__title-highlight">Alex Red</span>
<span class="b-content__title-record">Record: 14-3-0</span>
<ul><li class="b-list__box-list-item"><i>Height:</i> 5' 10"</li>
<li class="b-list__box-list-item"><i>Reach:</i> 72"</li>
<li class="b-list__box-list-item"><i>STANCE:</i> Southpaw</li>
<li class="b-list__box-list-item"><i>DOB:</i> Mar 03, 1995</li></ul>"""
p = su.parse_fighter(BeautifulSoup(FIGHTER, "lxml"))
assert p["height_cm"] == 177.8 and p["reach_cm"] == 182.88 and p["stance"] == "Southpaw", p
assert p["dob"] == "1995-03-03" and p["pro_record"] == "14-3-0", p

# ---- history backfill tables (ufcscraper format) ----------------------------
import common, import_history as ih
hist_dir = os.path.join(tmp, "ufcscraper")
os.makedirs(hist_dir)
w = lambda n, t: open(os.path.join(hist_dir, n), "w").write(t)
w("event_data.csv", "event_id,event_name,event_date,event_city,event_state,event_country\n"
                    "e1,UFC Test,2024-03-02,Las Vegas,Nevada,USA\n")
w("fight_data.csv", "fight_id,event_id,referee,fighter_1,fighter_2,winner,num_rounds,title_fight,weight_class,gender,"
                    "result,result_details,finish_round,finish_time,time_format,scores_1,scores_2\n"
                    "x1,e1,Ref,f1,f2,f2,3,F,Lightweight,M,Decision,Split,3,5:00,3 Rnd (5-5-5),,\n")
w("fighter_data.csv", "fighter_id,fighter_f_name,fighter_l_name,fighter_nickname,fighter_height_cm,fighter_weight_lbs,"
                      "fighter_reach_cm,fighter_stance,fighter_dob,fighter_w,fighter_l,fighter_d,fighter_nc_dq\n"
                      "f1,Alex,Red,,177.8,155,182.88,Orthodox,1994-01-01,10,2,0,0\n"
                      "f2,Ben,Blue,,180.34,155,185.42,Southpaw,1996-06-01,12,1,0,0\n")
w("round_data.csv", "fight_id,fighter_id,round,knockdowns,strikes_att,strikes_succ,takedown_att,takedown_succ,"
                    "submission_att,reversals,ctrl_time\n"
                    "x1,f1,1,0,30,12,2,1,0,0,1:30\nx1,f1,2,0,25,10,0,0,0,0,0:00\n"
                    "x1,f2,1,1,40,20,0,0,1,0,0:10\nx1,f2,2,0,35,18,1,1,0,0,2:00\n")
w("BestFightOdds_odds.csv", "fight_id,fighter_id,opening,closing_range_min,closing_range_max\n"
                            "x1,f1,-150,-130,-120\nx1,f2,130,100,110\n")
ih.SRC = hist_dir
common.DATA = tmp
ih.path = lambda *p: os.path.join(tmp, *p)
h = ih.build().iloc[0]
assert h["a"] == "Alex Red" and h["winner"] == "b" and h["finish"] == "S-DEC" and h["fight_secs"] == 900, h
assert h["open_a"] == -150 and h["open_b"] == 130 and -130 <= h["odds_a"] <= -120 and h["odds_b"] >= 100, h
st = pd.read_csv(os.path.join(tmp, "fight_stats.csv")).set_index("fighter")
assert st.loc["Alex Red", "sig_landed"] == 22 and st.loc["Alex Red", "sig_absorbed"] == 38, st
assert st.loc["Ben Blue", "ctrl_secs"] == 130 and st.loc["Ben Blue", "td_faced"] == 2, st

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

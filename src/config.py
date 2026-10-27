"""All the settings you are likely to tune, in one place.

Change a value, run `python src/backtest.py`, and keep the change only if
the backtest improves across several years, not just one.
"""
import os

# ---- Data -------------------------------------------------------------------
TRAIN_FROM = "2012-01-01"     # ratings need about two years of results to settle
BACKTEST_YEARS = range(2016, 2027)
BLEND_FROM_YEAR = 2018        # the market blend needs two years of predictions first
OFFLINE = os.environ.get("UFC_OFFLINE") == "1"   # tests: never touch the network

# ---- Step 3: Glicko-2 ratings ----------------------------------------------
GLICKO = {"tau": 0.5, "start_rd": 200.0, "days_per_period": 90}   # start_rd 150/200/300 tested: 200 best
WIN_SCORE = {"KO/TKO": 1.0, "SUB": 1.0, "U-DEC": 0.9, "M-DEC": 0.75, "S-DEC": 0.65}

# ---- Step 6: models ---------------------------------------------------------
FEATURE_GROUPS = ["CORE", "FORM", "CONTEXT"]
# The backtest reports every feature group but uses this one. Tested Oct 2026 with ESPN fight stats
# for ~6,250 bouts: adding STYLE (strike/takedown/control rates) made the model alone more accurate
# (log loss 0.663 -> 0.656 in 2020-22, 0.635 -> 0.630 in 2023-26), but after blending with the line
# it picked winners no better (66.1% both; 70.2% vs 70.3%) and our picks fell from +30.7u to +9.9u
# in 2023-26: the line already prices those stats. Matchup terms and a decline trend didn't help either.
PINNED_FEATURES = "core+form"
LEARNER = "logistic"          # "logistic", "boost" or "blend" (the backtest overrides via data/model_config.json)
MARKET_BLEND = True           # final step: blend the model with the no-vig line (fit on past predictions)
TRAIN_HALF_LIFE_YEARS = 3     # recent fights weigh more (3 beat 6 and equal weights, 2018-2026 log loss 0.6548 -> 0.6536)

# ---- Picks ------------------------------------------------------------------
EDGE = 0.03                   # pick only when the final chance beats the fair line by this much (0.03 = 3 points)
BIG_EDGE = 0.10               # edges this big usually mean news the model can't see: labelled "check the news"
MIN_BOOKS = 2                 # need lines from at least this many books before trusting the average

# ---- Our picks: the selective, high-confidence subset of value picks -------------
# Chosen on 2018-2023, checked on 2024-2026, then widened to value favorites (below). Heavy favorites
# stay in: value picks at -250 or shorter won about 80% of the time and were the most
# profitable group in both periods. Set OUR_PICKS_MAX_FAVORITE to e.g. -300 to exclude them.
OUR_PICKS_MIN_EDGE = 0.03     # beats the fair line by 3+ points (same as value picks)
OUR_PICKS_MIN_CHANCE = 0.70   # our final chance for the pick is 70% or more...
OUR_PICKS_ANY_FAVORITE = True # ...or the pick is the betting favorite. Value picks on favorites
                              # below 70% won ~2/3 of the time and paid in 2020-22 (+16u) and
                              # 2023-26 (+12u); they lost in 2018-19 (-27u), when the line blend
                              # had only 1-2 years of predictions to learn from. Added Oct 2026.
OUR_PICKS_MAX_UNDERDOG = 150  # no underdogs longer than +150 (those lost money)
OUR_PICKS_MAX_FAVORITE = None # e.g. -300 to skip picks shorter than -300; None keeps them

# No our picks when both fighters are making their UFC debut: the model has no UFC information on
# either, and those picks went 15-8, -5.1u, 2020-2026. (Debutant vs veteran picks stay.) Oct 2026.
OUR_PICKS_SKIP_BOTH_DEBUT = True

# Suggested stake for our picks, by price. Tested Oct 2026 against flat 1 unit on 2020-22 and
# 2023-26: more units in both (+27.9 vs +27.0, +43.0 vs +36.8) with less risked, return per unit
# risked +11.4% vs +9.4% and +7.8% vs +5.6%. Staking by edge or Kelly risked more for the same return.
STAKES = [(-199, 1.5), (-399, 1.0), (-100000, 0.5)]   # odds at or above the first number -> stake

# The live record: picks made before each fight from this date on are written to data/ledger.csv
# once graded and never recalculated, whatever later changes the model or data get.
LEDGER_FROM = "2026-10-31"

# Fighter photos: "espn_first" (ESPN headshots, freely licensed Wikimedia Commons photos where ESPN
# has none), "commons_first", or "commons_only" (only photos whose license allows reuse with credit;
# everyone else gets initials). Every Commons photo shown is credited on the site's Photo credits page.
PHOTO_MODE = "espn_first"

# Expert lean: in a close fight (line 40-60%), when 65%+ of 5+ SplitPicks analysts agree, their side
# becomes our pick (if the model has no our pick there) and the fight is tagged "Expert lean".
# Apr-Oct 2026: 47 such fights, experts' side won 77% vs the line's 54%, +16.5u. Added Oct 2026 on
# that one period only: watch its separate record.
EXPERT_LEAN = True
EXPERT_LEAN_MIN_SHARE = 0.65
EXPERT_LEAN_MIN_ANALYSTS = 5
EXPERT_LEAN_LINE = (0.40, 0.60)

# ---- Odds -------------------------------------------------------------------
ODDS_REGIONS = "us"           # The Odds API: 1 credit per region per call

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
FEATURE_GROUPS = ["CORE", "FORM", "CONTEXT"]   # add "STYLE" after the UFCStats backfill
LEARNER = "logistic"          # "logistic", "boost" or "blend" (the backtest overrides via data/model_config.json)
MARKET_BLEND = True           # final step: blend the model with the no-vig line (fit on past predictions)

# ---- Picks ------------------------------------------------------------------
EDGE = 0.03                   # pick only when the final chance beats the fair line by this much (0.03 = 3 points)
BIG_EDGE = 0.10               # edges this big usually mean news the model can't see: labelled "check the news"
MIN_BOOKS = 2                 # need lines from at least this many books before trusting the median

# ---- Odds -------------------------------------------------------------------
ODDS_REGIONS = "us"           # The Odds API: 1 credit per region per call

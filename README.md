# Octagon Edge

A UFC prediction model and website. It rates every UFC fighter, predicts each bout on the next card, compares that with the betting line and with what expert analysts are picking, and publishes the picks. On fight night the site follows the card live: each bout shows when it's on and who won, and every pick is graded as the results come in.

The site is laid out like SplitPicks: a home page with the next card and a countdown, every past card with results, a profile for every UFC fighter since 2010 (photo, record, how they win and lose, fight stats, rating history and every fight), and an Experts page that tests whether analyst consensus predicts fights better than the betting line.

Website: **https://jono-bit-trade.github.io/jonos-ufc-picks/** (live once setup step 2 below is done)

## One-time setup (about 5 minutes)

1. **Add your Odds API key as a secret.** Get a free key at https://the-odds-api.com. In this repository go to **Settings → Secrets and variables → Actions → New repository secret**. Name: `ODDS_API_KEY`. Value: your key. Without it the site still works, using ESPN's lines (one book instead of the average of every US book).
2. **Turn on the website.** Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main**, folder **/docs**, then **Save**.
3. **Run it for the first time.** Go to the **Actions** tab, choose **fight-week**, then **Run workflow**. It takes about 5 minutes. When it finishes, the website shows the next card.
4. **History backfill (done; keeps itself current).** The **backfill-history** workflow runs every weekday morning. It adds ESPN's newest past cards, each bout's fight stats and every sportsbook's opening and closing line, and about 180 fighters' UFC.com career stats. Each run picks up where the last stopped. To start it now: Actions → backfill-history → Run workflow.

After that it runs on its own:

| When (Central time) | What happens |
| --- | --- |
| Monday night | Weekend results, full rebuild, backtest, picks |
| Every morning | Next card, latest lines (saved to the line history), picks |
| Wednesday to Friday evenings | Extra line snapshots; Friday's comes after the weigh-ins |
| Saturday midday and afternoon | Last lines before the prelims |
| Saturday night, every 20 minutes | Live status and results on the board; picks graded as fights end |

Once a fight starts, its prediction is frozen, so the record is always graded on the last pre-fight numbers.

## Live data sources

| Source | Key | What it gives | Script |
| --- | --- | --- | --- |
| ESPN UFC scoreboard | None | The card, bout order, weight class, rounds, live status, results, ESPN's moneylines | `src/espn.py` |
| The Odds API | `ODDS_API_KEY` (free: 500 credits a month, about 60 used) | Every US book's moneyline: average price, best price, line history | `src/get_odds.py` |
| ESPN core API (history backfill) | None | Per-fight strikes, takedowns, control time, submission attempts; every book's opening and closing line | `src/espn_backfill.py`, `src/import_espn_stats.py` |
| UFC.com athlete pages | None | Career stats incl. takedown defense, for the fighter pages, matchups and grappling flags (15 s between requests, per robots.txt) | `src/ufc_athletes.py` |
| SplitPicks | None | Which analysts picked which fighter, with confidence, for every card since April 2026 | `src/splitpicks.py`, tested by `src/expert_analysis.py` |
| DraftKings Network splits | None | Share of money and of bets on each fighter, logged every run (history starts Oct 2026) | `src/dk_splits.py` |
| ESPN upcoming cards | None | When each bout first appears and its weight class, for short-notice and missed-weight tests (log starts Oct 2026) | `src/card_log.py` |
| ESPN photos | None | Fighter headshots, linked from ESPN by athlete id | `src/site_data.py` |
| Ultimate UFC Dataset | None | 7,000+ fights since 2010 with closing odds, for training and the backtest | `src/get_data.py` |
| ESPN past cards (history backfill) | None | Results and ESPN's lines for every card since 2020 | `src/espn.py --history` |

ESPN's feed is undocumented. Each run saves its raw response to `data/raw/espn_scoreboard.json`, so if ESPN changes its format the fix is quick.

## Name spellings (rarely needed)

Sites spell fighters differently. The build matches most variants on its own: accents, spacing and hyphens ("Aori Qileng" / "Aoriqileng"), name order ("Choi Doo-ho" / "Dooho Choi") and short first names ("Zach" / "Zachary"); see `src/names.py`. If a bout still shows no line, open `data/name_map.csv` on GitHub, click the pencil icon, add a line with the other site's spelling and ours, and commit:

```
alias,name
Alex Volkanovski,Alexander Volkanovski
```

Committing that file reruns the picks straight away.

## How the model works

| Step | File | What it does |
| --- | --- | --- |
| Data | `src/get_data.py` | Merges the dataset and ESPN results into `data/fights.csv`; one spelling per fighter; impossible lines blanked and filled from other books |
| Ratings | `src/ratings.py` | Glicko-2 ratings; wins count by how they happened (a split decision moves ratings less than a KO) |
| Features | `src/features.py` | Ratings, age, reach, height, experience, form, finishing rates, durability. Style stats (strikes, takedowns, control) are built too, but tested and left out: the line already prices them |
| Model | `src/model.py` | Logistic regression on ratings + form (pinned in `config.py`), then a blend with the closing line that also adjusts for long layoffs and +300 underdogs |
| Picks | `src/picks.py` | Value pick: 3+ points over the line. Our pick: a value pick on the favorite or a 70%+ chance (no underdog past +150), or an expert lean: a close fight (line 40-60%) where 65%+ of 5+ analysts agree; none when both fighters debut. Suggested stake by price: 1.5u at -199 or longer, 1u from -200 to -399, 0.5u at -400 or shorter |
| Grading | `src/site_data.py` | Every pick graded at the average sportsbook's closing line (3+ books where available), never the best price |
| Backtest | `src/backtest.py` | Replays 2016 onward year by year using only earlier fights; once opening lines are in, also tests betting at the opening line and how often the line moves toward the pick |
| Site | `src/predict.py`, `docs/` | The card, rankings, record and backtest pages |

All tunable settings are in `src/config.py`. To test a change, edit a value and run the backtest (or ask Claude to). Keep a change only if it improves results across several years.

## Honest expectations

The record starts in 2020 (earlier years train the model but had too little history behind them to grade). It's a backtest: each fight predicted only from earlier fights, but the rules were chosen looking at these same years, so expect live results to come in below it. The model alone is less accurate than the closing line; its value is where it disagrees with the line on favorites. When the model likes a pick at the opening line, the line moved toward it about 62% of the time: bet early in fight week. Expert lean has only April 2026 onward behind it; its own record is on the Record page.

## Running it on your own computer (optional)

```
pip install -r requirements.txt
echo YOUR_KEY > key.txt        # key.txt is never uploaded (.gitignore)
python src/espn.py
python src/get_odds.py
python src/get_data.py --offline
python src/predict.py
cd docs && python -m http.server   # then open http://localhost:8000
```

Tests (no key needed): `python tests/test_parsers.py` and `bash tests/smoke_test.sh`.

Projections are for entertainment and analysis, not betting advice.

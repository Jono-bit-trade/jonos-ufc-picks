# Jono's UFC Picks

A UFC prediction model and website. It rates every UFC fighter, predicts each bout on the next card, compares that with the betting line, and publishes the picks. On fight night the site follows the card live: each bout shows when it's on and who won, and every pick is graded as the results come in.

Website: **https://jono-bit-trade.github.io/jonos-ufc-picks/** (live once setup step 2 below is done)

## One-time setup (about 5 minutes)

1. **Add your Odds API key as a secret.** Get a free key at https://the-odds-api.com. In this repository go to **Settings → Secrets and variables → Actions → New repository secret**. Name: `ODDS_API_KEY`. Value: your key. Without it the site still works, using ESPN's lines (one book instead of the median of every US book).
2. **Turn on the website.** Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main**, folder **/docs**, then **Save**.
3. **Run it for the first time.** Go to the **Actions** tab, choose **fight-week**, then **Run workflow**. It takes about 5 minutes. When it finishes, the website shows the next card.
4. **Optional, once:** run **backfill-fight-stats** from the Actions tab (about 3 hours). It collects strike, takedown and control-time stats for every fight since 2010 and reruns the backtest, so you can see whether style stats improve the model.

After that it runs on its own:

| When (Central time) | What happens |
| --- | --- |
| Monday night | Weekend results and fight stats, full rebuild, backtest, picks |
| Every morning | Next card, latest lines (saved to the line history), picks |
| Wednesday to Friday evenings | Extra line snapshots; Friday's comes after the weigh-ins |
| Saturday midday and afternoon | Last lines before the prelims |
| Saturday night, every 20 minutes | Live status and results on the board; picks graded as fights end |

Once a fight starts, its prediction is frozen, so the record is always graded on the last pre-fight numbers.

## Live data sources

| Source | Key | What it gives | Script |
| --- | --- | --- | --- |
| ESPN UFC scoreboard | None | The card, bout order, weight class, rounds, live status, results, ESPN's moneylines | `src/espn.py` |
| The Odds API | `ODDS_API_KEY` (free: 500 credits a month, about 60 used) | Every US book's moneyline: median, best price, line history | `src/get_odds.py` |
| UFCStats | None | Results with per-fight stats, fighter height, reach, stance and age, the next card as a fallback | `src/scrape_ufcstats.py` |
| Ultimate UFC Dataset | None | 7,000+ fights since 2010 with closing odds, for training and the backtest | `src/get_data.py` |

ESPN's feed is undocumented. Each run saves its raw response to `data/raw/espn_scoreboard.json`, so if ESPN changes its format the fix is quick.

## Your weekly job: name spellings

Sites sometimes spell a fighter differently. When that happens, a bout shows no line. Open `data/name_map.csv` on GitHub, click the pencil icon, add a line with the odds site's spelling and the UFCStats spelling, and commit:

```
alias,name
Alex Volkanovski,Alexander Volkanovski
```

Committing that file reruns the picks straight away.

## How the model works

| Step | File | What it does |
| --- | --- | --- |
| Data | `src/get_data.py` | Merges the dataset, your UFCStats scrape and ESPN results into `data/fights.csv` |
| Ratings | `src/ratings.py` | Glicko-2 ratings; wins count by how they happened (a split decision moves ratings less than a KO) |
| Features | `src/features.py` | Ratings, age, reach, height, experience, form, finishing rates, durability, layoffs, weight-class moves, five-rounders, altitude, stance, and style stats after the backfill |
| Model | `src/model.py` | Logistic regression (the backtest picks it over boosted trees), a method-of-victory model, and a final blend with the line |
| Backtest | `src/backtest.py` | Replays 2016 onward year by year using only earlier fights |
| Site | `src/predict.py`, `docs/` | The card, rankings, record and backtest pages |

All tunable settings are in `src/config.py`. To test a change, edit a value and run the backtest (or ask Claude to). Keep a change only if it improves results across several years.

## Honest expectations

On 2016 to 2026 fights the model alone is less accurate than the closing line (log loss 0.655 vs. 0.608). Blended with the line it's slightly better (0.6038 vs. 0.6051 on 2018 to 2026), and flat betting at a 3-point edge came out about break-even. Treat picks as paper trades until the live record beats the line over a full year. The Record page tracks how often the line moved toward each pick, the earliest sign of real edge.

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

#!/usr/bin/env bash
# Commit and push what this run produced in data/ and docs/, on top of the latest main.
#
# Only data/ and docs/data/ are saved: the site's code in docs/ is never touched by a run.
# Every run rebuilds the site files in full, so this run's copies replace main's wholesale
# (a file-by-file merge could mix two runs' outputs). One exception: if the code on main changed
# after this run started, its rebuilt files are out of date. Then only the data it collected is
# kept (lines, splits, results, UFC.com numbers) and main's site files stay; the push that changed
# the code starts its own run, which rebuilds them.
set -u
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
START=$(git rev-parse HEAD)
REBUILT="docs/data data/fights.csv data/model_history.csv data/backtest_log.csv data/backtest_summary.json
  data/backtest_early.csv data/market_blend.json data/model_config.json data/final_stack.json
  data/edges.csv data/expert_walkforward.csv"

for i in 1 2 3; do
  git fetch -q origin main || { sleep 5; continue; }
  git reset -q --mixed origin/main          # index = latest main; working tree = this run's files
  if ! git diff --quiet "$START" origin/main -- src; then
    echo "Code changed since this run started: keeping collected data, not rebuilt site files"
    for p in $REBUILT; do git checkout -q origin/main -- "$p" 2>/dev/null || true; done
  fi
  # the site's code (docs/*.html, *.js, *.css) only changes by hand: always keep main's copy
  git ls-files -z docs | grep -zv '^docs/data/' | xargs -0 -r git checkout -q origin/main -- 2>/dev/null || true
  git checkout -q origin/main -- data/name_map.csv 2>/dev/null || true   # edited by hand too
  git add -A data docs/data
  git commit -q -m "$1 $(date -u +%Y-%m-%dT%H:%MZ)" || { echo "No changes"; exit 0; }
  git push -q origin HEAD:main && exit 0
  sleep 5
done
echo "Push failed after 3 tries"; exit 1

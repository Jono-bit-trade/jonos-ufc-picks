#!/usr/bin/env bash
# Commit and push whatever changed in data/ and docs/, retrying if another run pushed first.
set -u
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add data docs
git commit -q -m "$1 $(date -u +%Y-%m-%dT%H:%MZ)" || { echo "No changes"; exit 0; }
for i in 1 2 3; do
  git pull --rebase -X theirs -q && git push -q && exit 0
  sleep 5
done
echo "Push failed after 3 tries"; exit 1

"""A running log of every announced bout on the next few UFC cards, for two future tests:

  short notice: when a bout first appeared (a fighter who takes a fight 2 weeks out has a short
                camp, often because someone got hurt). first_seen is the first run that saw it.
  missed weight: the weight class at first sight and at the last pre-fight sight. A bout that
                turns into a catchweight in fight week is usually a missed weight.

ESPN's scoreboard is read for each upcoming event date (docs/data/upcoming.json). One row per bout:
data/card_log.csv. It only grows from today; nothing like it exists for past cards.

Run:  python src/card_log.py
"""
import datetime as dt, json, os, time
import pandas as pd
from common import path, SITE
from config import OFFLINE
from get_odds import norm
import espn


def main():
    up = os.path.join(SITE, "data", "upcoming.json")
    dates = [e["date"] for e in json.load(open(up))][:6] if os.path.exists(up) else []
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    seen = []
    for d in dates:
        if OFFLINE:
            break
        try:
            card = espn.parse(espn.fetch(d.replace("-", "")))
        except Exception as e:   # one bad date shouldn't stop the rest
            print("ESPN", d, type(e).__name__)
            continue
        card = card[card["state"].eq("pre")] if len(card) else card
        for r in card.itertuples():
            seen.append({"key": f"{r.date}|{'|'.join(sorted((norm(r.a), norm(r.b))))}", "date": r.date, "event": r.event,
                         "a": r.a, "b": r.b, "weight_class": r.weight_class})
        time.sleep(1)
    f = path("card_log.csv")
    log = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame(
        columns=["key", "date", "event", "a", "b", "first_seen", "last_seen", "wc_first", "wc_last"])
    log = log.set_index("key")
    for s in seen:
        if s["key"] in log.index:
            log.loc[s["key"], ["last_seen", "wc_last", "event"]] = [now, s["weight_class"], s["event"]]
        else:
            log.loc[s["key"]] = {"date": s["date"], "event": s["event"], "a": s["a"], "b": s["b"], "first_seen": now,
                                 "last_seen": now, "wc_first": s["weight_class"], "wc_last": s["weight_class"]}
    log.reset_index().to_csv(f, index=False)
    print(f"card log: {len(seen)} bouts seen across {len(dates)} upcoming cards; {len(log)} logged")


if __name__ == "__main__":
    main()

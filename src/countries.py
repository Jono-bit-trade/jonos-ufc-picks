"""Each fighter's country, for the flag next to their name.

ESPN's scoreboard lists the country each fighter represents (the flag ESPN shows). The live feed
(src/espn.py) now keeps it for every new card; for past cards this goes back through the saved card
dates once, a few hundred light requests, and remembers which it has done. Fighters ESPN has no
country for fall back to the country of birth on their UFC.com page.

Writes data/fighter_countries.csv: name, espn_id, country, iso (ISO 3166 code, or gb-eng style for
the UK nations, as the flag files are named), source.

Run:  python src/countries.py [minutes]   (default 12)
"""
import html, os, re, sys, time
import pandas as pd
from common import path
from config import OFFLINE

OUT, DONE = "fighter_countries.csv", "countries_done.txt"
SPECIAL = {   # names pycountry doesn't resolve the way the flags need
    "usa": "us", "united states": "us", "united states of america": "us", "england": "gb-eng",
    "scotland": "gb-sct", "wales": "gb-wls", "northern ireland": "gb-nir", "united kingdom": "gb",
    "great britain": "gb", "uk": "gb", "russia": "ru", "south korea": "kr", "korea": "kr",
    "north korea": "kp", "republic of korea": "kr", "iran": "ir", "moldova": "md", "czech republic": "cz",
    "czechia": "cz", "bolivia": "bo", "venezuela": "ve", "vietnam": "vn", "taiwan": "tw", "syria": "sy",
    "palestine": "ps", "kosovo": "xk", "laos": "la", "tanzania": "tz", "turkey": "tr", "türkiye": "tr",
    "dr congo": "cd", "democratic republic of congo": "cd", "democratic republic of the congo": "cd", "congo": "cg", "ivory coast": "ci",
    "cote d'ivoire": "ci", "macau": "mo", "hong kong": "hk", "brasil": "br", "the netherlands": "nl",
    "holland": "nl", "bosnia": "ba", "bosnia and herzegovina": "ba", "cape verde": "cv",
}


def iso(country):
    c = html.unescape(str(country or "")).replace("&", "and").strip()
    if not c or c.lower() == "nan":
        return None
    if c.lower() in SPECIAL:
        return SPECIAL[c.lower()]
    import pycountry
    try:
        return pycountry.countries.lookup(c).alpha_2.lower()
    except LookupError:
        try:
            return pycountry.countries.search_fuzzy(c)[0].alpha_2.lower()
        except LookupError:
            return None


def from_scoreboard(js):
    """[(espn athlete id, name, country)] from one ESPN scoreboard response."""
    out = []
    for ev in js.get("events", []):
        for comp in ev.get("competitions", []):
            for c in comp.get("competitors") or []:
                a = c.get("athlete") or {}
                country = (a.get("flag") or {}).get("alt")
                if country and country.lower() != "default" and c.get("id"):
                    out.append((str(c["id"]), a.get("displayName") or a.get("fullName"), country))
    return out


def main(minutes=12):
    import espn
    f = path(OUT)
    have = pd.read_csv(f, dtype={"espn_id": str}) if os.path.exists(f) else pd.DataFrame(columns=["name", "espn_id", "country", "iso", "source"])
    espn_rows = have[have["source"] == "espn"]
    found = {r.espn_id: (r.name, r.country) for r in espn_rows.itertuples() if str(r.country).lower() != "default"}
    # 1) countries the live feed already saved on the cards
    for fn in ("espn_card.csv", "espn_history.csv"):
        p = path(fn)
        if os.path.exists(p):
            d = espn.ids_as_text(pd.read_csv(p, dtype=str))
            for s in "ab":
                if f"country_{s}" in d:
                    for i, n, c in zip(d[f"espn_id_{s}"], d[s], d[f"country_{s}"]):
                        if isinstance(c, str) and isinstance(i, str) and c.lower() != "default":
                            found[i] = (n, c)
    # 2) past card dates not yet looked at, a few hundred light requests in all
    done = set(open(path(DONE)).read().split()) if os.path.exists(path(DONE)) else set()
    h = pd.read_csv(path("espn_history.csv"), dtype=str)
    days = sorted(set(h["queried"].dropna().str[:8]) - done, reverse=True)
    stop, n = time.time() + minutes * 60, 0
    if not OFFLINE:
        for day in days:
            if time.time() > stop:
                break
            try:
                for i, name, c in from_scoreboard(espn.fetch(day)):
                    found[i] = (name, c)
                done.add(day)
                n += 1
            except Exception as e:
                print(day, "failed:", type(e).__name__)
            time.sleep(0.4)
        open(path(DONE), "w").write("\n".join(sorted(done)))
    print(f"looked at {n} past cards, {len(days) - n} left")
    rows = [{"name": nm, "espn_id": i, "country": c, "iso": iso(c), "source": "espn"} for i, (nm, c) in found.items()]
    # 3) country of birth from UFC.com for anyone ESPN gave no country
    names = {r["name"] for r in rows}
    u = path("ufc_athletes.csv")
    if os.path.exists(u):
        a = pd.read_csv(u)
        if "birthplace" in a:
            for r in a.dropna(subset=["birthplace"]).itertuples():
                if r.name not in names:
                    c = r.birthplace.split(",")[-1].strip()
                    c = "USA" if c in ("United States", "United States of America") else c   # ESPN's spelling
                    rows.append({"name": r.name, "espn_id": None, "country": c, "iso": iso(c), "source": "ufc.com birthplace"})
    out = pd.DataFrame(rows)
    out.to_csv(f, index=False)
    miss = out[out["iso"].isna()]["country"].value_counts()
    print(f"{OUT}: {len(out)} fighters, {out['iso'].notna().sum()} with a flag" + (f"; unmatched: {dict(miss.head(10))}" if len(miss) else ""))


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 12)

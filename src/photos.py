"""Freely licensed fighter photos from Wikimedia Commons, with the credit each license requires.

Wikidata lists mixed martial artists with a photo (property P18); those photos live on Wikimedia
Commons under licenses like CC BY-SA that allow reuse with credit. This collects, for every
fighter we can match by name: the file, a thumbnail address, the author and the license.
Writes data/photos_commons.csv. The site shows them per config.PHOTO_MODE and lists every
credit on its Photo credits page.

Run:  python src/photos.py
"""
import html, os, re, sys, time
import pandas as pd
import requests
from common import path
from names import same_fighter

UA = {"User-Agent": "OctagonEdge/1.0 (https://github.com/Jono-bit-trade/jonos-ufc-picks; fight picks site)"}
SPARQL = """SELECT ?p ?pLabel ?img WHERE {
  ?p wdt:P106 wd:Q11607585; wdt:P18 ?img.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}"""


def wikidata_photos():
    r = requests.get("https://query.wikidata.org/sparql", params={"query": SPARQL, "format": "json"},
                     headers=UA, timeout=120)
    r.raise_for_status()
    rows = []
    for b in r.json()["results"]["bindings"]:
        name = b["pLabel"]["value"]
        if re.fullmatch(r"Q\d+", name):     # no English label
            continue
        file = requests.utils.unquote(b["img"]["value"].rsplit("/", 1)[-1])
        rows.append({"wikidata": b["p"]["value"].rsplit("/", 1)[-1], "wiki_name": name, "file": file})
    return pd.DataFrame(rows).drop_duplicates("wikidata")


def clean(s):
    return html.unescape(re.sub(r"<[^>]+>", "", str(s or ""))).strip()


def commons_meta(files):
    """Author, license and a 300px thumbnail for each Commons file, 50 per request."""
    out = {}
    for i in range(0, len(files), 50):
        chunk = files[i:i + 50]
        r = requests.get("https://commons.wikimedia.org/w/api.php", headers=UA, timeout=60, params={
            "action": "query", "format": "json", "prop": "imageinfo", "iiprop": "extmetadata|url",
            "iiurlwidth": 300, "titles": "|".join("File:" + f for f in chunk)})
        r.raise_for_status()
        for pg in r.json().get("query", {}).get("pages", {}).values():
            ii = (pg.get("imageinfo") or [{}])[0]
            m = ii.get("extmetadata") or {}
            out[pg["title"][5:]] = {
                "thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"),
                "author": clean((m.get("Artist") or {}).get("value"))[:120],
                "license": clean((m.get("LicenseShortName") or {}).get("value")),
                "license_url": clean((m.get("LicenseUrl") or {}).get("value")),
            }
        time.sleep(0.5)
    return out


def main():
    f = pd.read_csv(path("fights.csv"))
    ours = pd.Series(pd.concat([f["a"], f["b"]]).unique())
    wd = wikidata_photos()
    print(f"Wikidata: {len(wd)} mixed martial artists with a photo")
    by_last = {}
    for r in wd.itertuples():
        by_last.setdefault(r.wiki_name.split()[-1].lower(), []).append(r)
    matched = []
    for n in ours:
        cands = [r for r in by_last.get(str(n).split()[-1].lower(), []) if same_fighter(n, r.wiki_name)]
        if len(cands) == 1:   # one clear match only
            matched.append({"name": n, **cands[0]._asdict()})
    m = pd.DataFrame(matched)
    if m.empty:
        print("no matches")
        return
    meta = commons_meta(list(m["file"].unique()))
    for k in ("thumb", "page", "author", "license", "license_url"):
        m[k] = [meta.get(x, {}).get(k) for x in m["file"]]
    ok = m["thumb"].notna() & m["license"].fillna("").str.contains(r"CC|Public domain|PD", case=False)
    m = m[ok].drop(columns=["Index"], errors="ignore")
    m.to_csv(path("photos_commons.csv"), index=False)
    print(f"photos_commons.csv: {len(m)} of {len(ours)} fighters have a freely licensed photo")


if __name__ == "__main__":
    main()

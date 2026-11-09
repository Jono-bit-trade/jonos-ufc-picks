"""The link-preview image (og:image) from the current record, so shared links never show old numbers.

  python src/og_image.py check    prints "stale" when the record has changed since the image was made
  python src/og_image.py render   draws docs/data/og-<key>.png (needs Python Playwright + Chromium)
  python src/og_image.py meta     points docs/index.html's preview tags at the newest image

Each image gets a new file name: X, iMessage, Slack and others cache previews by image URL, so a new
name is what makes them show the new numbers. The save step (.github/save.sh) runs "meta" on top of
main's index.html, so hand edits to the page are kept."""
import base64, glob, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
OUT = os.path.join(DOCS, "data")
STATE = os.path.join(OUT, "og.json")
SITE = "https://jono-bit-trade.github.io/jonos-ufc-picks/"


def units(u):
    return ("+" if u > 0 else "−" if u < 0 else "") + f"{abs(u):.1f}u"


def numbers():
    mr = json.load(open(os.path.join(OUT, "model_record.json")))
    s = mr.get("since") or mr["all"]
    v = s.get("vs_line") or {}
    n = {"pct": s["our_pct"], "won": s["our_won"], "lost": s["our_bets"] - s["our_won"], "units": units(s["our_units"]),
         "fav": units(v["line_units"]) if v.get("line_units") is not None else None, "from": mr.get("from", 2020)}
    n["key"] = hashlib.sha1(json.dumps(n, sort_keys=True).encode()).hexdigest()[:8]
    return n


def state():
    try:
        return json.load(open(STATE))
    except (OSError, ValueError):
        return {}


def check():
    n, st = numbers(), state()
    fresh = st.get("key") == n["key"] and os.path.exists(os.path.join(OUT, st.get("file", "-")))
    print("fresh" if fresh else "stale")


def render():
    from playwright.sync_api import sync_playwright
    n = numbers()
    cage = "data:image/svg+xml;base64," + base64.b64encode(open(os.path.join(DOCS, "cage.svg"), "rb").read()).decode()
    html = open(os.path.join(ROOT, "src", "og_template.html")).read()
    for k, val in {"CAGE": cage, "{{PCT}}": n["pct"], "{{UNITS}}": n["units"], "{{FROM}}": n["from"], "{{FAV}}": n["fav"] or "–"}.items():
        html = html.replace(k, str(val))
    name = f"og-{n['key']}.png"
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        fonts = os.environ.get("OG_FONT_DIR")   # local runs without Google Fonts access: a @fontsource folder
        if fonts:
            css = "".join(f'@font-face{{font-family:"{fam}";font-weight:{w};src:url(http://fontfiles.local/{d}/files/{d}-latin-{w}-normal.woff2) format("woff2")}}'
                          for fam, d, ws in [("Big Shoulders Display", "big-shoulders-display", (700, 800, 900)), ("Barlow", "barlow", (400, 500, 600))] for w in ws)
            pg.route(re.compile(r"fonts\.googleapis\.com"), lambda r: r.fulfill(status=200, content_type="text/css", body=css))
            pg.route(re.compile(r"fontfiles\.local"), lambda r: r.fulfill(status=200, content_type="font/woff2",
                     headers={"access-control-allow-origin": "*"}, body=open(os.path.join(fonts, r.request.url.split("fontfiles.local/")[1]), "rb").read()))
        pg.set_content(html, wait_until="networkidle")
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(OUT, name))
        b.close()
    for old in glob.glob(os.path.join(OUT, "og-*.png")):
        if os.path.basename(old) != name:
            os.remove(old)
    json.dump({"key": n["key"], "file": name,
               "description": f"UFC picks posted before every fight and graded after it, win or lose. "
                              f"Our picks are {n['won']}-{n['lost']} since {n['from']}, {n['units']} at flat 1 unit."},
              open(STATE, "w"), indent=1)
    print("wrote", name)


def meta():
    st = state()
    if not st.get("file") or not os.path.exists(os.path.join(OUT, st["file"])):
        return
    p = os.path.join(DOCS, "index.html")
    s = open(p).read()
    img = SITE + "data/" + st["file"]
    s2 = re.sub(r'(<meta property="og:image" content=")[^"]*(")', rf"\g<1>{img}\g<2>", s)
    s2 = re.sub(r'(<meta name="twitter:image" content=")[^"]*(")', rf"\g<1>{img}\g<2>", s2)
    for tag in (r'<meta property="og:description" content="', r'<meta name="description" content="', r'<meta name="twitter:description" content="'):
        s2 = re.sub("(" + re.escape(tag) + r')[^"]*(")', lambda m: m.group(1) + st["description"] + m.group(2), s2)
    if s2 != s:
        open(p, "w").write(s2)
        print("index.html preview tags updated")


if __name__ == "__main__":
    {"check": check, "render": render, "meta": meta}[sys.argv[1] if len(sys.argv) > 1 else "check"]()

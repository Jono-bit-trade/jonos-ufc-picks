"""Scrape UFCStats for (1) completed events newer than your data and
(2) the next upcoming card. Writes:
  data/scraped_fights.csv  fights in the same columns as fights.csv (no odds)
  data/fight_stats.csv     per-fighter totals for each scraped fight (strikes, takedowns, control)
  data/fighters.csv        profile per fighter: height, reach, stance, birth date
  data/upcoming.csv        the next card's matchups

Run:  python src/scrape_ufcstats.py              (new events + upcoming card)
      python src/scrape_ufcstats.py --backfill   (every event since 2010, once: ~7,500
                                                  fight pages, about 3 hours, for STYLE stats)
UFCStats is http only and has no API, so this reads its public pages slowly (1 second apart).
"""
import os, re, time, datetime as dt, requests, pandas as pd
from bs4 import BeautifulSoup
from common import path

BASE = "http://ufcstats.com"
S = requests.Session()
S.headers["User-Agent"] = "personal ufc prediction model"
DELAY = 1.0


def page(url):
    r = S.get(url, timeout=30)
    r.raise_for_status()
    time.sleep(DELAY)
    return BeautifulSoup(r.text, "lxml")


def clean(x):
    return re.sub(r"\s+", " ", x).strip()


def labelled(soup, selector="li.b-list__box-list-item"):
    """{'Date': 'June 1, 2020', 'Location': ...} from the label: value list items."""
    out = {}
    for li in soup.select(selector):
        i = li.select_one("i")
        if i:
            key = clean(i.get_text()).rstrip(":").lower()
            out[key] = clean(li.get_text().replace(i.get_text(), "", 1))
    return out


# ---------- events ----------
def event_urls(kind="completed"):
    s = page(f"{BASE}/statistics/events/{kind}?page=all")
    seen, out = set(), []
    for a in s.find_all("a", href=True):
        if "event-details" in a["href"] and a["href"] not in seen:
            seen.add(a["href"])
            out.append(a["href"])
    return out   # newest first on the site


def parse_event(soup):
    info = labelled(soup)
    date = dt.datetime.strptime(info.get("date", ""), "%B %d, %Y").strftime("%Y-%m-%d")
    name = clean(soup.select_one("h2").get_text())
    fights = [a["href"] for a in soup.select("a.b-flag[href*='fight-details']")]
    return {"event": name, "date": date, "location": info.get("location", ""),
            "fight_urls": list(dict.fromkeys(fights))}


# ---------- fights ----------
def of(x):  # "45 of 102" -> (45, 102)
    a, b = x.split(" of ")
    return int(a), int(b)


def secs(x):  # "3:21" -> 201
    m, s = x.split(":")
    return int(m) * 60 + int(s)


def method_of(text):
    t = text.upper()
    if "KO" in t:
        return "KO"
    if "SUB" in t:
        return "SUB"
    if "DECISION" in t:
        return "DEC"
    return "OTHER"


def finish_of(text):
    """Same labels as the dataset: KO/TKO, SUB, U-DEC, S-DEC, M-DEC, other."""
    t = text.upper()
    for key, label in [("UNANIMOUS", "U-DEC"), ("SPLIT", "S-DEC"), ("MAJORITY", "M-DEC")]:
        if key in t:
            return label
    m = method_of(text)
    return {"KO": "KO/TKO", "SUB": "SUB"}.get(m, m)


def parse_fight(soup):
    people = soup.select("div.b-fight-details__person")
    status = [clean(p.select_one("i").get_text()) for p in people]   # W, L, D, NC
    links = [p.select_one("a")["href"] for p in people]
    names = [clean(p.select_one("a").get_text()) for p in people]
    title_text = clean(soup.select_one("i.b-fight-details__fight-title").get_text())
    info = {}
    for i in soup.select("i.b-fight-details__text-item_first, i.b-fight-details__text-item"):
        t = clean(i.get_text())
        if ":" in t:
            k, v = t.split(":", 1)
            info[k.strip().lower()] = v.strip()
    fmt = info.get("time format", "")
    rounds = int(fmt[0]) if fmt[:1].isdigit() else None
    end_round = int(info.get("round", 0) or 0)
    end_time = secs(info["time"]) if ":" in info.get("time", "") else 0
    fight_secs = (end_round - 1) * 300 + end_time if end_round else None
    if status == ["W", "L"]:
        winner = "a"
    elif status == ["L", "W"]:
        winner = "b"
    elif status == ["D", "D"]:
        winner = "draw"
    else:
        winner = "nc"
    # first table = fight totals: Fighter, KD, Sig. str., Sig. str. %, Total str., Td, Td %, Sub. att, Rev., Ctrl
    cells = soup.select("tbody tr")[0].select("td")
    col = lambda k: [clean(p.get_text()) for p in cells[k].select("p")]
    kd, sig, td, sub, ctrl = col(1), col(2), col(5), col(7), col(9)
    stats = []
    for i in (0, 1):
        j = 1 - i
        stats.append({
            "fighter": names[i], "fighter_url": links[i], "opponent": names[j],
            "won": int(status[i] == "W"), "kd": int(kd[i]),
            "sig_landed": of(sig[i])[0], "sig_att": of(sig[i])[1], "sig_absorbed": of(sig[j])[0],
            "td_landed": of(td[i])[0], "td_att": of(td[i])[1], "td_allowed": of(td[j])[0],
            "td_faced": of(td[j])[1], "sub_att": int(sub[i]),
            "ctrl_secs": secs(ctrl[i]) if ":" in ctrl[i] else 0, "fight_secs": fight_secs,
        })
    fight = {
        "a": names[0], "b": names[1], "a_url": links[0], "b_url": links[1],
        "weight_class": re.sub(r"(UFC |Interim |Title |Bout)", "", title_text).strip(),
        "gender": "F" if "Women" in title_text else "M", "title": "Title" in title_text,
        "rounds": rounds, "winner": winner, "method": method_of(info.get("method", "")),
        "finish": finish_of(info.get("method", "")),
        "end_round": end_round, "fight_secs": fight_secs,
    }
    return fight, stats


# ---------- fighters ----------
def parse_fighter(soup):
    info = labelled(soup)

    def inches(x):  # 6' 1" -> 73
        m = re.match(r"(\d+)'\s*(\d+)", x or "")
        return int(m.group(1)) * 12 + int(m.group(2)) if m else None

    reach = re.match(r"(\d+)", info.get("reach", "") or "")
    try:
        dob = dt.datetime.strptime(info.get("dob", ""), "%b %d, %Y").strftime("%Y-%m-%d")
    except ValueError:
        dob = None
    rec = soup.select_one("span.b-content__title-record")
    return {
        "name": clean(soup.select_one("span.b-content__title-highlight").get_text()),
        "height_cm": round(inches(info.get("height")) * 2.54, 2) if inches(info.get("height")) else None,
        "reach_cm": round(int(reach.group(1)) * 2.54, 2) if reach else None,
        "stance": info.get("stance") or None, "dob": dob,
        "pro_record": clean(rec.get_text()).replace("Record:", "").strip() if rec else None,
    }


def fighter_profiles(urls):
    """Fetch profiles for fighters not already in data/fighters.csv."""
    f = path("fighters.csv")
    old = pd.read_csv(f) if os.path.exists(f) else pd.DataFrame(columns=["url"])
    todo = [u for u in dict.fromkeys(urls) if u not in set(old["url"])]
    rows = []
    for u in todo:
        try:
            rows.append({"url": u, **parse_fighter(page(u))})
        except Exception as e:
            print("fighter failed", u, e)
    allf = pd.concat([old, pd.DataFrame(rows)], ignore_index=True)
    allf.to_csv(f, index=False)
    return allf


def attach_profiles(fights, profiles):
    p = profiles.set_index("url")
    for s in "ab":
        u = fights[f"{s}_url"]
        fights[f"height_{s}"] = u.map(p["height_cm"])
        fights[f"reach_{s}"] = u.map(p["reach_cm"])
        fights[f"stance_{s}"] = u.map(p["stance"])
        dob = pd.to_datetime(u.map(p["dob"]), errors="coerce")
        fights[f"age_{s}"] = ((pd.to_datetime(fights["date"]) - dob).dt.days // 365.25)
    return fights


# ---------- main jobs ----------
def save(fights, stats):
    """Append scraped fights and stats, with fighter profiles, to the data files."""
    if not fights:
        return
    new = pd.DataFrame(fights)
    profiles = fighter_profiles(list(new["a_url"]) + list(new["b_url"]))
    new = attach_profiles(new, profiles)
    for name, df, key in [("scraped_fights.csv", new, ["fight_id"]),
                          ("fight_stats.csv", pd.DataFrame(stats), ["fight_id", "fighter"])]:
        f = path(name)
        if os.path.exists(f):
            df = pd.concat([pd.read_csv(f), df]).drop_duplicates(key, keep="last")
        df.to_csv(f, index=False)


def scrape_new_events(after_date, skip_urls=()):
    """Every completed event after `after_date` (YYYY-MM-DD), saved event by event
    so a long backfill keeps its progress if it stops."""
    total = 0
    for url in event_urls("completed"):
        ev = parse_event(page(url))
        if ev["date"] <= after_date:
            break   # the list is newest first
        todo = [u for u in ev["fight_urls"] if u not in skip_urls]
        if not todo:
            continue
        print("event", ev["date"], ev["event"], len(todo), "fights")
        fights, stats = [], []
        for fu in todo:
            try:
                f, st = parse_fight(page(fu))
            except Exception as e:
                print("fight failed", fu, e)
                continue
            fid = f"{ev['date']}|{f['a']}|{f['b']}"
            fights.append({**f, "fight_id": fid, "fight_url": fu, "date": ev["date"], "event": ev["event"],
                           "location": ev["location"], "source": "ufcstats"})
            stats += [{**s, "fight_id": fid, "date": ev["date"]} for s in st]
        save(fights, stats)
        total += len(fights)
    return total


def scrape_upcoming():
    """Matchups on the next scheduled card."""
    urls = event_urls("upcoming")
    if not urls:
        return pd.DataFrame()
    soup = page(urls[-1])   # upcoming list is soonest last
    info = labelled(soup)
    try:
        date = dt.datetime.strptime(info.get("date", ""), "%B %d, %Y").strftime("%Y-%m-%d")
    except ValueError:
        date = None
    rows = []
    for k, tr in enumerate(soup.select("tr.b-fight-details__table-row")):
        fl = [a for a in tr.select("a[href*='fighter-details']")]
        if len(fl) < 2:
            continue
        text = clean(tr.get_text(" "))
        wc = re.search(r"(Women's \w+|\w+ ?\w*weight|Catch Weight)", text)
        rows.append({"date": date, "event": clean(soup.select_one("h2").get_text()),
                     "location": info.get("location", ""), "a": clean(fl[0].get_text()),
                     "b": clean(fl[1].get_text()), "a_url": fl[0]["href"], "b_url": fl[1]["href"],
                     "weight_class": wc.group(1) if wc else "", "gender": "F" if "Women" in text else "M",
                     "title": False, "rounds": 5 if k == 0 else 3})   # first bout listed = main event
    return pd.DataFrame(rows)


if __name__ == "__main__":
    import sys
    from get_data import RAW
    scraped = path("scraped_fights.csv")
    done = set(pd.read_csv(scraped)["fight_url"].dropna()) if os.path.exists(scraped) and \
        "fight_url" in pd.read_csv(scraped, nrows=1) else set()
    if "--upcoming-only" not in sys.argv:
        if "--backfill" in sys.argv:
            last = "2010-01-01"
        else:   # newest date with UFCStats stats: the dataset's end, or our own last scrape
            dates = [pd.read_csv(os.path.join(RAW, "ufc-master.csv"), usecols=["date"])["date"].max()] \
                if os.path.exists(os.path.join(RAW, "ufc-master.csv")) else ["2010-01-01"]
            if os.path.exists(scraped):
                dates.append(pd.read_csv(scraped)["date"].max())
            last = max(dates)
        print("new fights:", scrape_new_events(last, done))
    up = scrape_upcoming()
    if len(up):
        profiles = fighter_profiles(list(up["a_url"]) + list(up["b_url"]))
        up = attach_profiles(up, profiles)
        up.to_csv(path("upcoming.csv"), index=False)
        print("upcoming:", up["event"].iloc[0], up["date"].iloc[0], len(up), "bouts")

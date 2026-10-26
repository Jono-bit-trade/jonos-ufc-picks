"""Matching a bout from another site to our fight list when the names are spelled differently:
"Zachary Reese" / "Zach Reese", "Choi Doo-ho" / "Dooho Choi", "Cameron Rowston" / "Cam Rowston".

A bout matches when it's on the same date (give or take a day) and both fighters match, where a
fighter matches on the same letters, the same name parts in any order, or the same surname with
a first name that starts the same way. Only one candidate bout may match, or none is used.

align(df) rewrites the a/b names in a SplitPicks table to our spelling. Run alone to align the
saved expert files:  python src/names.py
"""
import datetime as dt, os, re, unicodedata
import pandas as pd
from common import path


def parts(n):
    s = unicodedata.normalize("NFKD", str(n)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii)\b\.?", "", s).replace("-", "").replace("'", "").replace(".", "")
    return [p for p in s.split() if p]


def same_fighter(x, y):
    px, py = parts(x), parts(y)
    if not px or not py:
        return False
    if "".join(px) == "".join(py) or sorted(px) == sorted(py):
        return True
    if px[-1] == py[-1] and (px[0].startswith(py[0][:3]) or py[0].startswith(px[0][:3])):
        return True          # same surname, first name shortened (Zach/Zachary, Cam/Cameron)
    return False


def surname_match(x, y):
    px, py = parts(x), parts(y)
    return bool(px and py) and (px[-1] == py[-1] or px[-1] in py or py[-1] in px)


class Index:
    def __init__(self, bouts):
        """bouts: rows with date, a, b (our fight list and the upcoming card)."""
        self.by_date = {}
        for d, a, b in zip(bouts["date"].astype(str), bouts["a"], bouts["b"]):
            self.by_date.setdefault(d, []).append((a, b))

    def find(self, date, a, b):
        """Our (a, b) spelling for this bout, in the order given, or None."""
        cands = []
        d0 = dt.date.fromisoformat(str(date)[:10])
        for d in [(d0 + dt.timedelta(days=k)).isoformat() for k in (-1, 0, 1)]:
            for x, y in self.by_date.get(d, []):
                for p, q in ((x, y), (y, x)):
                    sa, sb = same_fighter(a, p), same_fighter(b, q)
                    if (sa and sb) or (sa and surname_match(b, q)) or (sb and surname_match(a, p)):
                        cands.append((p, q))
        cands = list(dict.fromkeys(cands))
        return cands[0] if len(cands) == 1 else None


def reference():
    frames = [pd.read_csv(path(f))[["date", "a", "b"]] for f in ("fights.csv", "espn_card.csv", "upcoming.csv")
              if os.path.exists(path(f))]
    return Index(pd.concat(frames, ignore_index=True)) if frames else None


def align(df, idx=None):
    """Rewrite a/b (and 'pick' when present) to our spelling where a bout matches."""
    idx = idx or reference()
    if idx is None or df.empty:
        return df
    df = df.copy()
    for i, r in df.iterrows():
        hit = idx.find(r["date"], r["a"], r["b"])
        if hit is None:
            continue
        if "pick" in df and isinstance(r.get("pick"), str):
            df.at[i, "pick"] = hit[0] if r["pick"] == r["a"] else hit[1] if r["pick"] == r["b"] else r["pick"]
        df.at[i, "a"], df.at[i, "b"] = hit
    return df


def main():
    idx = reference()
    for f in ("expert_consensus.csv", "expert_picks.csv", "expert_consensus_winning.csv"):
        p = path(f)
        if os.path.exists(p):
            d = pd.read_csv(p)
            before = set(zip(d["a"], d["b"]))
            d = align(d, idx)
            d.to_csv(p, index=False)
            print(f"{f}: {len(before - set(zip(d['a'], d['b'])))} bouts respelled")


if __name__ == "__main__":
    main()

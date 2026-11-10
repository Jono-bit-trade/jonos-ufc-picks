// Octagon Edge: a small single-page site. Each view reads JSON files from docs/data/.
const $ = s => document.querySelector(s);
const pct = p => p == null ? "–" : Math.round(p * 100) + "%";
const odds = o => o == null ? "–" : (o > 0 ? "+" : "") + Math.round(o);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const cache = {};
const get = (f, fresh) => {
  if (!fresh && cache[f]) return cache[f];
  return cache[f] = fetch("data/" + f + "?t=" + (fresh ? Date.now() : Math.floor(Date.now() / 60000)), {cache: "no-cache"}).then(r => r.ok ? r.json() : null).catch(() => null);
};
const fair = (a, b) => {
  const imp = o => o < 0 ? -o / (-o + 100) : 100 / (o + 100);
  return a == null || b == null ? null : imp(a) / (imp(a) + imp(b));
};
const slug = s => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dateLong = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, {weekday: "short", month: "long", day: "numeric", year: "numeric"});
const cm = c => c == null ? "–" : `${Math.floor(c / 2.54 / 12)}'${Math.round(c / 2.54 % 12)}"`;
const inch = c => c == null ? "–" : Math.round(c / 2.54) + '"';

// fighter photo: ESPN headshot or a freely licensed Wikimedia Commons photo (photos.json says which
// comes first), with initials underneath when there's none
let PHOTOS = {mode: "espn_first", photos: {}};
function photoSrc(id, name) {
  const c = PHOTOS.photos[slug(name || "")], espn = id ? `https://a.espncdn.com/i/headshots/mma/players/full/${esc(id)}.png` : null;
  if (PHOTOS.mode === "commons_only") return c ? [c.src] : [];
  if (PHOTOS.mode === "commons_first") return [c && c.src, espn].filter(Boolean);
  return [espn, c && c.src].filter(Boolean);
}
function photo(id, name, size = "md") {
  const ini = esc(String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join(""));
  const srcs = photoSrc(id, name);
  if (!srcs.length) return `<span class="ph ${size}" aria-hidden="true"><span>${ini}</span></span>`;
  const next = srcs[1] ? `if(!this.dataset.f){this.dataset.f=1;this.src='${esc(srcs[1])}'}else this.remove()` : "this.remove()";
  return `<span class="ph ${size}"><img loading="lazy" alt="" src="${esc(srcs[0])}" onerror="${next}"><span>${ini}</span></span>`;
}
const units = u => u == null ? "–" : (u > 0 ? "+" : u < 0 ? "−" : "") + Math.abs(u).toFixed(1) + "u";
const recLine = r => !r || !r.picks ? "" :
  `Model ${r.right}/${r.picks} (${Math.round(r.right / r.picks * 100)}%)` + (r.our_bets ? ` · our picks ${r.our_won}/${r.our_bets} (${Math.round(r.our_won / r.our_bets * 100)}%) <span class="${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)}</span>` : "");
let COUNTRY = {}, RANK = {}, FAV = {};
const METHOD = "EDGE Rating";
// confidence tier from our chance for the favored side: High 70%+, Medium 58-70%, Low under 58%
const tierOf = p => p == null ? null : Math.max(p, 1 - p) >= 0.70 ? "High" : Math.max(p, 1 - p) >= 0.58 ? "Medium" : "Low";
const tierTag = (t, short) => t ? `<span class="tier t-${t.toLowerCase()}" title="${t} confidence: our chance ${t === "High" ? "70%+" : t === "Medium" ? "58-70%" : "under 58%"}. See accuracy by tier on the Record page.">${short ? t.slice(0, t === "Medium" ? 3 : 4) : t + " confidence"}</span>` : "";
// Jono's favorite fighters (docs/favorites.json): a gold star by the name everywhere it links
// current UFC champions (from the official rankings): a gold CHAMP tag by the name everywhere it links
const champTag = s => RANK[s] && RANK[s].rank === 0 ? `<span class="champtag" title="Current UFC ${esc(RANK[s].div)} champion">Champ</span>` : "";
const favStar = s => FAV[s] ? `<span class="fav" title="Jono's favorite${FAV[s].note ? ": " + esc(FAV[s].note) : ""}">★</span>` : "";
// flag (and country name) for a fighter; flags from flag-icons (MIT)
// official UFC rank in the fighter's division: gold "C" for a champion, "#5" for ranked
const rankOf = (s, long) => { const r = RANK[s]; if (!r || r.div == null || (r.rank === 0 && !long)) return "";
  const t = r.rank === 0 ? "Champion" : "#" + r.rank;
  return `<span class="urank${r.rank === 0 ? " champ" : ""}" title="Official UFC ranking: ${esc(t)}, ${esc(r.div)}${r.p4p ? ` · #${r.p4p} pound-for-pound` : ""}">${r.rank === 0 ? (long ? "Champion" : "C") : t}${long ? ` ${esc(r.div)}` : ""}</span>`; };
const SHORT_CTRY = {"Democratic Republic of Congo": "DR Congo", "Democratic Republic of the Congo": "DR Congo", "Bosnia and Herzegovina": "Bosnia", "Bosnia & Herzegovina": "Bosnia", "United Arab Emirates": "UAE", "United Kingdom": "UK", "Trinidad and Tobago": "Trinidad"};
const flagOf = (s, name) => { const c = COUNTRY[s]; return !c ? "" : `<span class="ctry" title="${esc(c[0])}"><img src="flags/${esc(c[1])}.svg" alt="${esc(c[0])} flag" width="18" height="13" loading="lazy">${name ? esc(SHORT_CTRY[c[0]] || c[0]) : ""}</span>`; };
const longest = n => Math.max(...String(n).split(/[\s-]/).map(w => w.length));
const fighterLink = (name, s) => `<a class="fl${longest(name) >= 12 ? " lw xlw" : longest(name) >= 9 ? " lw" : ""}" href="#/fighter/${esc(s || slug(name))}">${esc(name)}${champTag(s || slug(name))}${favStar(s || slug(name))}</a>`;

// ---------------- the current card ----------------
// the tracked line history, starting from the opening line when it differs from our first snapshot
// (the opening line is what the line-movement pass compares against)
function withOpen(hist, f) {
  const h = (hist || []).filter(x => fair(x.a, x.b) != null);
  if (!f || f.open_a == null || f.open_b == null || fair(f.open_a, f.open_b) == null) return h;
  if (!h.length) return h;
  const p0 = fair(f.open_a, f.open_b), p1 = fair(h[0].a, h[0].b);
  if (Math.abs(p0 - p1) < 0.001) return h;
  const t1 = new Date(h[0].t).getTime(), span = new Date(h.at(-1).t).getTime() - t1;
  return [{t: new Date(t1 - Math.max(span * 0.15, 6 * 3600e3)).toISOString(), a: f.open_a, b: f.open_b, open: true}, ...h];
}
function lineChart(hist, f) {
  const pts = withOpen(hist, f).map(h => ({t: new Date(h.t).getTime(), p: fair(h.a, h.b), a: h.a, b: h.b, open: h.open})).filter(x => x.p != null);
  if (pts.length < 2) return "";
  const W = 560, H = 120, P = {l: 8, r: 8, t: 14, b: 18};
  const lo = Math.min(...pts.map(x => x.p), 0.5) - 0.03, hi = Math.max(...pts.map(x => x.p), 0.5) + 0.03;
  const t0 = pts[0].t, t1 = Math.max(pts.at(-1).t, t0 + 1);
  const X = t => P.l + (t - t0) / (t1 - t0) * (W - P.l - P.r), Y = p => P.t + (hi - p) / (hi - lo) * (H - P.t - P.b);
  const d = pts.map((x, i) => (i ? "L" : "M") + X(x.t).toFixed(1) + " " + Y(x.p).toFixed(1)).join("");
  const area = d + ` L${X(pts.at(-1).t).toFixed(1)} ${Y(lo).toFixed(1)} L${X(t0).toFixed(1)} ${Y(lo).toFixed(1)} Z`;
  const first = pts[0], last = pts.at(-1), day = t => new Date(t).toLocaleDateString(undefined, {month: "short", day: "numeric"});
  const tm = t => new Date(t).toLocaleString(undefined, {month: "short", day: "numeric", hour: "numeric"});
  const toward = last.p > first.p ? f.a : last.p < first.p ? f.b : null;
  return `<figure class="lchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(f.a)}'s chance by the line moved from ${pct(first.p)} to ${pct(last.p)}">
      <line x1="${P.l}" x2="${W - P.r}" y1="${Y(0.5)}" y2="${Y(0.5)}" class="mid"/>
      <path d="${area}" class="area"/><path d="${d}" class="ln"/>
      <circle cx="${X(first.t)}" cy="${Y(first.p)}" r="3.5" class="dot"/><circle cx="${X(last.t)}" cy="${Y(last.p)}" r="4.5" class="dot now"/>
      <text x="${P.l}" y="${H - 4}">${first.open ? "Open" : day(first.t) === day(last.t) ? tm(first.t) : day(first.t)}</text><text x="${W - P.r}" y="${H - 4}" text-anchor="end">${!f.state || f.state === "pre" ? "Now" : day(last.t)}</text>
    </svg><figcaption><span>Line for ${esc(f.a.split(" ").at(-1))}: <b>${odds(first.a)}</b> → <b>${odds(last.a)}</b> (${pct(first.p)} → ${pct(last.p)})</span>${
      toward ? `<span class="mv">Moving toward ${esc(toward.split(" ").at(-1))}${f.our_pick ? (toward === f.our_pick ? " · with our pick" : " · against our pick") : ""}</span>` : `<span class="mv">No movement</span>`}</figcaption></figure>`;
}

function spark(hist) {
  const pts = hist.map(h => fair(h.a, h.b)).filter(p => p != null);
  if (pts.length < 2) return "";
  const lo = Math.min(...pts) - 0.02, hi = Math.max(...pts) + 0.02;
  const x = i => 2 + i * 116 / (pts.length - 1), y = p => 26 - (p - lo) / (hi - lo) * 24;
  const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p).toFixed(1)).join("");
  return `<svg viewBox="0 0 120 28" role="img" aria-label="Line moved from ${pct(pts[0])} to ${pct(pts.at(-1))}">
    <line x1="0" x2="120" y1="${y(0.5)}" y2="${y(0.5)}"/><path d="${d}"/></svg>`;
}

function status(f) {
  if (f.state === "in") return `<div class="status"><span class="live">Live</span>${esc(f.status)}</div>`;
  if (f.state === "post" && f.result) {
    const r = f.result;
    const who = r.draw ? "Draw" : r.winner ? `${esc(r.winner)} won` : "Final";
    const mark = f.pick ? `<span class="tick ${r.pick_won ? "won" : "lost"}">${r.pick_won ? "Pick won" : "Pick lost"}</span>` : "";
    return `<div class="status"><span class="final">${who}</span>${esc((r.detail || "").replace(/^Final\s*-?\s*/i, ""))} ${mark}</div>`;
  }
  return "";   // upcoming: the time is in the section header (cardSections)
}
// group the card into Main card / Prelims / Early prelims, in card order, with each section's start and channel
function cardSections(p, fs, render, compact) {
  const segOf = f => (p.schedule || []).find(sg => sg.start === f.start);
  const groups = [];
  for (const [f, i] of fs) { const sg = segOf(f), key = sg ? sg.segment : (groups.at(-1)?.key || f.segment || "");
    if (!groups.length || groups.at(-1).key !== key) groups.push({key, sg, items: []});
    groups.at(-1).items.push([f, i]); }
  const wrap = items => compact ? `<div class="compact">${items.map(render).join("")}</div>` : items.map(render).join("");
  if (groups.length === 1 && !groups[0].key) return wrap(groups[0].items);
  return groups.map(g => { const when = g.sg ? new Date(g.sg.start).toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit"}) : "";
    return `<section class="seg"><div class="seg-h"><h2>${esc(g.key || "More fights")}</h2><span>${[when, g.sg && g.sg.tv && g.sg.tv.length ? esc(g.sg.tv.join(", ")) : "", `${g.items.length} fight${g.items.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</span></div>${wrap(g.items)}</section>`; }).join("");
}

function analystList(e, a, b, winner) {
  const list = e.analysts || [];
  if (!list.length) return "";
  const done = winner === "a" || winner === "b";
  const item = x => {
    const right = done ? (x.side === winner) : null;
    return `<li class="${x.winning ? "winning" : ""}">
      <span class="an">${esc(x.name)}${x.winning ? ` <b class="wtag" title="Winning record: counts in the winning-analyst consensus">W</b>` : ""}</span>
      <span class="ad">${x.conf ? `<i class="conf c-${esc(x.conf.toLowerCase())}">${esc(x.conf)}</i>` : ""}${done ? ` <span class="${right ? "ok" : "no"}">${right ? "✓" : "✗"}</span>` : ""}</span>
      ${x.record ? `<span class="ar">${esc(x.record)}, ${x.units > 0 ? "+" : ""}${(+x.units).toFixed(1)}u</span>` : ""}</li>`;
  };
  const col = (side, name) => `<div><h4>${esc(name)} <span>${list.filter(x => x.side === side).length}</span></h4>
    <ul class="anl">${list.filter(x => x.side === side).map(item).join("") || `<li class="none">No picks</li>`}</ul></div>`;
  return `<details class="analysts"><summary>Analyst picks (${list.length})</summary>
    <div class="ancols">${col("a", a)}${col("b", b)}</div>
    <p class="note">Each analyst's overall record and units on the bouts we track. <b class="wtag">W</b> marks analysts with a winning record. Shown for reference: expert picks are not used in our chances because they haven't improved them in testing.</p></details>`;
}

// grappling flags (site_data.py): slug -> ["Big grappler", "Grappling defense"]
let GRAP = {};
async function loadGrap() { GRAP = (await get("grappling_flags.json", true)) || {}; }
function grapChips(slug) {
  return (GRAP[slug] || []).map(f => `<span class="gflag ${f === "Big grappler" ? "off" : "def"}" title="${f === "Big grappler"
    ? "Takes fights to the mat: 2.5+ takedowns or 1+ submission attempts per 15 minutes" : "Stops 80%+ of takedowns and rarely gets submitted"}">${f === "Big grappler" ? "Grappler" : "Grappling D"}</span>`).join("");
}

// public betting at DraftKings: share of money and share of bets on each side
function splitBar(sp, a, b) {
  if (!sp || sp.handle_a == null || sp.bets_a == null) return "";
  const P = x => Math.round(100 * x), ln = n => esc(String(n).split(" ").at(-1));
  const row = (lab, x, y) => `<div class="sb-r"><span class="sb-l">${lab}</span><span class="sb-n">${P(x)}%</span>
    <span class="sb-t"><i class="a" style="width:${100 * x / (x + y || 1)}%"></i><i class="b" style="width:${100 * y / (x + y || 1)}%"></i></span><span class="sb-n">${P(y)}%</span></div>`;
  const gap = sp.handle_a - sp.bets_a, sharp = Math.abs(gap) >= 0.2 ? (gap > 0 ? a : b) : null;
  return `<div class="sbar2" title="DraftKings public betting splits${sp.at ? ", as of " + esc(sp.at) : ""}">
    <div class="sb-h"><b>Public betting</b><span>DraftKings</span>${sharp ? `<em class="sharp" title="Much more of the money than of the bets is on one side: bigger bettors are on ${esc(sharp)}">Bigger bettors on ${ln(sharp)}</em>` : ""}</div>
    ${row("Money", sp.handle_a, sp.handle_b)}${row("Bets", sp.bets_a, sp.bets_b)}</div>`;
}
function expertBar(e, a, b, winner) {
  if (!e || !(e.picks_a + e.picks_b)) return "";
  const n = e.picks_a + e.picks_b, L = e.analysts || [];
  const wa = L.length ? L.filter(x => x.winning && x.side === "a").length : (e.win_a || 0);
  const wb = L.length ? L.filter(x => x.winning && x.side === "b").length : (e.win_b || 0);
  const W = (x, cls) => x > 0 ? `<i class="${cls}" style="width:${100 * x / n}%"></i>` : "";
  const ln = s => esc(String(s).split(" ").at(-1));
  const lead = e.picks_a === e.picks_b ? "Experts split" : `Experts ${Math.max(e.picks_a, e.picks_b)}-${Math.min(e.picks_a, e.picks_b)} ${e.picks_a > e.picks_b ? ln(a) : ln(b)}`;
  const winNames = L.filter(x => x.winning).map(x => `${esc(x.name)}: ${x.side === "a" ? esc(a) : esc(b)}`).join(", ");
  return `<div class="xbar">
    <div class="xb-l"><b>${lead}</b>${wa + wb ? `<span class="xb-w" title="${winNames}">★ Winning-record analysts: ${wa ? `${wa} on ${ln(a)}` : ""}${wa && wb ? ", " : ""}${wb ? `${wb} on ${ln(b)}` : ""}</span>` : ""}</div>
    <div class="xb-bar" role="img" aria-label="${e.picks_a} of ${n} analysts picked ${esc(a)}, ${e.picks_b} picked ${esc(b)}; winning-record analysts in gold">
      ${W(wa, "wa")}${W(e.picks_a - wa, "a")}${W(e.picks_b - wb, "b")}${W(wb, "wb")}</div>
    <div class="xb-s"><span>${e.picks_a}</span><span class="xb-m">analysts</span><span>${e.picks_b}</span></div>
  </div>`;
}

// line shopping: which sportsbook has the best price on a side ("" with one book)
const bestAt = (f, side) => { const bp = f.book_prices || [], k = side === "a" ? f.best_book_a : f.best_book_b;
  return bp.length > 1 && k ? ` at ${esc(k.split(", ")[0])}` : ""; };
// how it ends: who wins and by what, from the method model (context, not a pick)
function howEnds(f, inPanel) {
  const h = f && f.how; if (!h || !h.a || !h.b) return "";
  const last = n => esc(String(n).split(" ").at(-1)), P = x => Math.round(100 * x);
  const rows = [["KO", "KO/TKO"], ["SUB", "Submission"], ["DEC", "Decision"]];
  let best = null;
  for (const [k] of rows) for (const sd of ["a", "b"]) if (!best || h[sd][k] > best.p) best = {sd, k, p: h[sd][k]};
  const lab = {KO: "KO/TKO", SUB: "submission", DEC: "decision"};
  return `<section class="howend${inPanel ? " in" : ""}">${inPanel ? "<h3>How it ends</h3>" : `<h2>${kick("How it ends", "gold")}How it ends</h2>`}
    <p class="note">Who wins and how, from each fighter's finishing and durability record. Shown for context: we don't make method picks.</p>
    <div class="he-rows">${rows.map(([k, nm]) => { const a = h.a[k], b = h.b[k];
      return `<div class="he-r"><span class="he-l">${nm}</span><span class="he-t"><i class="ha" style="width:${100 * a}%"></i><i class="hb" style="width:${100 * b}%"></i></span><b>${P(a + b)}%</b>
        <span class="he-s"><em class="ha">${last(f.a)} ${P(a)}%</em><em class="hb">${last(f.b)} ${P(b)}%</em></span></div>`; }).join("")}</div>
    <p class="he-best">Most likely: <b>${esc(best.sd === "a" ? f.a : f.b)} by ${lab[best.k]}</b> (${P(best.p)}%)</p></section>`;
}
function marketSummary(F) {
  const f = F.f || {}, last = n => esc(String(n).split(" ").at(-1)), chips = [];
  const chip = (txt, side) => chips.push(`<span class="mk-c${side && F.ours ? (side === F.ours ? " with" : " against") : ""}">${txt}</span>`);
  const pts = withOpen(F.hist || [], f).map(h => fair(h.a, h.b)).filter(p => p != null);
  if (pts.length > 1) { const d = pts.at(-1) - pts[0], side = Math.abs(d) < 0.005 ? null : d > 0 ? F.a : F.b;
    chip(side ? `Line moving toward ${last(side)}` : "Line steady", side); }
  const sp = f.splits;
  if (sp && !f.hidden && sp.handle_a != null) { const gap = sp.handle_a - sp.bets_a;
    if (Math.abs(gap) >= 0.2) { const side = gap > 0 ? F.a : F.b; chip(`Bigger bettors on ${last(side)}`, side); }
    else { const side = sp.handle_a >= 0.5 ? F.a : F.b; chip(`Most money on ${last(side)}`, side); } }
  const e = F.experts;
  if (e && e.picks_a + e.picks_b) { const side = e.picks_a === e.picks_b ? null : e.picks_a > e.picks_b ? F.a : F.b;
    chip(side ? `Experts ${Math.max(e.picks_a, e.picks_b)}-${Math.min(e.picks_a, e.picks_b)} ${last(side)}` : "Experts split", side); }
  return chips.length ? `<div class="mk-sum">${chips.join("")}</div>` : "";
}
function bookPanel(f, pickSide) {
  const bp = (f.book_prices || []).filter(x => x.a != null && x.b != null);
  if (bp.length < 2) return "";
  const ba = Math.max(...bp.map(x => pay(x.a))), bb = Math.max(...bp.map(x => pay(x.b)));
  const last = n => esc(String(n).split(" ").at(-1));
  return `<section class="books"><h3>Line shopping<span>${bp.length} sportsbooks · best price in green</span></h3>
    <div class="tablewrap"><table class="bk-t"><thead><tr><th>Sportsbook</th><th class="n${pickSide === "a" ? " ours" : ""}">${last(f.a)}</th><th class="n${pickSide === "b" ? " ours" : ""}">${last(f.b)}</th></tr></thead><tbody>
    ${bp.map(x => `<tr><td>${esc(x.book)}</td><td class="n${pay(x.a) === ba ? " best" : ""}">${odds(x.a)}</td><td class="n${pay(x.b) === bb ? " best" : ""}">${odds(x.b)}</td></tr>`).join("")}</tbody></table></div>
    ${f.odds_a != null ? `<p class="small">The line we compare against is the average of these, ${odds(f.odds_a)} / ${odds(f.odds_b)}. Getting the best price is extra return the record doesn't count.</p>` : ""}</section>`;
}
function bout(f, i, edge) {
  const pa = f.p_a, line = f.market_p_a, m = f.method || {};
  const tag = (debut, rating, rec) => `<span class="nw">${debut ? "UFC debut" : "EDGE " + rating}</span>` + (rec ? ` · <span class="nw">${esc(rec)}</span>` : "");
  let pickHtml;
  const leanTag = f.expert_lean ? `<span class="lean" title="Close fight by the line, and 65%+ of the analysts agree">Expert lean: ${esc(f.expert_lean)}</span>` : "";
  const bestP = f.our_pick ? (f.our_pick === f.a ? f.best_a : f.best_b) : null, cur = f.our_pick ? (f.our_pick === f.a ? f.odds_a : f.odds_b) : null;
  if (f.locked || f.hidden) pickHtml = lockedPick(f);
  else if (f.our_pick) pickHtml = stageTag(f) + `<span class="pick ours">Our pick${f.our_pick === f.expert_lean && f.our_pick !== f.pick ? " (expert lean)" : ""}: ${esc(f.our_pick)} ${odds(cur)}${f.stake ? ` · ${f.stake}u` : ""}</span>${f.our_pick === f.pick ? `<span class="vtag" title="Also the value pick: our chance beats the line by more than 3 points">Value</span>` : ""}${postedLine(f)}${
    bestP != null && cur != null && (bestP > 0 ? bestP / 100 : 100 / -bestP) > (cur > 0 ? cur / 100 : 100 / -cur) ? `<span class="shop">Best price ${odds(bestP)}${bestAt(f, f.our_pick === f.a ? "a" : "b")}</span>` : ""}${leanTag}`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else if (f.pick) pickHtml = `<span class="pick value">Value pick: ${esc(f.pick)} ${odds(f.pick === f.a ? f.odds_a : f.odds_b)}</span>`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else if (leanTag) pickHtml = leanTag;
  else pickHtml = `<div class="nopick">${line == null ? "No betting line yet." : "No bet: the model and the line are within " + Math.round(edge * 100) + " points."}</div>`;
  if (f.moved_against && !f.our_pick && !f.locked && !f.hidden) pickHtml += `<span class="moved">No pick: the line moved against our side this week, so we passed.</span>`;
  if (f.sample && paywallOn() && (f.our_pick || f.pick)) pickHtml = `<span class="freetag">Free pick</span>` + pickHtml;
  if (f.take) pickHtml += takeHtml(f.take);
  if (f.our_pick && f.why && f.why.length) pickHtml += `<ul class="why">${f.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
  const moved = f.open_a != null && f.odds_a != null && (f.open_a !== f.odds_a)
    ? `Opened ${odds(f.open_a)} / ${odds(f.open_b)}, now ${odds(f.odds_a)} / ${odds(f.odds_b)}`
    : f.odds_a != null ? `Line ${odds(f.odds_a)} / ${odds(f.odds_b)}` : "";
  const nb = (f.book_prices || []).length || f.books || 0;
  const books = nb > 1 ? `${nb} books, best ${odds(f.best_a)}${bestAt(f, "a")} / ${odds(f.best_b)}${bestAt(f, "b")}`
    : nb === 1 && f.book_prices && f.book_prices[0] ? `Line from ${esc(f.book_prices[0].book)}` : f.books ? "1 book" : "";
  const pa100 = Math.round(pa * 100);
  // ring: did our pick (or, without one, the model's pick) win?
  const w = f.state === "post" && f.result ? f.result.winner : null;
  const called = f.our_pick || f.model_pick || f.expert_lean || (pa != null ? (pa > 0.5 ? f.a : f.b) : null);
  const ring = w && called ? (called === w ? " ring-won" : " ring-lost") : "";
  return `<article id="bout-${i}" data-href="${fightLink(i)}" tabindex="0" title="Open the fight analysis" class="bout tap${i === 0 ? " main" : ""}${f.state === "post" ? " done" : ""}${f.state === "in" ? " is-live" : ""}${ring}">
    ${status(f)}
    <div class="corners">
      <div class="a">${photo(f.a_id, f.a, "lg")}<div><div class="name">${fighterLink(f.a, f.a_slug)}</div><div class="meta">${rankOf(f.a_slug)}${flagOf(f.a_slug, true)}${tag(f.debut_a, f.rating_a, f.record_a)}</div>${grapChips(f.a_slug)}</div></div>
      <div class="class">${esc(f.weight_class)}${f.rounds === 5 ? "<br>5 rounds" : ""}${tierTag(f.tier || tierOf(f.p_a))}</div>
      <div class="b"><div><div class="name">${fighterLink(f.b, f.b_slug)}</div><div class="meta">${rankOf(f.b_slug)}${flagOf(f.b_slug, true)}${tag(f.debut_b, f.rating_b, f.record_b)}</div>${grapChips(f.b_slug)}</div>${photo(f.b_id, f.b, "lg")}</div>
    </div>
    ${f.hidden ? `<div class="pct hidp"><span class="pa">${line != null ? pct(line) : "–"}</span><span class="lbl">Betting line</span><span class="pb">${line != null ? (100 - Math.round(100 * line)) + "%" : "–"}</span></div>
    <div class="bar hid" role="img" aria-label="Betting line ${line != null ? pct(line) : "not posted"} for ${esc(f.a)}"><div class="fill" style="width:${(line ?? 0.5) * 100}%"></div></div>
    <div class="legend"><span>${odds(f.odds_a)}</span><span class="lock-l">${lockIcon}EDGE chance: members</span><span>${odds(f.odds_b)}</span></div>`
    : `<div class="pct"><span class="pa">${pa100}%</span><span class="lbl">Model</span><span class="pb">${100 - pa100}%</span></div>
    <div class="bar" role="img" aria-label="Model ${pct(pa)} for ${esc(f.a)}${line != null ? ", line " + pct(line) : ""}">
      <div class="fill" style="width:${pa * 100}%"></div>
      ${line != null ? `<div class="line" style="left:${line * 100}%"></div>` : ""}
    </div>
    <div class="legend"><span>Fair ${odds(f.fair_odds_a)}</span><span class="hide-sm">Line ${line != null ? pct(line) + " / " + (100 - Math.round(100 * line)) + "%" : "not posted"}</span><span>Fair ${odds(f.fair_odds_b)}</span></div>`}
    ${expertBar(f.experts, f.a, f.b, f.state === "post" ? f.winner : null)}
    ${f.hidden ? "" : splitBar(f.splits, f.a, f.b)}
    ${pickHtml}
    <details class="moves-d"><summary><span class="moves">${spark(withOpen(f.line_history, f))}<span>${moved}</span><span>${books}</span></span></summary>${lineChart(f.line_history, f)}</details>
  </article>`;
}

// ---------------- matchup: tale of the tape ----------------
// ---- plans and access (docs/plans.json). The paywall is off until plans.json says "paywall": true;
// add ?preview=free, ?preview=event or ?preview=monthly to any page to see the site as that visitor (?preview=off to stop).
let PLANS = null, TAKES = {};
// Jono's own words on a pick (docs/takes.json: {"<card date>": {"preview": "...", "fights": {"<fighter>": "..."}}})
function attachTakes(p) {
  const t = p && TAKES[p.date]; if (!t) return p;
  const fx = t.fights || {};
  return {...p, take_preview: t.preview || "", fights: p.fights.map(f => {
    const txt = f.our_pick ? fx[f.our_pick] || fx[f.a] || fx[f.b] : !f.hidden && !f.locked ? fx[f.a] || fx[f.b] : null;
    return txt ? {...f, take: txt} : f; })};
}
const takeHtml = (txt, cls) => txt ? `<blockquote class="take${cls ? " " + cls : ""}"><b>Jono's take</b>${esc(txt)}</blockquote>` : "";
function previewPlan() {
  const q = new URLSearchParams((location.hash.split("?")[1]) || "");
  try { if (q.has("preview")) { const v = q.get("preview"); v === "off" ? sessionStorage.removeItem("oePreview") : sessionStorage.setItem("oePreview", v); }
    return sessionStorage.getItem("oePreview"); } catch (e) { return q.get("preview"); }
}
function myPlan() {   // the visitor's plan; until real sign-in exists, everyone is "free" when the paywall is on
  const pv = previewPlan(); if (pv && pv !== "off") return pv;
  try { const a = JSON.parse(localStorage.getItem("oeAccess") || "null"); if (a && (!a.expires || a.expires > Date.now())) return a.plan; } catch (e) {}
  return "free";
}
const paywallOn = () => !!(PLANS && PLANS.paywall) || !!(previewPlan() && previewPlan() !== "off");
// picks on the upcoming card: monthly sees all, an event pass sees its card, free sees the sample (the main event)
function canSeePicks(cardDate) {
  if (!paywallOn()) return true;
  const pl = myPlan();
  if (pl === "monthly") return true;
  if (pl === "event") { if (previewPlan() === "event") return true;
    try { const a = JSON.parse(localStorage.getItem("oeAccess") || "{}"); return (a.events || []).includes(cardDate); } catch (e) { return false; } }
  return false;
}
// what a visitor without access receives: the card with picks removed, except the free sample
function gatePredictions(p) {
  if (!p || canSeePicks(p.date)) return p;
  const q = {...p, gated: true};
  const open = f => f.our_pick && f.state !== "post", po = f => f.our_pick === f.a ? f.odds_a : f.odds_b;
  let sampleAt = PLANS && PLANS.free_sample ? p.fights.findIndex(f => open(f) && po(f) != null && po(f) >= -250) : -1;   // a pick at a normal price shows the value
  if (sampleAt < 0 && PLANS && PLANS.free_sample) sampleAt = p.fights.findIndex(open);
  q.fights = p.fights.map((f, i) => {
    if (i === sampleAt) return {...f, sample: true};
    if (f.state === "post") return f;   // finished fights show their picks: that's the public record
    const had = !!(f.our_pick || f.pick || f.expert_lean);
    return {...f, our_pick: null, pick: null, stake: null, why: null, expert_lean: null, check_news: null, posted: null, locked: had, hidden: true,
      p_a: null, p_model_a: null, model_pick: null, tier: null, fair_odds_a: null, fair_odds_b: null, method: null, edge_a: null,
      experts: f.experts ? {...f.experts, win_a: 0, win_b: 0, analysts: (f.experts.analysts || []).map(x => ({...x, winning: false}))} : f.experts};
  });
  q.locked_count = q.fights.filter(f => f.locked).length;
  return q;
}
// members get the full card; once the paywall is on, everyone else loads the public file (no picks in it)
async function getPred() {
  let p = null;
  if (paywallOn() && !canSeePicks(null) && myPlan() === "free" && PLANS && PLANS.paywall && !previewPlan()) {
    const pub = await get("predictions_public.json", true); if (pub) p = attachTakes(pub);
  }
  if (!p) p = attachTakes(gatePredictions(await get("predictions.json", true)));
  if (p) { CARD_FINAL = !!p.final; CARD_FINAL_AT = p.final_at || null; }
  return p;
}
// when an our pick first went up and at what price, and whether the line has since moved our way
function postedInfo(f) {
  const P = f && f.posted;
  if (!P || !P.at || P.odds == null || !f.our_pick) return null;
  const now = f.our_pick === f.a ? f.odds_a : f.odds_b;
  const imp = o => o == null ? null : o < 0 ? -o / (-o + 100) : 100 / (o + 100);
  const d = now == null ? 0 : imp(now) - imp(P.odds);
  const dir = Math.abs(d) < 0.005 ? "same" : d > 0 ? "ours" : "against";
  const t = new Date(P.at.replace("Z", ":00Z"));
  const when = isNaN(t) ? "" : t.toLocaleString([], {weekday: "short", hour: "numeric", minute: "2-digit"});
  return {when, odds: P.odds, now, dir};
}
function postedLine(f, cls = "posted") {
  const x = postedInfo(f);
  if (!x || f.state !== "pre") return "";
  const tail = x.dir === "same" ? "" : x.dir === "ours"
    ? ` · now ${odds(x.now)}, <em class="pmv">line moved our way</em>`
    : ` · now ${odds(x.now)}, line moved against`;
  return `<span class="${cls}" title="When this pick first went up, and the price then. Lines that move toward our picks after we post them are the best sign the edge is real.">Posted ${esc(x.when)} at ${odds(x.odds)}${tail}</span>`;
}

// early vs. final picks: picks can still change (the line-movement pass) until the last update before the first fight
let CARD_FINAL = false, CARD_FINAL_AT = null;
const stageTag = f => f.state && f.state !== "pre" ? "" : CARD_FINAL
  ? `<span class="stage final" title="Set before the first fight. It won't change.">Final pick</span>`
  : `<span class="stage early" title="If the line moves more than 1 point against it before fight day, we pass. Final picks are set on fight day.">Early pick</span>`;
function finalTime() {   // the last scheduled update, rounded up to the half hour (scheduled runs can start a little late)
  if (!CARD_FINAL_AT) return "";
  const t = new Date(CARD_FINAL_AT); if (isNaN(t)) return "";
  t.setMinutes(t.getMinutes() < 30 ? 30 : 60, 0, 0);
  return t.toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short"});
}
function stageNote(p) {
  if (!p || !(p.fights || []).some(f => (f.our_pick || f.locked) && (!f.state || f.state === "pre"))) return "";
  return CARD_FINAL
    ? `<p class="stage-note final"><span class="stage final">Final picks</span>Set before the first fight. These won't change.</p>`
    : `<p class="stage-note"><span class="stage early">Early picks</span>Posted as the lines open. If a line moves more than 1 point against one of them before fight day, we pass on it. Final picks are set on fight day${finalTime() ? `, by about ${esc(finalTime())}` : ""}.</p>`;
}
const planBtns = (small) => PLANS ? `<div class="lock-btns${small ? " sm" : ""}">${PLANS.plans.map(pl => `<a class="${pl.best ? "btn" : "pill"}" href="#/pricing">${esc(pl.name)} · $${pl.price}</a>`).join("")}</div>` : "";
const lockIcon = `<svg class="lk" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const lockedPick = f => f.locked ? `<a class="lock-slim" href="#/pricing">${lockIcon}<b>We have a pick on this fight</b><span>Members see it</span></a>` : "";
const lockBanner = p => !p || !p.gated ? "" : `<section class="lock-top">${lockIcon}<div><b>Free preview: betting lines on every fight${p.fights.some(f => f.sample) ? " and one free pick" : ""}</b>
    <span>Members see our chance on every fight${p.locked_count ? ` and all ${p.locked_count + (p.fights.some(f => f.sample) ? 1 : 0)} picks with stakes and reasons` : ""}.</span></div>${planBtns(true)}</section>`;;

// ---- pricing and account (structure for a paid site; checkout links go in docs/plans.json) ----
// is a plan worth it at your unit size? From the record: picks and units per month and per card
function worthIt(mr) {
  // this year so far, at the suggested stakes (falls back to since 2020 if the year has no picks yet)
  const yr = mr.years && mr.years[0], useYr = yr && yr.our_bets, s = useYr ? yr : mr.since;
  const c = useYr ? mr.curve.filter(x => x[0].startsWith(yr.year)) : mr.curve;
  const d0 = useYr ? new Date(yr.year + "-01-01T00:00:00") : new Date(c[0][0]), d1 = useYr ? new Date(Math.min(Date.now(), new Date(yr.year + "-12-31T23:59:59"))) : new Date(c.at(-1)[0]);
  const months = Math.max(1, (d1 - d0) / (864e5 * 30.44)), cards = Math.max(1, c.length);
  const upm = s.our_staked_units / months, ppm = s.our_bets / months, upc = s.our_staked_units / cards;
  const mo = PLANS.plans.find(x => x.id === "monthly"), ev = PLANS.plans.find(x => x.id === "event");
  window.calcWorth = () => { const u = Math.max(0, +document.getElementById("wi-u").value || 0), out = document.getElementById("wi-out"); if (!out) return;
    const m = upm * u - (mo ? mo.price : 0), e = upc * u - (ev ? ev.price : 0), f = x => (x >= 0 ? "+$" : "−$") + Math.abs(x).toFixed(0);
    out.innerHTML = `<div><small>Monthly, per month</small><b class="${m >= 0 ? "won" : "lost"}">${f(m)}</b><span>${f(upm * u)} expected from picks, minus $${mo ? mo.price : 0}</span></div>
      <div><small>Event Pass, per card</small><b class="${e >= 0 ? "won" : "lost"}">${f(e)}</b><span>${f(upc * u)} expected from picks, minus $${ev ? ev.price : 0}</span></div>
      <p class="note">Break-even unit: about <b>$${Math.ceil((mo ? mo.price : 0) / upm)}</b> on Monthly, <b>$${Math.ceil((ev ? ev.price : 0) / upc)}</b> on an Event Pass.</p>`; };
  setTimeout(() => { const i = document.getElementById("wi-u"); if (i) { i.addEventListener("input", window.calcWorth); window.calcWorth(); } }, 0);
  return `<section class="worth"><div class="wi-h"><h2>Is it worth it for you?</h2>
    <p>${useYr ? `In ${esc(yr.year)} so far` : `Since ${mr.from || 2020}`} we've averaged about ${ppm.toFixed(0)} picks and <b>${upm >= 0 ? "+" : ""}${upm.toFixed(2)} units a month</b> at the suggested stakes (${upc >= 0 ? "+" : ""}${upc.toFixed(2)} a card; ${s.our_won}-${s.our_bets - s.our_won}, ${units(s.our_staked_units)} on ${s.our_risked}u risked). What that's worth depends on how much you bet per unit. Past results, not a promise.</p></div>
    <label class="wi-in"><span>Your unit</span><b>$</b><input id="wi-u" type="number" min="0" step="5" value="50" inputmode="decimal"></label>
    <div id="wi-out" class="wi-out"></div></section>`;
}
// return per bet next to the usual benchmarks for professional bettors
function roiBench(s, v, from) {
  const ours = s.our_roi_pct, fav = v && v.fights ? Math.round(1000 * v.line_units / v.fights) / 10 : null;
  const sg = x => (x > 0 ? "+" : "") + x + "%";
  const max = 12, X = x => Math.max(0, Math.min(100, (x + 3) / (max + 3) * 100));
  return `<section class="roi">
    <div class="roi-h"><b>Return per bet: <span class="won">${sg(ours)}</span>, flat 1 unit</b>
      <p>Experienced bettors typically aim for 3-7% per bet over the long run, and anything above 10% is rare and hard to keep up. Winning 55% of bets at standard -110 odds, a mark of a sharp bettor, works out to about +5%. Our picks since ${from}, flat 1 unit at the average sportsbook's closing price:</p></div>
    <div class="roi-rows">
      ${[["Our picks, flat 1u", ours, null, "us"],
        ["Experienced bettors' target", 3, 7, "band"], ["Sharp bettor (55% at -110)", 5, null, "band1"]].filter(r => r && r[1] != null).map(([lab, lo, hi, k]) => {
        const left = hi != null ? X(lo) : Math.min(X(0), X(lo)), w = hi != null ? X(hi) - X(lo) : Math.abs(X(lo) - X(0));
        return `<div class="rr ${k}"><span class="rr-l">${lab}</span><span class="rr-t"><i class="z" style="left:${X(0)}%"></i><i class="b" style="left:${left}%;width:${Math.max(w, 1)}%"></i></span>
          <b class="rr-v">${hi != null ? `${lo}-${hi}%` : sg(lo)}</b></div>`; }).join("")}
    </div></section>`;
}
// the headline comparison: our picks vs. betting every favorite, flat 1 unit at the same closing prices
function favCompare(s, v, from) {
  if (!s || !v || v.line_units == null) return "";
  const a = s.our_units, b = v.line_units, m = Math.max(Math.abs(a), Math.abs(b)) || 1, w = x => Math.max(2, Math.round(100 * Math.abs(x) / m));
  return `<section class="favcmp"><h2>${kick("Since " + from, "gold")}Our picks vs. betting every favorite</h2>
    <p>Flat 1 unit a bet at the average sportsbook's closing price, on every UFC card since ${from}.</p>
    <div class="fc-rows">
      <div class="fc-r fc-us"><span class="fc-l">Our picks<small>${s.our_won}-${s.our_bets - s.our_won}, ${s.our_bets.toLocaleString()} picks</small></span><span class="fc-t"><i style="width:${w(a)}%"></i></span><b class="${a >= 0 ? "won" : "lost"}">${units(a)}</b></div>
      <div class="fc-r fc-fav"><span class="fc-l">Every favorite<small>${v.fights.toLocaleString()} fights</small></span><span class="fc-t"><i style="width:${w(b)}%"></i></span><b class="${b >= 0 ? "won" : "lost"}">${units(b)}</b></div>
    </div>
    <p class="note">The favorite wins most fights, but the price eats the profit. We only bet when the line is off.</p></section>`;
}
async function viewPricing() {
  const [mr] = await Promise.all([get("model_record.json")]);
  if (!PLANS) return `<h1>Pricing</h1><div class="empty">Plans aren't set up yet.</div>`;
  const s = mr && mr.since, v = s && s.vs_line, yr = mr && mr.years && mr.years[0];
  const cards = [{id: "free", name: "Free", price: 0, period: "", tagline: "See how every fight rates.", features: PLANS.free}, ...PLANS.plans];
  const mine = myPlan();
  const card = pl => `<div class="plan${pl.best ? " best" : ""}${pl.id === "free" ? " free" : ""}">${pl.best ? `<span class="plan-flag">Best value</span>` : ""}
      <h3>${esc(pl.name)}</h3><div class="plan-price">${pl.price ? `<b>$${pl.price}</b><span>/ ${esc(pl.period)}</span>` : `<b>$0</b>`}</div>
      <p class="plan-tag">${esc(pl.tagline)}</p>
      <ul>${pl.features.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      ${pl.id === "free" ? `<a class="pill plan-cta" href="#/card">See this week's card</a>`
        : pl.checkout_url ? `<a class="btn plan-cta" href="${esc(pl.checkout_url)}" rel="noopener">Get ${esc(pl.name)}</a>`
        : `<span class="btn plan-cta soon" aria-disabled="true">Coming soon</span>`}
      ${mine === pl.id && paywallOn() ? `<span class="plan-mine">Your plan</span>` : ""}</div>`;
  const rows = [["Betting lines and every fighter's EDGE Rating", 1, 1, 1], ["EDGE chance and confidence on every fight", "Free pick only", 1, 1], ["Rankings, fighter pages, Who wins?, Movers", 1, 1, 1], ["The full public record", 1, 1, 1],
    ["One free pick per card", 1, 1, 1], ["Every pick with stake and reasons", 0, "One card", 1], ["Value picks", 0, "One card", 1],
    ["Fight analysis: our call on every bout", 0, "One card", 1], ["Live fight-night bet slip", 0, "One card", 1],
    ["Picks for every card, all month", 0, 0, 1]];
  const ck = x => x === 1 ? `<span class="ck">✓</span>` : x ? `<span class="ck part">${esc(x)}</span>` : `<span class="ck no">–</span>`;
  return `<section class="pr-hero"><h1>Get every pick.</h1>
      <p>Every pick for one card, or every card all month. Same picks you can check on the Record page.</p></section>
    ${s ? `<div class="pr-proof"><div><b>${yr ? yr.pct : s.pct}%</b><span>winners picked${yr ? " in " + esc(yr.year) : ""}</span></div>
      <div><b>${s.tiers && s.tiers.High ? s.tiers.High.pct : "–"}%</b><span>high-confidence picks won</span></div>
      ${v && v.disagree ? `<div><b>${v.disagree_model_right}-${v.disagree - v.disagree_model_right}</b><span>when we disagree with the line (${(100 * v.disagree_model_right / v.disagree).toFixed(1)}% vs ${v.disagree_line_expected}% expected)</span></div>` : ""}</div>` : ""}
    ${favCompare(s, v, mr.from || 2020)}
    ${s && s.our_roi_pct != null ? roiBench(s, v, mr.from || 2020) : ""}
    <div class="plans">${cards.map(card).join("")}</div>
    <h2>${kick("Compare", "gold")}What's included</h2>
    <div class="tablewrap"><table class="cmpplans"><thead><tr><th></th><th>Free</th>${PLANS.plans.map(pl => `<th>${esc(pl.name)}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r[0])}</td>${r.slice(1).map(x => `<td>${ck(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <h2>${kick("Questions", "gold")}FAQ</h2>
    <div class="faq">
      <details><summary>What does an Event Pass cover?</summary><p>Every pick, stake, value pick and fight analysis for one UFC card, from the moment you buy it until the card ends, including the live bet slip on fight night.</p></details>
      <details><summary>When do picks post?</summary><p>As soon as sportsbooks post lines for a card, usually Sunday or Monday. They update through the week as lines move and expert picks come in, and lock when each fight starts.</p></details>
      <details><summary>How do I know the record is real?</summary><p>Every pick since Oct 31, 2026 was locked before the fight and is graded at the price we posted; earlier cards are graded at the average sportsbook's closing price. The full record, wins and losses, is free to view on the Record page, along with how we compare with simply betting favorites.</p></details>
      <details><summary>Can I cancel Monthly?</summary><p>Yes, anytime. You keep access until the end of the month you paid for.</p></details>
      <details><summary>Is this betting advice?</summary><p>No. It's research for entertainment. Bet only what you can afford to lose, only where it's legal, and if gambling stops being fun, call 1-800-GAMBLER.</p></details>
    </div>`;
}
async function viewAccount() {
  const pv = previewPlan(), mine = myPlan();
  const b = (k, t) => `<a class="${(pv || "off") === k ? "btn" : "pill"}" href="#/account?preview=${k}">${t}</a>`;
  return `<h1>Account</h1>
    <div class="acct"><div><span class="vl-k">Your plan</span><b>${paywallOn() ? esc(({free: "Free", event: "Event Pass", monthly: "Monthly"})[mine] || mine) : "Everything (paywall off)"}</b>
      <p class="note">Sign-in and payments aren't connected yet. When they are, you'll sign in here with a one-time email link and see your plan, renewal date and receipts, and manage or cancel your subscription.</p></div></div>
    <h2>${kick("Owner tools", "gold")}Preview the site as</h2>
    <p class="note">See exactly what each visitor sees. This only changes your own browser tab.</p>
    <div class="acct-prev">${b("free", "Free visitor")}${b("event", "Event Pass")}${b("monthly", "Monthly")}${b("off", "Turn preview off")}</div>
    <p class="note">The paywall itself is ${PLANS && PLANS.paywall ? "<b>on</b>" : "<b>off</b>"} (set in docs/plans.json).</p>`;
}

// ---- one fight, analysed: #/fight/<card index> or #/fight/<event slug>/<index> ----
function radarDual(Ra, Rb, A, B) {
  const keys = Object.keys(Ra || Rb), n = keys.length, cx = 160, cy = 160, rad = 118;
  const pt = (i, r) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]; };
  const ring = r => keys.map((_, i) => pt(i, r).join(",")).join(" ");
  const poly = R => keys.map((k, i) => pt(i, rad * Math.max(6, (R && R[k]) ?? 0) / 100).join(",")).join(" ");
  const lab = keys.map((k, i) => { const [x, y] = pt(i, rad + 24), an = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x}" y="${y + 4}" text-anchor="${an}" class="rl">${esc(k)}</text><text x="${x}" y="${y + 18}" text-anchor="${an}" class="rv"><tspan class="va">${Ra && Ra[k] != null ? Ra[k] : "–"}</tspan> · <tspan class="vb">${Rb && Rb[k] != null ? Rb[k] : "–"}</tspan></text>`; }).join("");
  return `<div class="radar dual"><svg viewBox="-75 -10 470 350" role="img" aria-label="Style profiles: ${esc(A.name)} in red, ${esc(B.name)} in blue">
    ${[25, 50, 75, 100].map(p => `<polygon points="${ring(rad * p / 100)}" class="rg${p === 100 ? " outer" : ""}"/>`).join("")}
    ${keys.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, rad)[0]}" y2="${pt(i, rad)[1]}" class="ax"/>`).join("")}
    ${Rb ? `<polygon points="${poly(Rb)}" class="shape b"/>` : ""}${Ra ? `<polygon points="${poly(Ra)}" class="shape a"/>` : ""}
    ${lab}</svg>
    <div class="rd-legend"><span class="a">${esc(A.name)}</span><span class="b">${esc(B.name)}</span></div></div>`;
}
function fightLink(i, ev) { return ev ? `#/fight/${esc(ev)}/${i}` : `#/fight/${i}`; }
// a fighter's last 5 UFC fights: result, how, the odds and whether they were favored
function last5(P, name, side) {
  const L = P && P.fights ? P.fights.filter(z => ["W", "L", "D", "NC"].includes(z.result)).slice(0, 5) : [];
  if (!L.length) return `<section class="l5 ${side}"><h3>${esc(name)}</h3><p class="note">UFC debut: no UFC fights yet.</p></section>`;
  const fav = L.filter(z => z.odds != null && z.odds < 0), dog = L.filter(z => z.odds != null && z.odds > 0);
  const wl = Z => `${Z.filter(z => z.result === "W").length}-${Z.filter(z => z.result === "L").length}`;
  const how = z => [z.finish, z.round && z.finish && !/DEC/i.test(z.finish) ? "R" + z.round : ""].filter(Boolean).join(" ");
  return `<section class="l5 ${side}"><h3>${esc(name)}</h3>
    <div class="l5-sum"><span><b>${wl(L)}</b> last ${L.length}</span>${fav.length ? `<span><b>${wl(fav)}</b> as favorite</span>` : ""}${dog.length ? `<span><b>${wl(dog)}</b> as underdog</span>` : ""}</div>
    <table class="l5-t"><thead><tr><th></th><th>Opponent</th><th style="text-align:right">Their record</th><th class="l5-h">Result</th><th style="text-align:right">Odds</th><th></th></tr></thead><tbody>${L.map(z => `<tr>
      <td><span class="fm ${z.result === "NC" ? "D" : z.result}">${z.result === "NC" ? "NC" : z.result}</span></td>
      <td class="l5-o">${fighterLink(z.opp, z.opp_slug)}<small>${esc(z.date)}${z.title ? " · title fight" : ""}</small></td>
      <td class="l5-r">${z.opp_record != null ? `<b>${esc(z.opp_record)}</b>` : ""}${z.opp_rating != null ? `<small>EDGE ${z.opp_rating}</small>` : ""}</td>
      <td class="l5-h">${esc(how(z))}</td>
      <td class="n">${z.odds != null ? odds(z.odds) : "–"}</td>
      <td>${z.odds == null ? "" : z.odds < 0 ? `<span class="fd fav"><span class="lg">Favorite</span><span class="sh">Fav</span></span>` : `<span class="fd dog"><span class="lg">Underdog</span><span class="sh">Dog</span></span>`}</td></tr>`).join("")}</tbody></table></section>`;
}

async function viewFight(x, y) {
  let F, back, title, when;
  if (y != null) {   // a past card
    const e = await get(`events/${x}.json`); const b = e && e.bouts[+y];
    if (!b) return `<h1>Fight not found</h1><div class="empty"><a class="pill" href="#/events">All events</a></div>`;
    const side = s => s === "a" ? b.a : s === "b" ? b.b : null;
    F = {a: b.a, b: b.b, a_slug: b.a_slug, b_slug: b.b_slug, a_id: b.a_id, b_id: b.b_id, p: b.final_p_a ?? b.model_p_a, line: b.line_p_a,
      odds_a: b.odds_a, odds_b: b.odds_b, wc: b.weight_class, rounds: b.rounds, tier: (b.model_pick && b.model_pick.tier) || tierOf(b.final_p_a),
      ours: b.our_pick ? side(b.our_pick.side) : null, ours_odds: b.our_pick && b.our_pick.odds, stake: b.our_pick && b.our_pick.stake,
      value: b.value_pick ? side(b.value_pick.side) : null, experts: b.experts, winner: side(b.winner), how: b.finish ? `${b.finish}${b.round ? ", round " + b.round : ""}` : "",
      model: b.model_pick ? side(b.model_pick.side) : null, lean: b.expert_lean ? side(b.expert_lean) : null, passed: b.passed ? side(b.passed) : null};
    back = `<a class="pill" href="#/event/${esc(x)}">← ${esc(e.name)}</a>`; title = e.name; when = dateLong(e.date);
  } else {
    const p = await getPred(); const f = p && p.fights[+x];
    if (!f) return `<h1>Fight not found</h1><div class="empty"><a class="pill" href="#/card">This card</a></div>`;
    const w = f.state === "post" && f.result ? f.result.winner : null;
    F = {a: f.a, b: f.b, a_slug: f.a_slug, b_slug: f.b_slug, a_id: f.a_id, b_id: f.b_id, p: f.p_a, line: f.market_p_a, odds_a: f.odds_a, odds_b: f.odds_b,
      wc: f.weight_class, rounds: f.rounds, tier: f.tier || tierOf(f.p_a), ours: f.our_pick, ours_odds: f.our_pick ? (f.our_pick === f.a ? f.odds_a : f.odds_b) : null,
      stake: f.stake, value: f.pick, why: f.why, experts: f.experts, hist: f.line_history, f, winner: w, how: w ? (f.result.detail || "") : "",
      model: f.model_pick, lean: f.expert_lean, start: f.start, state: f.state, status: f.status, passed: f.moved_against && !f.our_pick ? true : null};
    back = `<a class="pill" href="#/card">← ${esc(p.event)}</a>`; title = p.event; when = f.start ? new Date(f.start).toLocaleString(undefined, {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : dateLong(p.date);
  }
  const [A, B] = await Promise.all([F.a_slug ? get(`fighters/${F.a_slug}.json`, true) : null, F.b_slug ? get(`fighters/${F.b_slug}.json`, true) : null]);
  const corner = (k) => { const nm = F[k], sl = F[k + "_slug"], P = k === "a" ? A : B, ch = F.p == null ? null : k === "a" ? Math.round(100 * F.p) / 100 : 1 - Math.round(100 * F.p) / 100, o = F["odds_" + k];
    return `<a class="lc-corner ${k}${F.ours === nm ? " ours" : ""}${F.winner && F.winner !== nm ? " lostc" : ""}" href="#/fighter/${esc(sl)}">${photo(F[k + "_id"], nm, "xl")}
      <span class="lc-name">${esc(nm)}${champTag(sl)}${favStar(sl)}</span><span class="lc-meta">${rankOf(sl)}${flagOf(sl, true)}</span>
      <span class="fx-rec">${P ? `${esc(P.ufc_record)} UFC · EDGE ${P.rating}` : "UFC debut"}</span>
      ${F.f && F.f.hidden ? `<span class="lc-pct ln">${F.line == null ? "–" : k === "a" ? pct(F.line) : (100 - Math.round(100 * F.line)) + "%"}</span><span class="lc-odds">line · ${o != null ? odds(o) : "not posted"}</span>`
        : `<span class="lc-pct">${pct(ch)}</span><span class="lc-odds">${o != null ? odds(o) : "no line"}</span>`}
      ${F.winner === nm ? `<span class="lc-tag won">Winner</span>` : F.ours === nm ? `<span class="lc-tag ours">Our pick${F.stake ? " · " + F.stake + "u" : ""}</span>` : F.value === nm ? `<span class="lc-tag value">Value pick</span>` : ""}</a>`; };
  const form = P => P && P.fights ? P.fights.filter(z => ["W", "L", "D"].includes(z.result)).slice(0, 5).reverse().map(z => `<span class="fm ${z.result}" title="${esc(z.result)} vs ${esc(z.opp)}, ${esc(z.date)}">${z.result}</span>`).join("") : "";
  const call = F.f && (F.f.locked || F.f.hidden) ? (lockedPick(F.f) || `<div class="fx-call none"><span class="fx-k">Members</span><b>Our chance on this fight</b><span>and whether the line is off. <a href="#/pricing">See plans</a></span></div>`) : F.ours ? `<div class="fx-call ours"><span class="fx-k">${F.f && F.state === "pre" ? (CARD_FINAL ? "Final pick" : "Early pick") : "Our pick"}</span><b>${esc(F.ours)} ${odds(F.ours_odds)}</b><span>${F.stake ? F.stake + "u stake · " : ""}${F.ours === F.value ? "beats the line" : F.ours === F.lean ? "expert lean" : ""}</span>${F.f ? postedLine(F.f, "fx-posted") : ""}</div>`
    : F.passed ? `<div class="fx-call none"><span class="fx-k">Passed</span><b>The line moved against ${F.passed === true ? "our side" : esc(F.passed)}</b><span>We had a pick here, but the line moved more than 1 point the other way between open and close, so we passed.</span></div>`
    : F.value ? `<div class="fx-call value"><span class="fx-k">Value pick</span><b>${esc(F.value)} ${odds(F.value === F.a ? F.odds_a : F.odds_b)}</b><span>beats the line, but not a confident enough pick to bet</span></div>`
    : `<div class="fx-call none"><span class="fx-k">No bet</span><b>${F.line == null ? "No line yet" : "Fairly priced"}</b><span>${F.line == null ? "We'll rate it once odds post." : "Our chance and the line are within 3 points."}</span></div>`;
  const mark = nm => F.winner && nm ? (F.winner === nm ? ` <em class="won">✓ won</em>` : ` <em class="lost">✗ lost</em>`) : "";

  const status = F.winner ? `<span class="fx-res">${esc(F.winner)} won${F.how ? " · " + esc(F.how.replace(/^Final\s*-?\s*/i, "")) : ""}</span>` : F.state === "in" ? `<span class="live">Live</span>` : `<span class="fx-when">${esc(when)}</span>`;
  return `<div class="fx-top">${back}</div>
    <h1 class="fx-h1">${esc(F.a)} <span>vs</span> ${esc(F.b)}</h1>
    <p class="fx-sub">${esc(F.wc || "")}${F.rounds === 5 ? " · 5 rounds" : ""} · ${status} ${tierTag(F.tier)}</p>
    <section class="fx-face"><div class="lc-face">${corner("a")}<span class="lc-vs">VS</span>${corner("b")}</div>
      ${F.p != null ? `<div class="lc-bar"><i class="a" style="width:${Math.round(100 * F.p)}%"></i><i class="b"></i>${F.line != null ? `<em style="left:${Math.round(100 * F.line)}%" title="Betting line"></em>` : ""}</div>
      <p class="fx-legend">Big numbers: our chance. White tick: the betting line${F.line != null ? ` (${pct(F.line)} / ${(100 - Math.round(100 * F.line)) + "%"})` : ""}.</p>` : F.f && F.f.hidden ? `<p class="fx-legend">Big numbers: the betting line's chance. <a href="#/pricing">Members</a> see ours.</p>` : ""}</section>
    <section class="fx-callbar">
      <div class="fx-cb-l"><h2>Our call</h2>${F.winner && (F.ours || (F.value && !F.passed)) ? call.replace("</b>", mark(F.ours || F.value) + "</b>") : call}</div>
      <div class="fx-cb-r">${F.model ? `<div class="fx-model"><span>Model's winner</span><b>${esc(F.model)}${mark(F.model)}</b></div>` : ""}
        ${F.f && F.f.take ? takeHtml(F.f.take) : ""}
        ${F.why && F.why.length ? `<ul class="why">${F.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}</div>
    </section>
    <div class="fx-grid">
      <section class="fx-panel"><h2>${kick("Styles", "gold")}Head to head</h2>
        ${A && A.radar || B && B.radar ? radarDual(A && A.radar, B && B.radar, {name: F.a}, {name: F.b}) + "" : `<p class="note">Style profiles appear once both fighters have three UFC fights with stats.</p>`}
        ${F.f && !F.f.hidden ? howEnds(F.f, true) : ""}</section>
      ${(() => { const body = `${expertBar(F.experts, F.a, F.b, null)}
        ${F.f && !F.f.hidden ? splitBar(F.f.splits, F.a, F.b) : ""}
        ${F.hist ? lineChart(F.hist, F.f) : ""}
        ${F.f && !F.f.hidden ? bookPanel(F.f, F.ours === F.a ? "a" : F.ours === F.b ? "b" : null) : ""}`;
        return body.trim() ? `<section class="fx-panel fx-market"><h2>The market</h2>${marketSummary(F)}${body}</section>` : ""; })()}
    </div>
    <section class="fx-panel fx-sec"><h2>${kick("Recent form", "gold")}Last 5 fights</h2>
      <div class="l5grid">${last5(A, F.a, "a")}${last5(B, F.b, "b")}</div></section>
    <section class="fx-panel fx-sec"><h2>${kick("Tale of the tape", "gold")}Side by side</h2>
      <div class="fx-tape">${tape(A, B, F.rounds)}</div></section>
    <p class="fx-links"><a class="pill" href="#/compare?a=${esc(F.a_slug)}&b=${esc(F.b_slug)}&booked=1">Open in Who wins?</a><a class="pill" href="#/fighter/${esc(F.a_slug)}">${esc(F.a)}</a><a class="pill" href="#/fighter/${esc(F.b_slug)}">${esc(F.b)}</a></p>`;
}

function tapeToggle(a, b, rounds) {
  return `<details class="tape" data-a="${esc(a)}" data-b="${esc(b)}" data-rounds="${rounds || 3}" ontoggle="if(this.open)loadTape(this)">
    <summary>Matchup: tale of the tape and how each does against the other's style</summary><div class="tapebody">Loading…</div></details>`;
}

async function loadTape(el) {
  if (el.dataset.done) return;
  el.dataset.done = 1;
  const [a, b] = await Promise.all([get(`fighters/${el.dataset.a}.json`), get(`fighters/${el.dataset.b}.json`)]);
  el.querySelector(".tapebody").innerHTML = tape(a, b, +el.dataset.rounds);
}

function tape(a, b, rounds) {
  if (!a && !b) return `<p class="note">Both fighters are making their UFC debut: no UFC history to compare yet.</p>`;
  const A = a || {}, B = b || {}, sa = A.style || {}, sb = B.style || {}, ga = A.grappling || {}, gb = B.grappling || {};
  const cv = (x, y) => x ?? y ?? null;   // UFC.com career number first, our fight stats second
  const mix = (G, ks) => ks.every(k => G[k] != null) ? ks.map(k => Math.round(G[k] * 100) + "%").join(" / ") : null;
  const mmss = m => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;
  const flagText = F => F.grappling && F.grappling.flags.length ? F.grappling.flags.map(x => x.flag).join(", ") : null;
  const n = v => v == null || v !== v ? null : +v;
  // better: 1 = higher is better, -1 = lower is better, 0 = no judgement
  const row = (label, va, vb, fmt = x => x, better = 0) => {
    if ((va == null || va === "") && (vb == null || vb === "")) return "";   // nothing to compare yet
    const x = n(va), y = n(vb);
    const ea = better && x != null && y != null && x !== y && ((x > y) === (better > 0));
    const eb = better && x != null && y != null && x !== y && !ea;
    const show = v => v == null || v === "" ? "–" : fmt(v);
    if (better && x != null && y != null && Math.max(x, y) > 0) {   // a number on both sides: mirrored bars
      const m = Math.max(x, y), wa = x / m * 100, wb = y / m * 100;
      return `<tr class="mb"><td><span class="mbv ${ea ? "adv" : ""}">${show(va)}</span><span class="mbt l"><i class="${ea ? "adv" : ""}" style="width:${wa}%"></i></span></td>
        <th>${label}</th><td><span class="mbt r"><i class="${eb ? "adv" : ""}" style="width:${wb}%"></i></span><span class="mbv ${eb ? "adv" : ""}">${show(vb)}</span></td></tr>`;
    }
    return `<tr><td class="${ea ? "adv" : ""}">${show(va)}</td><th>${label}</th><td class="${eb ? "adv" : ""}">${show(vb)}</td></tr>`;
  };
  const p0 = v => Math.round(v * 100) + "%", d2 = v => (+v).toFixed(2);
  const rec = r => r && (r.w + r.l + r.d) ? `${r.w}-${r.l}${r.d ? "-" + r.d : ""}` : "no fights";
  const vs = (F, label, key, sub) => F.splits && F.splits[key] && F.splits[key][sub] ? rec(F.splits[key][sub]) : "no fights";
  const lines = [], plural = st => ({Striker: "strikers", Wrestler: "wrestlers", Grappler: "grapplers", Balanced: "balanced fighters"}[st] || st);
  if (B.style_label) lines.push(`<li><b>${esc(A.name || "Debut")}</b> against ${plural(B.style_label)}: ${vs(A, "", "vs_style", B.style_label)}</li>`);
  if (A.style_label) lines.push(`<li><b>${esc(B.name || "Debut")}</b> against ${plural(A.style_label)}: ${vs(B, "", "vs_style", A.style_label)}</li>`);
  if (B.stance) lines.push(`<li><b>${esc(A.name)}</b> against ${B.stance.toLowerCase()} fighters: ${vs(A, "", "vs_stance", B.stance)}</li>`);
  if (A.stance) lines.push(`<li><b>${esc(B.name)}</b> against ${A.stance.toLowerCase()} fighters: ${vs(B, "", "vs_stance", A.stance)}</li>`);
  if (A.reach_cm && B.reach_cm && Math.abs(A.reach_cm - B.reach_cm) >= 5) {
    const longer = A.reach_cm > B.reach_cm ? A : B, shorter = longer === A ? B : A;
    lines.push(`<li><b>${esc(shorter.name)}</b> against longer-reach opponents: ${vs(shorter, "", "vs_reach", "longer")}</li>`);
    lines.push(`<li><b>${esc(longer.name)}</b> against shorter-reach opponents: ${vs(longer, "", "vs_reach", "shorter")}</li>`);
  }
  if (rounds === 5) for (const F of [A, B]) if (F.name) lines.push(`<li><b>${esc(F.name)}</b> in five-round fights: ${F.splits && F.splits.five_rounds ? rec(F.splits.five_rounds) : "first one"}</li>`);
  const wb = F => F.wins_by ? `${F.wins_by.KO} / ${F.wins_by.SUB} / ${F.wins_by.DEC}` : null;
  const lb = F => F.losses_by ? `${F.losses_by.KO} / ${F.losses_by.SUB} / ${F.losses_by.DEC}` : null;
  return `<table class="tt"><thead><tr><th>${esc(A.name || "UFC debut")}</th><th></th><th>${esc(B.name || "UFC debut")}</th></tr></thead><tbody>
    ${row("Style", A.style_label, B.style_label)}
    ${row("UFC record", A.ufc_record, B.ufc_record)}${row("Pro record", A.pro_record, B.pro_record)}
    ${row("Rating", A.rating, B.rating, x => x, 1)}${row("Age", A.age, B.age, x => x, -1)}
    ${row("Height", A.height_cm, B.height_cm, cm, 1)}${row("Reach", A.reach_cm, B.reach_cm, inch, 1)}${row("Stance", A.stance, B.stance)}
    ${row("Streak", A.streak, B.streak, x => x > 0 ? "W" + x : x < 0 ? "L" + -x : "–", 1)}${row("Finish rate", A.finish_rate, B.finish_rate, p0, 1)}
    ${row("Wins by KO / sub / dec", wb(A), wb(B))}${row("Losses by KO / sub / dec", lb(A), lb(B))}
    ${row("Grappling", flagText(A), flagText(B))}
    <tr class="sec"><th colspan="3">Striking (UFC career)</th></tr>
    ${row("Sig. strikes landed / min", cv(ga.slpm, sa.sig_strikes_landed_per_min), cv(gb.slpm, sb.sig_strikes_landed_per_min), d2, 1)}
    ${row("Sig. strikes absorbed / min", cv(ga.sapm, sa.sig_strikes_absorbed_per_min), cv(gb.sapm, sb.sig_strikes_absorbed_per_min), d2, -1)}
    ${row("Striking accuracy", cv(ga.str_acc, sa.sig_strike_accuracy), cv(gb.str_acc, sb.sig_strike_accuracy), p0, 1)}
    ${row("Strike defense", ga.str_def, gb.str_def, p0, 1)}
    ${row("Knockdowns / 15 min", cv(ga.kd_per15, sa.knockdowns_per_15), cv(gb.kd_per15, sb.knockdowns_per_15), d2, 1)}
    ${row("Strikes to head / body / leg", mix(ga, ["head", "body", "leg"]), mix(gb, ["head", "body", "leg"]))}
    ${row("Standing / clinch / ground", mix(ga, ["standing", "clinch", "ground"]), mix(gb, ["standing", "clinch", "ground"]))}
    <tr class="sec"><th colspan="3">Grappling (UFC career)</th></tr>
    ${row("Takedowns / 15 min", cv(ga.td_per15, sa.takedowns_per_15), cv(gb.td_per15, sb.takedowns_per_15), d2, 1)}
    ${row("Takedown defense", cv(ga.td_def, sa.takedown_defense), cv(gb.td_def, sb.takedown_defense), p0, 1)}
    ${row("Submission attempts / 15 min", cv(ga.sub_per15, sa.submission_attempts_per_15), cv(gb.sub_per15, sb.submission_attempts_per_15), d2, 1)}
    ${row("Control time share", sa.control_time_share, sb.control_time_share, p0, 1)}
    ${row("Times submitted", ga.ufc_fights ? ga.sub_losses : null, gb.ufc_fights ? gb.sub_losses : null, x => x, -1)}
    ${row("Average fight time", ga.avg_time, gb.avg_time, mmss)}
  </tbody></table>

  ${lines.length ? `<h3>Against this kind of opponent</h3><ul class="vslist">${lines.join("")}</ul>
` : ""}`;
}

async function viewCard() {
  const [p] = await Promise.all([getPred(), loadGrap()]);
  if (!p) return `<div class="empty">No predictions yet: the first scheduled run fills this in.</div>`;
  clearTimeout(window.refresh);
  if (p.fights.some(f => f.state === "in")) window.refresh = setTimeout(route, 120000);   // fight night: refresh every 2 minutes
  $("#updated").textContent = `Data updated ${new Date(p.updated).toLocaleString()} from ${p.card_source}.`;
  if (!p.fights.length) return `<h1>Next card</h1><div class="empty">${esc(p.message || "No bouts listed yet.")}</div>`;
  const mr = await get("model_record.json"), yr = mr && mr.years[0], all = mr && (mr.since || mr.all);
  const share = p.fights.some(f => f.our_pick && f.state !== "post") && !p.gated
    ? `<button class="pill" type="button" onclick="sharePicksImage()" title="Square image of this week's picks, sized for X and Instagram">Download picks image</button>` : "";
  const how = `<details class="howq"><summary aria-label="How to read this card" title="How to read this card">?</summary><div class="howq-p"><b>How to read this card</b><p>The bar is our chance for each fighter. The white tick is the betting line with the bookmaker's cut removed. The thinner bar shows how the analysts we track are picking.</p><p><b>Our pick</b>: we beat the line by 3+ points and the fighter is the betting favorite or 70%+ to win (no underdogs longer than +150). In close fights (line 40-60%) where 65%+ of the analysts agree, their side is tagged "Expert lean" and becomes our pick if the model has none. No pick when both fighters are debuting. Stakes (1.5u, 1u or 0.5u) are sized by price. "Best price" shows when one book beats the average line.</p><p><b>Value pick</b>: beats the line, but an underdog the model isn't confident in.</p></div></details>`;
  const track = `<div class="cardbar">${mr ? `<div class="cb-rec">
    <span><b>Our picks ${esc(yr.year)}</b> ${yr.our_won}-${yr.our_bets - yr.our_won} <em class="${yr.our_units >= 0 ? "won" : "lost"}">${units(yr.our_units)}</em><small class="cb-n">flat 1u</small></span>
    <span><b>Since ${mr.from || 2020}</b> ${all.our_won}-${all.our_bets - all.our_won} <em class="${all.our_units >= 0 ? "won" : "lost"}">${units(all.our_units)}</em><small class="cb-n">flat 1u</small></span>
    <span class="hide-sm"><b>Winners ${esc(yr.year)}</b> ${yr.pct}%</span>
    <a href="#/record">Full record</a></div>` : ""}<div class="cb-act">${share}<button class="sharebtn" type="button" aria-label="Share this page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Share</button>${how}</div></div>`;
  if (liveOn(p)) window.refresh = setTimeout(route, 120000);
  const first = (p.schedule || []).map(sg => sg.start).sort()[0] || p.fights[0].start;
  return `${liveCenter(p)}<section class="feat solo cardhero">${featMain(p, first, true)}</section>${track}
    ${p.take_preview ? `<section class="take-prev"><b>Jono's preview</b><p>${esc(p.take_preview)}</p></section>` : ""}
    <div class="cardgrid"><div class="cg-main">
    <div class="card-slips"><h2>Our picks</h2>${picksStrip(p)}</div>
    ${lockBanner(p)}
    <div class="stage-wide">${stageNote(p)}</div>
    ${cardToggle()}
    ${(() => { const only = picksOnly(), keep = f => !only || f.our_pick || f.pick || f.locked;
      const fs = p.fights.map((f, i) => [f, i]).filter(([f]) => keep(f));
      const empty = only && !fs.length ? `<div class="empty">No picks on this card yet.</div>` : "";
      const compact = cardView() === "compact";
      return empty || cardSections(p, fs, ([f, i]) => compact ? compactRow(f, i, p.edge_threshold) : bout(f, i, p.edge_threshold), compact); })()}
    </div>${cardSide(p, mr)}</div>`;
}

// card page side panel: the night's picks at a glance, the confidence key and the record
function cardSide(p, mr) {
  const ours = p.fights.map((f, i) => ({f, i})).filter(x => x.f.our_pick);
  const vals = p.fights.map((f, i) => ({f, i})).filter(x => x.f.pick && x.f.pick !== x.f.our_pick);
  const go = i => `onclick="event.preventDefault();document.getElementById('bout-${i}')?.scrollIntoView({behavior:'smooth',block:'start'})"`;
  const risk = ours.reduce((s, x) => s + (x.f.stake || 0), 0);
  const tiers = {High: 0, Medium: 0, Low: 0}; p.fights.forEach(f => { const t = f.tier || tierOf(f.p_a); if (t) tiers[t]++; });
  const S = mr && (mr.since || mr.all), T = S && S.tiers;
  const row = ({f, i}, kind) => { const nm = kind === "v" ? f.pick : f.our_pick, o = nm === f.a ? f.odds_a : f.odds_b;
    const w = f.state === "post" && f.result ? f.result.winner : null;
    return `<a href="#bout-${i}" ${go(i)} class="cs-row${w ? (w === nm ? " won" : " lost") : ""}"><span class="cs-n">${esc(nm)}<small>vs ${esc(nm === f.a ? f.b : f.a)}</small></span>
      <span class="cs-o">${odds(o)}${kind === "v" ? "" : f.stake ? ` · ${f.stake}u` : ""}</span>${tierTag(f.tier || tierOf(f.p_a), true)}</a>`; };
  return `<aside class="cg-side"><div class="cs-in">
    <section class="cs-box"><h3>${kick("This card", "gold")}Our picks</h3>
      ${ours.length ? ours.map(x => row(x)).join("") : p.gated ? "" : `<p class="note">No picks yet. They appear as lines and expert picks come in.</p>`}
      ${ours.length ? `<div class="cs-tot"><span>${ours.length} pick${ours.length > 1 ? "s" : ""}</span><b>${Math.round(risk * 10) / 10}u risked</b></div>` : ""}
      ${p.gated && p.locked_count ? `<div class="cs-lock">${lockIcon}<div><b>${p.locked_count} more pick${p.locked_count > 1 ? "s" : ""} locked</b><span>Get every pick, stake and reason for this card.</span></div>${planBtns(true)}</div>` : ""}</section>
    ${vals.length ? `<section class="cs-box"><h3>${kick("Underdogs", "teal")}Value picks only</h3>${vals.map(x => row(x, "v")).join("")}
      <p class="small">The model beats the line here but isn't confident enough to make it a pick.</p></section>` : ""}
    ${p.gated ? "" : `<section class="cs-box"><h3>${kick("Confidence", "blue")}On this card</h3>
      ${["High", "Medium", "Low"].map(t => `<div class="cs-tier">${tierTag(t)}<b>${tiers[t]}</b><span>${T && T[t] ? `${T[t].pct}% right since ${mr.from || 2020}` : ""}</span></div>`).join("")}</section>`}
  </div></aside>`;
}

function cardView() { const dflt = window.innerWidth < 700 ? "compact" : "full";
  try { return localStorage.getItem("cardView") || dflt; } catch (e) { return dflt; } }
function setCardView(v) { try { localStorage.setItem("cardView", v); } catch (e) {} route(); }
function picksOnly() { try { return localStorage.getItem("picksOnly") === "1"; } catch (e) { return false; } }
function setPicksOnly(v) { try { localStorage.setItem("picksOnly", v ? "1" : "0"); } catch (e) {} route(); }
window.setPicksOnly = setPicksOnly;
function cardToggle() {
  const v = cardView(), only = picksOnly();
  return `<div class="cardctl"><div class="viewtoggle" role="group" aria-label="Card view"><button type="button" aria-pressed="${v === "full"}" onclick="setCardView('full')">Full cards</button><button type="button" aria-pressed="${v === "compact"}" onclick="setCardView('compact')">Compact</button></div>
    <div class="viewtoggle" role="group" aria-label="Which fights"><button type="button" aria-pressed="${!only}" onclick="setPicksOnly(false)">All fights</button><button type="button" aria-pressed="${only}" onclick="setPicksOnly(true)">Picks only</button></div></div>`;
}
function compactRow(f, i, edge) {
  const pa = f.p_a, line = f.market_p_a;
  const w = f.state === "post" && f.result ? f.result.winner : null;
  const called = f.our_pick || f.model_pick || f.expert_lean || (pa != null ? (pa > 0.5 ? f.a : f.b) : null);
  const ring = w && called ? (called === w ? " ring-won" : " ring-lost") : "";
  const sideA = (f.hidden ? line : pa) >= 0.5, last = n => esc(n.split(" ").slice(-1)[0]);
  return `<details id="bout-${i}" class="crow${ring}"><summary>
      <span class="cr-a${sideA ? " fav" : ""}">${photo(f.a_id, f.a, "sm")}<span>${esc(f.a)}</span></span>
      <span class="cr-p${f.hidden ? " hidp" : ""}">${f.hidden ? `<b class="pa${sideA ? " hi" : ""}">${line != null ? pct(line) : "–"}</b><span class="cr-l">line · ${lockIcon}</span><b class="pb${sideA ? "" : " hi"}">${line != null ? (100 - Math.round(100 * line)) + "%" : "–"}</b>`
        : `<b class="pa${sideA ? " hi" : ""}">${pct(pa)}</b><span class="cr-l">${line != null ? "line " + pct(line) : "no line"}</span><b class="pb${sideA ? "" : " hi"}">${100 - Math.round(100 * pa)}%</b>`}</span>
      <span class="cr-b${!sideA ? " fav" : ""}"><span>${esc(f.b)}</span>${photo(f.b_id, f.b, "sm")}</span>
      <span class="cr-pick">${tierTag(f.tier || tierOf(pa), true)}${f.splits && !f.hidden ? (() => { const sp = f.splits, onA = sp.handle_a >= sp.handle_b, nm = onA ? f.a : f.b;
        return `<span class="cr-spl" title="DraftKings public betting">Money ${Math.round(100 * (onA ? sp.handle_a : sp.handle_b))}% ${last(nm)} · bets ${Math.round(100 * (onA ? sp.bets_a : sp.bets_b))}%</span>`; })() : ""}${f.locked ? `<span class="mini-lock">${lockIcon}Locked</span>` : f.our_pick ? `<span class="mini-ticket">${last(f.our_pick)} ${odds(f.our_pick === f.a ? f.odds_a : f.odds_b)}${f.stake ? " · " + f.stake + "u" : ""}</span>${f.our_pick === f.pick ? `<span class="vtag">Value</span>` : ""}` : f.pick ? `<span class="vtag">Value ${last(f.pick)} ${odds(f.pick === f.a ? f.odds_a : f.odds_b)}</span>` : f.expert_lean ? `<span class="lean">Lean ${last(f.expert_lean)}</span>` : ""}</span>
    </summary>${bout(f, i, edge)}</details>`;
}

// ---------------- this week's picks, units chart, fight-night bar ----------------
const pay = o => o > 0 ? o / 100 : 100 / -o;
function picksStrip(p) {
  const ours = (p.fights || []).filter(f => f.our_pick);
  const teaser = p.gated && p.locked_count ? `<a class="ticket locked" href="#/pricing">${lockIcon}<span class="tk-name">+${p.locked_count} more pick${p.locked_count > 1 ? "s" : ""}</span>
      <span class="tk-opp">Locked for members</span><span class="tk-row">${PLANS ? PLANS.plans.map(pl => `<b>${esc(pl.name)} $${pl.price}</b>`).join("") : ""}</span></a>` : "";
  if (!ours.length && teaser) return `<div class="slip">${teaser}</div>`;
  if (!ours.length) return `<div class="slip empty-slip">No picks yet. They go up as the lines settle during fight week.</div>`;
  return `${stageNote(p)}<div class="slip">${ours.map(f => {
    const o = f.our_pick === f.a ? f.odds_a : f.odds_b, best = f.our_pick === f.a ? f.best_a : f.best_b;
    const opp = f.our_pick === f.a ? f.b : f.a;
    const done = f.state === "post" && f.result && f.result.winner;
    const res = done ? (f.result.winner === f.our_pick ? "won" : "lost") : "";
    return `<a class="ticket ${res}" href="#/card">
      <span class="tk-name">${esc(f.our_pick)}</span>
      <span class="tk-opp">vs ${esc(opp)}</span>
      ${done || f.state === "in" ? "" : stageTag(f)}
      <span class="tk-row"><b>${odds(o)}</b>${f.stake ? `<b>${f.stake}u</b>` : ""}${tierTag(f.tier || tierOf(f.p_a), true)}${f.our_pick === f.pick ? `<i class="v">Value</i>` : f.expert_lean === f.our_pick ? `<i>Expert lean</i>` : ""}</span>
      ${postedLine(f, "tk-posted")}
      ${best != null && o != null && pay(best) > pay(o) ? `<span class="tk-best">Best price ${odds(best)}${bestAt(f, f.our_pick === f.a ? "a" : "b")}</span>` : ""}
      ${(() => { const isA = f.our_pick === f.a, ln = f.market_p_a == null ? null : isA ? f.market_p_a : 1 - f.market_p_a, us = f.p_a == null ? null : isA ? f.p_a : 1 - f.p_a;
        return ln != null && us != null && us > ln ? `<span class="tk-val">The line says <b>${Math.round(100 * ln)}%</b>. We say <b>${Math.round(100 * us)}%</b>.</span>`
          : f.expert_lean === f.our_pick ? `<span class="tk-val">Close fight; most of the tracked analysts agree on this side.</span>` : ""; })()}
      ${f.take ? `<span class="tk-why tk-take">“${esc(f.take)}”</span>` : ""}
      ${res ? `<span class="tk-res">${res === "won" ? "Won" : "Lost"}</span>` : ""}
    </a>`;
  }).join("")}${teaser}</div>`;
}

// cumulative units from betting the favorite in every fight, flat 1 unit, by card date
function lineCurve(rr) {
  if (!rr || !rr.rows) return null;
  const by = {}; let s = 0;
  for (const x of rr.rows) if (x[6]) { s += x[6][1]; by[x[0]] = +s.toFixed(2); }
  return by;
}
function unitsChart(curve, lineBy) {
  if (!curve || curve.length < 2) return "";
  if (lineBy) { let v = 0; curve = curve.map(c => { if (lineBy[c[0]] != null) v = lineBy[c[0]]; return [c[0], c[1], c[2], v]; }); }
  const hasLine = !!lineBy;
  const W = 860, H = 220, P = {l: 44, r: 14, t: 14, b: 26};
  const t = d => new Date(d).getTime(), t0 = t(curve[0][0]), t1 = t(curve.at(-1)[0]);
  const ys = curve.flatMap(c => hasLine ? [c[1], c[2], c[3]] : [c[1], c[2]]), lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
  const X = d => P.l + (t(d) - t0) / Math.max(1, t1 - t0) * (W - P.l - P.r), Y = v => P.t + (hi - v) / Math.max(1, hi - lo) * (H - P.t - P.b);
  const path = k => curve.map((c, i) => (i ? "L" : "M") + X(c[0]).toFixed(1) + " " + Y(c[k]).toFixed(1)).join("");
  const years = [...new Set(curve.map(c => c[0].slice(0, 4)))];
  const step = hi - lo > 60 ? 20 : 10, grid = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(v);
  const last = curve.at(-1);
  return `<figure class="uchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Our picks, cumulative units: ${units(last[1])} flat, ${units(last[2])} with suggested stakes">
    ${grid.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? "zero" : "g"}"/><text x="${P.l - 6}" y="${Y(v) + 4}" class="yl">${v > 0 ? "+" : ""}${v}</text>`).join("")}
    ${years.map(y => { const x = X(`${y}-01-01` < curve[0][0] ? curve[0][0] : `${y}-01-01`); return `<line x1="${x}" x2="${x}" y1="${P.t}" y2="${H - P.b}" class="g"/><text x="${x + 3}" y="${H - 8}" class="xl">${y}</text>`; }).join("")}
    ${hasLine ? `<path d="${path(3)}" class="line"/>` : ""}<path d="${path(1)}" class="flat"/><path d="${path(2)}" class="staked"/>
  </svg><figcaption><span class="k staked"></span>Suggested stakes ${units(last[2])} <span class="k flat"></span>Flat 1 unit ${units(last[1])}${hasLine ? ` <span class="k line"></span>Betting line: every favorite, 1 unit <b class="${last[3] >= 0 ? "won" : "lost"}">${units(last[3])}</b>` : ""}</figcaption></figure>`;
}

function ledgerCurve(rows) {
  const r = (rows || []).filter(g => g.our_pick).sort((a, b) => a.date < b.date ? -1 : 1);
  let f = 0, st = 0; const by = {};
  for (const g of r) { f += g.our_units || 0; st += g.our_staked_units || 0; by[g.date] = [g.date, +f.toFixed(2), +st.toFixed(2)]; }
  return Object.values(by);
}

// ---- fight night live centre: the fight on now, the tally so far, and the whole card as a timeline ----
function liveOn(p) {
  const fs = p && p.fights || [];
  if (fs.some(f => f.state === "in")) return true;
  const done = fs.some(f => f.state === "post"), left = fs.some(f => f.state === "pre");
  const day = d => new Date(d).toISOString().slice(0, 10);
  return done && left && [day(Date.now()), day(Date.now() - 864e5)].includes(p.date);
}
function liveCenter(p) {
  if (!liveOn(p)) return "";
  const order = p.fights.map((f, i) => ({f, i})).sort((x, y) => (x.f.start || "").localeCompare(y.f.start || "") || y.i - x.i);
  order.forEach((x, k) => { x.k = k + 1; });
  let n = 0; for (const x of order) if (x.f.state === "pre") x.n = ++n;
  const now = order.find(x => x.f.state === "in"), next = order.find(x => x.f.state === "pre");
  const done = order.filter(x => x.f.state === "post");
  const last = done.at(-1);
  // tonight's tally: our picks at suggested stakes, value picks flat, the model's winners
  let ow = 0, ol = 0, ou = 0, vw = 0, vl = 0, vu = 0, mw = 0, mn = 0, mu = 0;
  for (const {f} of done) {
    const w = f.result && f.result.winner; if (!w) continue;
    if (f.our_pick) { const o = f.our_pick === f.a ? f.odds_a : f.odds_b, st = f.stake || 1;
      if (w === f.our_pick) { ow++; ou += st * pay(o); } else { ol++; ou -= st; } }
    if (f.pick) { const o = f.pick === f.a ? f.odds_a : f.odds_b;
      if (w === f.pick) { vw++; vu += pay(o); } else { vl++; vu -= 1; } }
    const mp = f.model_pick || (f.p_a != null ? (f.p_a >= 0.5 ? f.a : f.b) : null);
    if (mp) { mn++; const o = mp === f.a ? f.odds_a : f.odds_b;
      if (mp === w) { mw++; if (o != null) mu += pay(o); } else if (o != null) mu -= 1; }
  }
  const r2 = x => Math.round(x * 100) / 100;
  const corner = (f, side) => {
    const nm = side === "a" ? f.a : f.b, sl = side === "a" ? f.a_slug : f.b_slug, id = side === "a" ? f.a_id : f.b_id;
    const ch = f.p_a == null ? null : side === "a" ? Math.round(100 * f.p_a) / 100 : 1 - Math.round(100 * f.p_a) / 100, o = side === "a" ? f.odds_a : f.odds_b;
    const ours = f.our_pick === nm, val = f.pick === nm;
    return `<a class="lc-corner ${side}${ours ? " ours" : ""}" href="#/fighter/${esc(sl)}">${photo(id, nm, "xl")}
      <span class="lc-name">${esc(nm)}${champTag(sl)}${favStar(sl)}</span>
      <span class="lc-meta">${rankOf(sl)}${flagOf(sl, true)}</span>
      <span class="lc-pct">${pct(ch)}</span><span class="lc-odds">${o != null ? odds(o) : "no line"}</span>
      ${ours ? `<span class="lc-tag ours">Our pick${f.stake ? " · " + f.stake + "u" : ""}</span>` : ""}${val ? `<span class="lc-tag value">Value pick</span>` : ""}</a>`;
  };
  const spot = (x, label) => !x ? "" : `<div class="lc-spot${x.f.state === "in" ? " on" : ""}">
      <div class="lc-label">${x.f.state === "in" ? `<span class="live">Now fighting</span>` : `<span class="lc-next">${label}</span>`}
        <span class="lc-status">${x.f.state === "in" ? esc(/pre-?fight|scheduled/i.test(x.f.status || "") ? "Walkouts" : x.f.status || "In progress") : x.f.weight_class ? esc(x.f.weight_class) : ""}</span></div>
      <div class="lc-face">${corner(x.f, "a")}<span class="lc-vs">VS</span>${corner(x.f, "b")}</div>
      ${x.f.state === "in" ? roundClock(x.f) : ""}
      ${x.f.p_a != null ? `<div class="lc-bar" title="Our chance"><i class="a" style="width:${Math.round(100 * x.f.p_a)}%"></i><i class="b"></i>${x.f.market_p_a != null ? `<em style="left:${Math.round(100 * x.f.market_p_a)}%" title="Betting line"></em>` : ""}</div>` : ""}
      <a class="lc-more" href="#/card" onclick="setTimeout(()=>document.getElementById('bout-${x.i}')?.scrollIntoView({behavior:'smooth'}),400)">Full breakdown</a>
    </div>`;
  const pip = x => {
    const f = x.f, w = f.state === "post" && f.result ? f.result.winner : null;
    const called = f.our_pick || f.model_pick || (f.p_a != null ? (f.p_a >= 0.5 ? f.a : f.b) : null);
    const cls = f.state === "in" ? "in" : w ? (called === w ? "won" : "lost") : f.state === "post" ? "nc" : "pre";
    const ln = n => esc(String(n).split(" ").at(-1));
    const sub = f.state === "in" ? "Live" : w ? `${ln(w)} · ${esc((f.result.detail || "").replace(/^Final\s*-?\s*/i, "").replace(/, round /i, " R").replace(/ round /i, " R"))}`
      : x.n === 1 ? "Up next" : `Fight ${x.k}`;
    return `<li class="lc-pip ${cls}${f.our_pick ? " has-pick" : ""}"><a href="#/card" onclick="setTimeout(()=>document.getElementById('bout-${x.i}')?.scrollIntoView({behavior:'smooth'}),400)">
      <span class="dot"></span><span class="who">${ln(f.a)} <small>vs</small> ${ln(f.b)}</span><span class="sub">${sub}</span>${f.our_pick ? `<span class="star" title="Our pick: ${esc(f.our_pick)}">●</span>` : ""}</a></li>`;
  };
  setTimeout(() => resultMoments(order), 50);
  return `<section class="livecenter">
    <div class="lc-head"><span class="live">Live</span><b>${esc(p.event)}</b><span class="lc-count">Fight ${Math.min(done.length + 1, order.length)} of ${order.length}</span></div>
    <div class="lc-tally">
      <div><b>${ow}-${ol}</b><span>Our picks</span><em class="${ou >= 0 ? "won" : "lost"}">${units(r2(ou))}</em></div>
      <div><b>${vw}-${vl}</b><span>Value picks</span><em class="${vu >= 0 ? "won" : "lost"}">${units(r2(vu))}</em></div>
      <div><b>${mw}/${mn}</b><span>Model winners</span><em class="${mu >= 0 ? "won" : "lost"}">${units(r2(mu))}</em></div>
    </div>
    ${betSlip(order)}
    ${now ? spot(now) : spot(next, "Up next")}
    ${last && last.f.result ? `<div class="lc-last"><span>Last result</span><b>${esc(last.f.result.winner || "Draw")}</b> def. ${esc(last.f.result.winner === last.f.a ? last.f.b : last.f.a)} <small>${esc((last.f.result.detail || "").replace(/^Final\s*-?\s*/i, ""))}</small></div>` : ""}
    ${now && next ? `<div class="lc-upnext"><span>Up next</span>${esc(next.f.a)} vs ${esc(next.f.b)}${next.f.our_pick ? ` <em>Our pick: ${esc(next.f.our_pick)}${next.f.stake ? " " + next.f.stake + "u" : ""}</em>` : ""}</div>` : ""}
    <ol class="lc-line">${order.map(pip).join("")}</ol>
    <p class="lc-foot">Units: our picks at suggested stakes; value picks and model winners at a flat 1u. Green: our call won. Red: it lost. Gold dot: one of our picks. Updates every few minutes; this page refreshes itself.</p>
  </section>`;
}

// round clock: one segment per scheduled round, finished rounds filled, the current one pulsing
function roundClock(f) {
  const n = f.rounds || 3, m = /R(?:ound)?\s*(\d+)/i.exec(f.status || ""), cur = m ? +m[1] : 0;
  const t = /(\d+:\d\d)/.exec(f.status || "");   // ESPN's live clock counts down: time left in the round
  const left = t ? (([mm, ss]) => +mm * 60 + +ss)(t[1].split(":")) : null;
  return `<div class="lc-rounds" aria-label="${cur ? `Round ${cur} of ${n}` : `${n} rounds`}">
    ${Array.from({length: n}, (_, k) => `<span class="${k + 1 < cur ? "done" : k + 1 === cur ? "now" : ""}"${k + 1 === cur && left != null ? ` style="--f:${Math.round(100 * (300 - left) / 300)}%"` : ""}><b>R${k + 1}</b></span>`).join("")}
    <em>${cur ? `Round ${cur} of ${n}${t ? ` · ${t[1]} left` : ""}` : `${n} rounds · walkouts`}</em></div>`;
}
// tonight's bet slip: every one of our picks with its price, stake and where it stands
function betSlip(order) {
  const rows = order.filter(x => x.f.our_pick), nLocked = order.filter(x => x.f.locked).length;
  if (!rows.length && !nLocked) return "";
  if (!rows.length) return `<div class="cs-lock slip-lock">${lockIcon}<div><b>Tonight's bet slip is for members</b><span>${nLocked} pick${nLocked > 1 ? "s" : ""} still to go on this card.</span></div>${planBtns(true)}</div>`;
  let settled = 0, risk = 0;
  const li = rows.map(({f, i}) => {
    const o = f.our_pick === f.a ? f.odds_a : f.odds_b, st = f.stake || 1, w = f.state === "post" && f.result ? f.result.winner : null;
    let cls = "pend", res = "Pending";
    if (f.state === "in") { cls = "lv"; res = "Live"; risk += st; }
    else if (w) { const u = w === f.our_pick ? st * pay(o) : -st; settled += u; cls = u >= 0 ? "won" : "lost"; res = units(Math.round(u * 100) / 100); }
    else if (f.state === "post") { cls = "void"; res = "No result"; }
    else risk += st;
    return `<li class="${cls}"><a href="#/card" onclick="setTimeout(()=>document.getElementById('bout-${i}')?.scrollIntoView({behavior:'smooth'}),400)">
      <span class="bs-who">${esc(f.our_pick)}${f.our_pick === f.pick ? ` <small class="v">value</small>` : f.our_pick === f.expert_lean ? ` <small>expert lean</small>` : ""}</span>
      <span class="bs-px">${odds(o)} · ${st}u</span><span class="bs-res">${res}</span></a></li>`;
  }).join("");
  return `<details class="lc-slip" open><summary><span>Bet slip</span><b class="${settled >= 0 ? "won" : "lost"}">${units(Math.round(settled * 100) / 100)}</b><small>settled · ${Math.round(risk * 10) / 10}u still to go</small></summary>
    <ol>${li}</ol></details>`;
}
// a fight that ended since the last refresh: flash its pill and pop a short line with the result
let LC_SEEN = null;
function resultMoments(order) {
  let prev = LC_SEEN;
  if (!prev) { try { prev = JSON.parse(sessionStorage.getItem("lcSeen") || "null"); } catch (e) {} }
  const nowDone = order.filter(x => x.f.state === "post").map(x => x.f.a + "|" + x.f.b);
  LC_SEEN = nowDone; try { sessionStorage.setItem("lcSeen", JSON.stringify(nowDone)); } catch (e) {}
  if (!prev) return;   // first look: nothing is "new"
  const fresh = order.filter(x => x.f.state === "post" && !prev.includes(x.f.a + "|" + x.f.b));
  for (const {f, i} of fresh) {
    const w = f.result && f.result.winner, pk = f.our_pick, o = pk ? (pk === f.a ? f.odds_a : f.odds_b) : null;
    const u = pk && w ? (w === pk ? (f.stake || 1) * pay(o) : -(f.stake || 1)) : null;
    const pill = document.querySelector(`.lc-pip a[onclick*="bout-${i}'"]`); if (pill) pill.parentElement.classList.add("flash");
    const t = document.createElement("div");
    t.className = "lc-toast " + (u == null ? "" : u >= 0 ? "won" : "lost");
    t.innerHTML = `<b>${esc(w || "Result")}</b> ${w ? "wins" : ""}${u != null ? ` · our pick ${units(Math.round(u * 100) / 100)}` : ""}<small>${esc((f.result && f.result.detail || "").replace(/^Final\s*-?\s*/i, ""))}</small>`;
    document.body.appendChild(t); setTimeout(() => t.classList.add("out"), 7000); setTimeout(() => t.remove(), 7800);
  }
}

async function liveBar() {
  const el = $("#livebar"); if (!el) return;
  const p = await getPred();
  if (p && p.updated) $("#updated").textContent = `Data updated ${new Date(p.updated).toLocaleString([], {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})}.`;
  const fights = p && p.fights || [];
  const now = fights.filter(f => f.state === "in"), done = fights.filter(f => f.state === "post");
  const today = new Date().toISOString().slice(0, 10), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const on = now.length || (done.length && fights.some(f => f.state === "pre") && (p.date === today || p.date === y));
  clearTimeout(window.liveRefresh);
  if (!on) { el.hidden = true; el.innerHTML = ""; return; }
  window.liveRefresh = setTimeout(route, 120000);
  let w = 0, l = 0, u = 0;
  for (const f of done) if (f.our_pick && f.result && f.result.winner) {
    const o = f.our_pick === f.a ? f.odds_a : f.odds_b, st = f.stake || 1;
    if (f.result.winner === f.our_pick) { w++; u += st * pay(o); } else { l++; u -= st; }
  }
  el.hidden = false;
  el.innerHTML = `<div class="lbin"><span class="live">Live</span>
    <span class="lb-now">${now.length ? now.map(f => `${esc(f.a.split(" ").at(-1))} vs ${esc(f.b.split(" ").at(-1))}`).join(" · ") : "Between fights"}</span>
    <span class="lb-score">Our picks tonight <b>${w}-${l}</b> <b class="${u >= 0 ? "won" : "lost"}">${units(Math.round(u * 100) / 100)}</b></span>
    <a href="#/card">Card</a></div>`;
}

// the last card's results, shown on the home page for a week afterwards
async function lastCard(ev) {
  const e0 = (ev || [])[0];
  if (!e0 || (Date.now() - new Date(e0.date + "T23:59:00")) / 864e5 > 10) return "";
  const [e, L, mv] = await Promise.all([get(`events/${e0.slug}.json`), get("ledger.json", true), get("movers.json", true)]);
  if (!e || !e.bouts) return "";
  let r = e.record || {};
  const lr = L && L.rows ? L.rows.filter(g => g.date === e0.date) : [];
  if (lr.length) { const o = lr.filter(g => g.our_pick);
    r = {our_bets: o.length, our_won: o.filter(g => g.winner && g.winner === g.our_pick).length,
         our_staked: Math.round(100 * o.reduce((s, g) => s + (g.our_staked_units || 0), 0)) / 100,
         right: lr.filter(g => g.model_pick === g.winner).length, picks: lr.length,
         value_bets: lr.filter(g => g.value_pick).length, value_won: lr.filter(g => g.value_pick && g.value_pick === g.winner).length}; }
  const mvBy = {};
  if (mv && mv.card && mv.event_slug === e.slug) for (const x of mv.card) mvBy[x.slug] = x;
  const sgn = v => (v > 0 ? "+" : "") + v;
  const side = (b, s) => { const won = b.winner === s, slug = b[s + "_slug"], m = mvBy[slug];
    return `<a class="lc-f ${won ? "w" : b.winner ? "l" : ""}" href="#/fighter/${esc(slug)}">${photo(b[s + "_id"], b[s], "md")}
      <span class="lc-n"><b>${esc(b[s])}</b>${m ? `<small>EDGE ${m.rating} <span class="${m.change >= 0 ? "won" : "lost"}">${sgn(m.change)}</span></small>` : ""}</span>
      ${won ? `<span class="lc-w">W</span>` : ""}</a>`; };
  const pickLine = b => { const p = b.our_pick || b.value_pick || b.model_pick; if (!p || !b.winner) return "";
    const lab = b.our_pick ? "Our pick" : b.value_pick ? "Value pick" : "Model";
    return `<span class="lc-p ${p.right ? "won" : "lost"}">${lab}: ${esc(p.side === "a" ? b.a : b.b)} ${p.right ? "✓" : "✗"}${b.our_pick && p.units != null ? ` <b>${units(p.units)}</b>` : ""}</span>`; };
  const how = b => b.winner === "draw" || b.winner === "nc" ? "No winner" : [b.finish, b.round ? `R${b.round}` : ""].filter(Boolean).join(" · ");
  const bouts = e.bouts.filter(b => b.winner).slice(0, 3).map(b => `<div class="lc-b">
      <div class="lc-fs">${side(b, "a")}<span class="lc-vs">vs</span>${side(b, "b")}</div>
      <div class="lc-m"><span>${esc(b.weight_class || "")}${how(b) ? " · " + esc(how(b)) : ""}</span>${pickLine(b)}</div></div>`).join("");
  const u = r.our_staked ?? r.our_units;
  return `<section class="lastcard panel">
    <div class="lw-h"><h2>${kick("Last card", "gold")}${esc(String(e.name).split(/:\s*/)[1] || e.name)}</h2><a href="#/event/${esc(e.slug)}">Full results</a></div>
    <div class="lc-sum">
      ${r.our_bets ? `<span><b class="${u >= 0 ? "won" : "lost"}">${units(u)}</b><small>Our picks ${r.our_won}-${r.our_bets - r.our_won}</small></span>` : ""}
      <span><b>${r.right}/${r.picks}</b><small>Winners picked</small></span>
      ${r.value_bets ? `<span><b>${r.value_won}-${r.value_bets - r.value_won}</b><small>Value picks</small></span>` : ""}
      <span><small>${dateLong(e.date)}</small></span>
    </div>
    <div class="lc-list">${bouts}</div>
  </section>`;
}

// ---------------- home ----------------
function countdown(start) {
  const ms = new Date(start) - Date.now();
  if (ms <= 0) return "Fight night is on";
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5);
  return d > 0 ? `In ${d} day${d > 1 ? "s" : ""}${h ? `, ${h} hour${h > 1 ? "s" : ""}` : ""}` : `In ${h} hour${h !== 1 ? "s" : ""}`;
}

// home: the brand band with three proof cards
function proofBand(mr, L) {
  if (!mr || !mr.since) return "";
  const yr = mr.years && mr.years[0], s = mr.since, hi = s.tiers && s.tiers.High;
  const live = L && L.fights ? `${L.our_won}-${L.our_bets - L.our_won}` : null;
  const liveCards = L && L.rows ? new Set(L.rows.map(g => g.date)).size : 0, goLive = liveCards >= 10;
  return `<section class="proof">
    <div class="pf-head">
      <h1>Beat the sportsbook, <em>not just the fight.</em></h1>
      <p>${s.vs_line ? `Our picks are up <b class="won">${units(s.our_units)}</b> since ${mr.from || 2020}. Betting every favorite on the same cards lost <b class="lost">${units(s.vs_line.line_units)}</b>.` : ""} Every pick goes up before the fight and gets graded after it, win or lose.</p>
      <div class="pf-cta"><a class="btn" href="${paywallOn() && myPlan() === "free" ? "#/pricing" : "#/card"}">Get this week's picks</a><a class="pill" href="#/record">See every result</a></div></div>
    <div class="pf-cards">
      <a class="pf-card c1" href="#/record"><span class="pf-l">Winners picked</span><b>${yr ? yr.pct : s.pct}%</b>
        <span class="pf-s">${yr ? `${yr.right}/${yr.picks} fights in ${esc(yr.year)}` : ""} · ${s.pct}% across ${s.picks.toLocaleString()} since ${mr.from || 2020}</span><span class="pf-go">See the full record →</span></a>
      <a class="pf-card c2" href="#/card"><span class="pf-l">High-confidence picks</span><b>${hi ? hi.pct : "–"}%</b>
        <span class="pf-s">${hi ? `${hi.right.toLocaleString()} of ${hi.picks.toLocaleString()} won since ${mr.from || 2020}, our chance 70%+` : ""}</span><span class="pf-go">This week's card →</span></a>
      <a class="pf-card c3" href="#/record"><span class="pf-l">Our picks</span><b class="${s.our_units >= 0 ? "won" : "lost"}">${units(s.our_units)}</b>
        <span class="pf-s">${s.our_won}-${s.our_bets - s.our_won} since ${mr.from || 2020}, flat 1u</span><span class="pf-go">Full record →</span></a>
    
      ${s.vs_line ? `<a class="pf-card c4" href="#/pricing"><span class="pf-l">Return per bet</span><b class="won">+${s.our_roi_pct}%</b>
        <span class="pf-s">flat 1u since ${mr.from || 2020}, ${s.our_risked ? `+${(100 * s.our_staked_units / s.our_risked).toFixed(1)}% at suggested stakes` : ""}</span><span class="pf-go">See plans →</span></a>
      <a class="pf-card c5" href="#/record"><span class="pf-l">When we disagree with the line</span><b>${s.vs_line.disagree_model_right}-${s.vs_line.disagree - s.vs_line.disagree_model_right}</b>
        <span class="pf-s">our side won ${(100 * s.vs_line.disagree_model_right / s.vs_line.disagree).toFixed(1)}%; the line expected ${s.vs_line.disagree_line_expected}%</span><span class="pf-go">See the proof →</span></a>
      <a class="pf-card c6" href="#/record"><span class="pf-l">Betting every favorite</span><b class="lost">${units(s.vs_line.line_units)}</b>
        <span class="pf-s">every fight with a line, same prices, since ${mr.from || 2020}</span><span class="pf-go">Why favorites lose →</span></a>` : ""}
    </div></section>`;
}

// a large, tightly cropped headshot (the ESPN cutout on a dark panel)
function portrait(id, name, cls) {
  const ini = esc(String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join(""));
  const srcs = photoSrc(id, name);
  const next = srcs[1] ? `if(!this.dataset.f){this.dataset.f=1;this.src='${esc(srcs[1])}'}else this.remove()` : "this.remove()";
  return `<span class="pt ${cls || ""}"><span class="pt-i">${ini}</span>${srcs.length ? `<img alt="" src="${esc(srcs[0])}" onerror="${next}">` : ""}</span>`;
}
const updatedAt = iso => iso ? new Date(iso).toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit"}) : "";
// home lead: this week's main event and the picks for the card, left-aligned like a fight preview
// the main-event showcase: home page (with the picks beside it) and the top of the card page (onCard)
function featMain(p, start, onCard) {
  const m = p.fights[0];
  const [ev, sub] = String(p.event).split(/:\s*/);
  const side = (s) => { const nm = m[s], pa = s === "a" ? m.p_a : m.p_a == null ? null : 1 - m.p_a, ln = m.market_p_a == null ? null : s === "a" ? m.market_p_a : 1 - m.market_p_a;
    const ours = m.p_a == null ? null : s === "a" ? Math.round(100 * m.p_a) : 100 - Math.round(100 * m.p_a);
    const fav = (m.hidden ? (ln ?? 0.5) : (pa ?? 0.5)) >= 0.5;
    return `<a class="ft-f ${fav ? "fav" : ""}" href="#/fighter/${esc(m[s + "_slug"])}">${portrait(m[s + "_id"], nm)}
      <span class="ft-n"><b>${esc(nm)}</b><small>${rankOf(m[s + "_slug"])}${flagOf(m[s + "_slug"], true)}</small></span>
      <span class="ft-p"><b>${m.hidden ? lockIcon : ours + "%"}</b><small>Line ${ln == null ? "–" : (s === "a" ? pct(ln) : (100 - Math.round(100 * m.market_p_a)) + "%")} · ${odds(m["odds_" + s])}</small></span></a>`; };
  return `    <div class="ft-main">
      <div class="ft-show">
        <span class="ft-k">${onCard && p.fights.some(f => f.state && f.state !== "pre") ? "Fight night" : "Next card"}</span>
        <${onCard ? "h1" : "h2"} class="ft-ev">${(() => { const mm = String(ev).match(/^(UFC)\s+(.*)$/i); return mm ? `${esc(mm[1])} <em>${esc(mm[2])}</em>` : esc(ev); })()}</${onCard ? "h1" : "h2"}>
        ${sub ? `<p class="ft-main-ev">${esc(sub)}</p>` : ""}
        <div class="ft-facts"><span><small>Date</small><b>${new Date(p.date + "T12:00:00").toLocaleDateString(undefined, {weekday: "short", month: "short", day: "numeric"})}</b></span>
          ${p.location ? `<span><small>Where</small><b>${esc(p.location.split(",").slice(0, 2).join(","))}</b></span>` : ""}
          ${start ? `<span class="cd"><small>Starts in</small><b>${esc(countdown(start).replace(/^In /, ""))}</b></span>` : ""}</div>
      </div>
      <div class="ft-fight">${side("a")}<span class="ft-vs">vs</span>${side("b")}</div>
      ${(p.schedule || []).length && !onCard ? `<div class="ft-sched">${p.schedule.map(sg => `<span><b>${esc(sg.segment)}</b>${new Date(sg.start).toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit"})}${sg.tv && sg.tv.length ? " · " + esc(sg.tv.join(", ")) : ""}</span>`).join("")}</div>` : ""}
      <p class="ft-leg">${m.hidden ? "Our number on this fight is for members." : "Big number: our chance. Line: the sportsbook's, with their cut taken out."}</p>
      <div class="ft-act">${onCard ? "" : `<a class="btn" href="#/card">All ${p.fights.length} fights</a>`}<a class="pill" href="#/fight/0">Breakdown of the main event</a></div>
    </div>`;
}

function feature(p, up) {
  const start = (up || []).find(u => u.date === p.date)?.start || p.fights[0].start;
  const ours = p.fights.filter(f => f.our_pick);
  const pickRow = f => { const o = f.our_pick === f.a ? f.odds_a : f.odds_b, opp = f.our_pick === f.a ? f.b : f.a;
    const done = f.state === "post" && f.result && f.result.winner, res = done ? (f.result.winner === f.our_pick ? "won" : "lost") : "";
    return `<a class="ft-pk ${res}" href="#/card"><span class="pk-n"><b>${esc(f.our_pick)}</b><small>vs ${esc(opp)}</small></span>
      <span class="pk-o"><b>${odds(o)}</b><small>${f.stake ? f.stake + "u" : ""}</small></span>${res ? `<span class="pk-r">${res === "won" ? "W" : "L"}</span>` : ""}
      ${f.take ? `<span class="pk-t">“${esc(f.take)}”</span>` : ""}</a>`; };
  const locked = p.gated && p.locked_count ? `<a class="ft-pk lock" href="#/pricing">${lockIcon}<span class="pk-n"><b>${p.locked_count} more pick${p.locked_count > 1 ? "s" : ""}</b><small>for members</small></span></a>` : "";
  return `<section class="feat">
${featMain(p, start)}
    <aside class="ft-side">
      <div class="ft-sh"><h2>This week's picks</h2>${p.updated ? `<small>Lines as of ${esc(updatedAt(p.updated))}</small>` : ""}</div>
      ${p.take_preview ? `<p class="ft-prev">${esc(p.take_preview)} <span>— Jono</span></p>` : ""}
      ${picksStrip(p)}
      <a class="ft-more" href="#/card">Full card and every number →</a>
    </aside>
  </section>`;
}
// one line of proof under the lead, instead of a row of stat cards
function proofLine(mr, L) {
  if (!mr || !mr.since) return "";
  const s = mr.since, yr = mr.years && mr.years[0];
  const lu = L && L.fights ? L.our_units : null;
  return `<div class="proofline">
    <p>Every pick goes up before the fight and gets graded after it, win or lose.</p>
    <div class="pl-s">
      <span><small>Since ${mr.from || 2020}</small><b>${s.our_won}-${s.our_bets - s.our_won}</b><em class="${s.our_units >= 0 ? "won" : "lost"}">${units(s.our_units)}</em></span>
      ${yr ? `<span><small>Winners picked, ${esc(yr.year)}</small><b>${yr.pct}%</b></span>` : ""}
      <a href="#/record">Full record →</a>
    </div></div>`;
}
function whyEdge() {
  return `<section class="why-edge"><h2>Why ${METHOD} is different</h2>
    <div class="we-g">
      <div><b>Math, not opinions</b><p>Every UFC fight since 2010 feeds one rating per fighter. No votes, no hype, no narratives.</p></div>
      <div><b>Who you beat matters</b><p>Finishing a champion moves a rating far more than a split decision over a newcomer. How you win and who you beat both count.</p></div>
      <div><b>Priced against the line</b><p>We only call a pick when our chance beats the sportsbook's by enough to matter. Most fights get no pick.</p></div>
    </div><a class="we-more" href="#/how">How it works →</a></section>`;
}
// the three plans on the home page, compact; each opens the Pricing page
function homePlans() {
  if (!PLANS || !PLANS.plans) return "";
  const cards = [{id: "free", name: "Free", price: 0, tagline: "See how every fight rates.", features: PLANS.free}, ...PLANS.plans];
  return `<section class="hplans"><div class="hp-h"><h2>Pick your plan</h2><a href="#/pricing">Compare plans →</a></div>
    <div class="hp-g">${cards.map(pl => `<a class="hp-c${pl.best ? " best" : ""}" href="#/pricing">${pl.best ? `<span class="plan-flag">Best value</span>` : ""}
      <h3>${esc(pl.name)}</h3><div class="plan-price">${pl.price ? `<b>$${pl.price}</b><span>/ ${esc(pl.period)}</span>` : `<b>$0</b>`}</div>
      <p class="plan-tag">${esc(pl.tagline)}</p><ul>${pl.features.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      <span class="${pl.best ? "btn" : "pill"} hp-cta">${pl.id === "free" ? "What's free" : "See " + esc(pl.name)}</span></a>`).join("")}</div></section>`;
}
function closingCta(mr) {
  const s = mr && mr.since;
  return `<section class="close-cta"><div><h2>Stop guessing. <em>Start betting the edge.</em></h2>
    <p>${s ? `Our picks: ${s.our_won}-${s.our_bets - s.our_won} since ${mr.from || 2020}, <b class="won">${units(s.our_units)}</b>. ` : ""}Each week's picks go up before the first fight.</p></div>
    <div class="cc-b"><a class="btn" href="${paywallOn() && myPlan() === "free" ? "#/pricing" : "#/card"}">Get this week's picks</a></div></section>`;
}
function newsletterBox() {
  const n = PLANS && PLANS.newsletter;
  if (!n || !n.username) return "";
  const action = n.provider === "kit" ? n.form_url : `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(n.username)}`;
  return `<section class="nl"><div><b>Get the picks by email</b><span>The week's picks and my preview, the day lines settle. Free, unsubscribe anytime.</span></div>
    <form action="${esc(action)}" method="post" target="_blank" class="nl-f"><label class="sr" for="nl-e">Email</label>
      <input id="nl-e" type="email" name="email" placeholder="you@email.com" required autocomplete="email"><button class="btn" type="submit">Sign up</button></form></section>`;
}
// a square results image for one past card, from the locked ledger
async function shareResultsImage(slug) {
  const [e, L, mr] = await Promise.all([get(`events/${slug}.json`), get("ledger.json", true), get("model_record.json")]);
  if (!e || !L || !L.rows) return;
  const rows = L.rows.filter(g => g.date === e.date && g.our_pick);
  if (!rows.length) return;
  const upto = L.rows.filter(g => g.date <= e.date && g.our_pick && g.winner), won = upto.filter(g => g.winner === g.our_pick).length;
  const cardU = Math.round(100 * rows.reduce((s, g) => s + (g.our_staked_units || 0), 0)) / 100, cw = rows.filter(g => g.winner === g.our_pick).length;
  const totU = Math.round(100 * upto.reduce((s, g) => s + (g.our_units || 0), 0)) / 100;
  await drawShare({
    file: `octagon-edge-results-${e.date}.png`, kicker: `${String(e.name).split(/:\s*/).at(-1)} · ${new Date(e.date + "T12:00:00").toLocaleDateString(undefined, {month: "short", day: "numeric"})}`,
    title: "RESULTS", sub: `Our picks ${cw}-${rows.length - cw}  ${units(cardU)}`, subNote: "at our suggested stakes", subColor: cardU >= 0 ? "#3dbe6c" : "#e5484d",
    rows: rows.map(g => ({name: g.our_pick, opp: `vs ${g.our_pick === g.a ? g.b : g.a} · ${odds(g.our_odds)}`, right: units(g.our_staked_units),
      rightSub: g.stake ? g.stake + "u" : "", res: !g.winner ? null : g.winner === g.our_pick ? "W" : "L"})),
    ...sinceRec(mr), tag: "Fight picks with an edge"});
}
window.shareResultsImage = shareResultsImage;
// share images' footer: this year's record (what people follow), falling back to the full record
const sinceRec = mr => { const y = mr && mr.years && mr.years[0], s = y && y.our_bets ? y : mr && mr.since;
  return s ? {recLabel: y && y.our_bets ? `${y.year} record` : `Since ${mr.from || 2020}`, rec: `${s.our_won}-${s.our_bets - s.our_won}`, recU: s.our_units} : {recLabel: "Record"}; };
async function drawShare(o) {
  try { await document.fonts.load('800 60px "Big Shoulders Display"'); await document.fonts.load('500 30px "Barlow"'); } catch (e) {}
  const S = 1080, c = document.createElement("canvas"); c.width = S; c.height = S; const x = c.getContext("2d");
  const D = w => `${w} "Big Shoulders Display", "Barlow Condensed", sans-serif`, B = w => `${w} "Barlow", sans-serif`, gold = "#d9a91a";
  x.fillStyle = "#111215"; x.fillRect(0, 0, S, S); x.fillStyle = gold; x.fillRect(0, 0, 12, S);
  x.save(); x.translate(80, 74); x.scale(1.5, 1.5);
  const oct = (r, cx, cy) => { x.beginPath(); for (let i = 0; i < 8; i++) { const an = Math.PI / 8 + i * Math.PI / 4; x.lineTo(cx + r * Math.cos(an), cy + r * Math.sin(an)); } x.closePath(); };
  oct(26, 24, 24); x.fillStyle = gold; x.fill(); oct(20, 24, 24); x.fillStyle = "#111215"; x.fill();
  x.strokeStyle = "#fff"; x.lineWidth = 4.5; x.beginPath(); x.moveTo(14, 30); x.lineTo(24, 17); x.lineTo(34, 30); x.stroke();
  x.strokeStyle = gold; x.lineWidth = 3.5; x.beginPath(); x.moveTo(19, 34); x.lineTo(29, 34); x.stroke(); x.restore();
  x.fillStyle = gold; x.font = D("700 26px"); x.fillText("O C T A G O N", 172, 104); x.fillStyle = "#fff"; x.font = D("900 58px"); x.fillText("EDGE", 170, 152);
  x.fillStyle = "#9a9ea8"; x.font = B("600 30px"); x.fillText(o.kicker, 80, 262);
  x.fillStyle = "#fff"; x.font = D("900 88px"); x.fillText(o.title, 80, 350);
  x.fillStyle = o.subColor || gold; x.font = D("800 44px"); x.fillText(o.sub, 80, 404);
  if (o.subNote) { const sw = x.measureText(o.sub).width; x.fillStyle = "#9a9ea8"; x.font = B("500 24px"); x.fillText(o.subNote, 80 + sw + 18, 402); }
  const rows = o.rows.slice(0, 10);
  if (rows.length > 4) {   // many picks: one line each, sized to fit
    const rowH = Math.min(72, Math.floor(440 / rows.length)), fs = Math.min(40, rowH - 18);
    let y = 470;
    for (const r of rows) {
      const col = r.res === "W" ? "#3dbe6c" : r.res === "L" ? "#e5484d" : gold, h = rowH - 8, mid = y + h / 2;
      x.fillStyle = "#1a1b20"; x.fillRect(80, y, S - 160, h); x.fillStyle = col; x.fillRect(80, y, 6, h);
      let nx = 104;
      if (r.res) { const bx = Math.min(36, h - 10); x.fillStyle = col; x.fillRect(nx, mid - bx / 2, bx, bx); x.fillStyle = r.res === "W" ? "#0d1a12" : "#fff"; x.font = D(`900 ${Math.round(bx * .72)}px`); x.textAlign = "center"; x.fillText(r.res, nx + bx / 2, mid + bx * .26); x.textAlign = "left"; nx += bx + 16; }
      x.fillStyle = "#fff"; x.font = D(`800 ${fs}px`); const nm = String(r.name).toUpperCase(); x.fillText(nm, nx, mid + fs * .35);
      const nw = x.measureText(nm).width; x.fillStyle = "#9a9ea8"; x.font = B(`500 ${Math.round(fs * .55)}px`); x.fillText(r.opp.replace(/^vs [^·]+· /, ""), nx + nw + 14, mid + fs * .3);
      x.textAlign = "right"; x.fillStyle = r.res ? col : "#fff"; x.font = D(`800 ${fs}px`); x.fillText(r.right, S - 104, mid + fs * .35); x.textAlign = "left";
      y += rowH;
    }
  } else {
  const rowH = rows.length <= 2 ? 120 : 100, big = rowH > 90;
  let y = 480;
  for (const r of rows) {
    const col = r.res === "W" ? "#3dbe6c" : r.res === "L" ? "#e5484d" : gold;
    x.fillStyle = "#1a1b20"; x.fillRect(80, y, S - 160, rowH - 12); x.fillStyle = col; x.fillRect(80, y, 6, rowH - 12);
    let nx = 108;
    if (r.res) { x.fillStyle = col; x.fillRect(nx, y + (rowH - 12) / 2 - 22, 44, 44); x.fillStyle = r.res === "W" ? "#0d1a12" : "#fff"; x.font = D("900 32px"); x.textAlign = "center"; x.fillText(r.res, nx + 22, y + (rowH - 12) / 2 + 11); x.textAlign = "left"; nx += 62; }
    x.fillStyle = "#fff"; x.font = D(`800 ${big ? 48 : 40}px`); x.fillText(String(r.name).toUpperCase(), nx, y + (big ? 52 : 44));
    x.fillStyle = "#9a9ea8"; x.font = B("500 24px"); x.fillText(r.opp, nx + 2, y + (big ? 80 : 68));
    x.textAlign = "right"; x.fillStyle = r.res ? col : "#fff"; x.font = D(`800 ${big ? 52 : 44}px`); x.fillText(r.right, S - 104, y + (big ? 54 : 46));
    x.fillStyle = "#9a9ea8"; x.font = B("600 24px"); x.fillText(r.rightSub || "", S - 104, y + (big ? 80 : 68)); x.textAlign = "left";
    y += rowH;
  }
  }
  x.fillStyle = "#26282e"; x.fillRect(80, S - 150, S - 160, 2);
  x.fillStyle = "#9a9ea8"; x.font = B("600 26px"); x.fillText(o.recLabel || "Record", 80, S - 96);
  if (o.rec) { const lw = x.measureText(o.recLabel || "Record").width + 100; x.fillStyle = "#fff"; x.font = D("800 46px"); x.fillText(o.rec, lw, S - 92);
    const w = x.measureText(o.rec).width; x.fillStyle = o.recU >= 0 ? "#3dbe6c" : "#e5484d"; x.font = D("800 36px"); x.fillText(units(o.recU), lw + 20 + w, S - 92);
    const w2 = x.measureText(units(o.recU)).width; x.fillStyle = "#9a9ea8"; x.font = B("500 20px"); x.fillText("flat 1u", lw + 30 + w + w2, S - 94); }
  x.textAlign = "right"; x.fillStyle = gold; x.font = B("700 24px"); x.fillText(o.tag, S - 80, S - 96); x.textAlign = "left";
  c.toBlob(b => { const u = URL.createObjectURL(b), el = document.createElement("a"); el.href = u; el.download = o.file; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }, "image/png");
}
// a square image of this week's picks, ready to post (drawn on a canvas with the site's fonts)
async function sharePicksImage() {
  const [p, L, mr] = await Promise.all([getPred(), get("ledger.json", true), get("model_record.json")]);
  const ours = p ? p.fights.filter(f => f.our_pick) : [];
  if (!ours.length) return;
  try { await document.fonts.load('800 60px "Big Shoulders Display"'); await document.fonts.load('500 30px "Barlow"'); } catch (e) {}
  const S = 1080, c = document.createElement("canvas"); c.width = S; c.height = S; const x = c.getContext("2d");
  const D = w => `${w} "Big Shoulders Display", "Barlow Condensed", sans-serif`, B = w => `${w} "Barlow", sans-serif`, gold = "#d9a91a";
  x.fillStyle = "#111215"; x.fillRect(0, 0, S, S); x.fillStyle = gold; x.fillRect(0, 0, 12, S);
  // brand
  x.save(); x.translate(80, 74); x.scale(1.5, 1.5);
  const oct = (r, cx, cy) => { x.beginPath(); for (let i = 0; i < 8; i++) { const an = Math.PI / 8 + i * Math.PI / 4; x.lineTo(cx + r * Math.cos(an), cy + r * Math.sin(an)); } x.closePath(); };
  oct(26, 24, 24); x.fillStyle = gold; x.fill(); oct(20, 24, 24); x.fillStyle = "#111215"; x.fill();
  x.strokeStyle = "#fff"; x.lineWidth = 4.5; x.beginPath(); x.moveTo(14, 30); x.lineTo(24, 17); x.lineTo(34, 30); x.stroke();
  x.strokeStyle = gold; x.lineWidth = 3.5; x.beginPath(); x.moveTo(19, 34); x.lineTo(29, 34); x.stroke(); x.restore();
  x.fillStyle = gold; x.font = D("700 26px"); x.fillText("O C T A G O N", 172, 104); x.fillStyle = "#fff"; x.font = D("900 58px"); x.fillText("EDGE", 170, 152);
  // title
  const [ev, sub] = String(p.event).split(/:\s*/);
  x.fillStyle = "#9a9ea8"; x.font = B("600 30px"); x.fillText(`${ev} · ${new Date(p.date + "T12:00:00").toLocaleDateString(undefined, {weekday: "short", month: "short", day: "numeric"})}`, 80, 262);
  x.fillStyle = "#fff"; x.font = D("900 88px"); x.fillText("OUR PICKS", 80, 350);
  x.fillStyle = gold; x.font = D("800 44px"); x.fillText(String(sub || "").toUpperCase(), 80, 404);
  // early or final: an early pick can still be dropped if the line moves against it
  const live = p.fights.some(f => f.state && f.state !== "pre"), fin = CARD_FINAL || live;
  { const sw = x.measureText(String(sub || "").toUpperCase()).width, lab = fin ? "FINAL PICKS" : "EARLY PICKS";
    x.font = D("800 22px"); const lw = x.measureText(lab).width + 24, bx = 80 + sw + 22, by = 374;
    if (fin) { x.fillStyle = "#3dbe6c"; x.fillRect(bx, by, lw, 34); x.fillStyle = "#0d1a12"; }
    else { x.strokeStyle = gold; x.lineWidth = 2; x.setLineDash([6, 4]); x.strokeRect(bx, by, lw, 34); x.setLineDash([]); x.fillStyle = gold; }
    x.fillText(lab, bx + 12, by + 25); }
  // picks
  let y = 470; const rows = ours.slice(0, 6), rowH = rows.length > 4 ? 82 : rows.length <= 3 ? 136 : 100, big = rowH > 90;
  for (const f of rows) {
    const o = f.our_pick === f.a ? f.odds_a : f.odds_b, opp = f.our_pick === f.a ? f.b : f.a, isA = f.our_pick === f.a;
    const us = f.p_a == null ? null : Math.round(100 * (isA ? f.p_a : 1 - f.p_a)), ln = f.market_p_a == null ? null : Math.round(100 * (isA ? f.market_p_a : 1 - f.market_p_a));
    x.fillStyle = "#1a1b20"; x.fillRect(80, y, S - 160, rowH - 14); x.fillStyle = gold; x.fillRect(80, y, 6, rowH - 14);
    x.fillStyle = "#fff"; x.font = D(`800 ${big ? 48 : 40}px`); x.fillText(String(f.our_pick).toUpperCase(), 108, y + (big ? 52 : 44));
    x.fillStyle = "#9a9ea8"; x.font = B("500 24px"); x.fillText(`vs ${opp}`, 110, y + (big ? 80 : 68));
    if (big && us != null && ln != null) { x.fillStyle = gold; x.font = B("600 22px"); x.fillText(`We say ${us}%. The line says ${ln}%.`, 110, y + 110); }
    x.textAlign = "right"; x.fillStyle = "#fff"; x.font = D(`800 ${big ? 52 : 44}px`); x.fillText(odds(o), S - 104, y + (big ? 54 : 46));
    x.fillStyle = "#9a9ea8"; x.font = B("600 24px"); x.fillText(f.stake ? f.stake + "u" : "", S - 104, y + (big ? 84 : 68)); x.textAlign = "left";
    y += rowH;
  }
  // record
  x.fillStyle = "#26282e"; x.fillRect(80, S - 150, S - 160, 2);
  const sr = sinceRec(mr);
  x.fillStyle = "#9a9ea8"; x.font = B("600 26px"); x.fillText(sr.recLabel, 80, S - 96);
  if (sr.rec) { const lw = x.measureText(sr.recLabel).width + 100; x.fillStyle = "#fff"; x.font = D("800 46px"); x.fillText(sr.rec, lw, S - 92);
    const w = x.measureText(sr.rec).width; x.fillStyle = sr.recU >= 0 ? "#3dbe6c" : "#e5484d"; x.font = D("800 36px"); x.fillText(units(sr.recU), lw + 20 + w, S - 92);
    const w2 = x.measureText(units(sr.recU)).width; x.fillStyle = "#9a9ea8"; x.font = B("500 20px"); x.fillText("flat 1u", lw + 30 + w + w2, S - 94); }
  x.textAlign = "right"; x.fillStyle = gold; x.font = B("700 24px"); x.fillText("Fight picks with an edge", S - 80, S - 96); x.textAlign = "left";
  c.toBlob(b => { const u = URL.createObjectURL(b), el = document.createElement("a"); el.href = u; el.download = `octagon-edge-picks-${p.date}.png`; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }, "image/png");
}
window.sharePicksImage = sharePicksImage;
// whole fight boxes open the fight analysis; links, buttons and toggles inside them still do their own thing
document.addEventListener("click", e => {
  const box = e.target.closest(".bout.tap[data-href]"); if (!box) return;
  if (e.target.closest("a, button, summary, details, input, select, label, .howq")) return;
  if (String(window.getSelection && window.getSelection()).trim()) return;   // selecting text, not opening
  location.hash = box.dataset.href.replace(/^#/, "");
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || !e.target.matches || !e.target.matches(".bout.tap[data-href]")) return;
  location.hash = e.target.dataset.href.replace(/^#/, "");
});
async function viewHome() {
  const [p, ev, ex, up] = await Promise.all([getPred(), get("events/index.json"), get("experts.json"), get("upcoming.json")]);
  let hero = `<div class="empty">The next card appears here as soon as it's announced.</div>`, picksH = "";
  if (p && p.fights.length && liveOn(p)) {
    hero = liveCenter(p); picksH = `<h2>${kick("This week", "gold")}Our picks</h2>${picksStrip(p)}`;
    clearTimeout(window.refresh); window.refresh = setTimeout(route, 120000);
  } else if (p && p.fights.length) {
    hero = "FEATURE";
  } else if (false) {
    const m = p.fights[0], start = (up || []).find(u => u.date === p.date)?.start || m.start;
    hero = `<section class="hero">
      <div class="when">${kick("Next card", "red")}${dateLong(p.date)}${start ? ` · <b>${countdown(start)}</b>` : ""}</div>
      <h2 class="hero-t">${esc(p.event)}</h2>
      <div class="faceoff">
        <a href="#/fighter/${esc(m.a_slug)}">${portrait(m.a_id, m.a, "hero-pt")}<span class="n">${esc(m.a)}</span>${rankOf(m.a_slug)}${flagOf(m.a_slug, true)}<span class="pc a">${m.hidden ? lockIcon : pct(m.p_a)}</span><span class="ln">Line ${m.market_p_a != null ? pct(m.market_p_a) + " · " + odds(m.odds_a) : "not posted"}</span></a>
        <span class="vs">VS</span>
        <a href="#/fighter/${esc(m.b_slug)}">${portrait(m.b_id, m.b, "hero-pt")}<span class="n">${esc(m.b)}</span>${rankOf(m.b_slug)}${flagOf(m.b_slug, true)}<span class="pc b">${m.hidden ? lockIcon : (100 - Math.round(100 * m.p_a)) + "%"}</span><span class="ln">Line ${m.market_p_a != null ? (100 - Math.round(100 * m.market_p_a)) + "%" + " · " + odds(m.odds_b) : "not posted"}</span></a>
      </div>
      ${(p.schedule || []).length ? `<div class="tvsched">${p.schedule.map(sg => `<div class="tv"><b>${esc(sg.segment)}</b><span>${new Date(sg.start).toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short"})}</span><small>${sg.bouts} fight${sg.bouts > 1 ? "s" : ""}${sg.tv && sg.tv.length ? " · " + esc(sg.tv.join(", ")) : ""}</small></div>`).join("")}</div>` : ""}
      <div class="legendline">${m.hidden ? `Our chance on this fight is for members. <a href="#/pricing">See plans</a>` : "Big number: our chance. Line: the betting line's chance with the bookmaker's cut removed, and the moneyline."}</div>
      <a class="btn" href="#/card">See all ${p.fights.length} bouts, picks and expert splits</a>
    </section>`;
    picksH = `<h2>${kick("This week", "gold")}Our picks</h2>${picksStrip(p)}`;
  }
  const past = (ev || []).slice(0, 6).map(e => `<li><a href="#/event/${esc(e.slug)}"><span class="d">${esc(e.date)}</span>${esc(e.name)}</a>
    <span class="small">${recLine(e.record)}</span></li>`).join("");
  const top = ex ? ex.analysts.slice(0, 3).map((a, i) => `<li><span class="rk">${i + 1}</span>${esc(a.analyst)}<span class="small">${a.win_pct}% · ${a.won}-${a.bets - a.won} · ${a.roi_pct > 0 ? "+" : ""}${a.roi_pct}% per bet</span></li>`).join("") : "";
  const mr = await get("model_record.json");
  const yr = mr && mr.years[0], box = (label, r) => !r ? "" : `<div class="stat key"><b>${r.our_won}/${r.our_bets} <span class="sub ${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)} (${r.our_roi_pct > 0 ? "+" : ""}${r.our_roi_pct}%)</span></b><span>${label}: our picks, ${r.our_pct}% won${r.our_risked ? `. Suggested stakes: <b class="${r.our_staked_units >= 0 ? "won" : "lost"}">${units(r.our_staked_units)} (${r.our_staked_units >= 0 ? "+" : ""}${(100 * r.our_staked_units / r.our_risked).toFixed(1)}%)</b> on ${r.our_risked}u risked` : ""}</span></div>
    <div class="stat model"><b>${r.pct}%</b><span>${label}: winners picked (${r.right}/${r.picks})</span></div>
    <div class="stat model"><b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b><span>${label}: betting every model winner</span></div>
    <div class="stat value"><b class="${r.value_units >= 0 ? "won" : "lost"}">${units(r.value_units)}</b><span>${label}: value picks (${r.value_won}/${r.value_bets})</span></div>`;
  const L = await get("ledger.json", true), recap = p && liveOn(p) ? "" : await lastCard(ev);
  const firstStart = p && L && p.date === L.from ? ((p.schedule || [])[0] || {}).start || (p.fights[0] || {}).start : null;
  const live = "", record = "";
  if (hero === "FEATURE") return `${proofBand(mr, L)}${feature(p, up)}${recap}${whyEdge()}${newsletterBox()}
    <div class="home2">${homeLower(ev, ex, up, p)}</div>${closingCta(mr)}${homePlans()}`;
  return `${proofBand(mr, L)}${recap}${hero}
    <div class="homegrid"><div class="hg-main">${picksH}${record}</div>${homeLower(ev, ex, up, p)}</div>`;
}

// the lower half of the home page: recent cards, coming up, top analysts
function homeLower(ev, ex, up, p) {
  const recent = (ev || []).slice(0, 5).map(e => { const r = e.record || {}, u = r.our_staked ?? r.our_units;
    const [t1, t2] = String(e.name).split(/:\s*/);
    const ids = e.main_ids || [];
    return `<a class="rc-mini" href="#/event/${esc(e.slug)}"><span class="ev-ph">${photo(ids[0], e.main_a || "", "sm")}${photo(ids[1], e.main_b || "", "sm")}</span><span class="rcm-t"><b>${esc(t2 || t1)}</b><small>${esc(e.date)} · model ${r.right ?? "–"}/${r.picks ?? "–"}</small></span>
      ${r.our_bets ? `<span class="rcm-u ${u >= 0 ? "won" : "lost"}"><b>${units(u)}</b><small>picks ${r.our_won}/${r.our_bets}</small></span>` : ""}</a>`; }).join("");
  const next = (up || []).filter(u => !p || u.date !== p.date).slice(0, 4).map(u => {
    const [title, sub] = String(u.name).split(/:\s*/);
    const d = new Date(u.start || u.date + "T12:00:00");
    return `<li class="nx"><span class="nx-d"><b>${d.toLocaleDateString(undefined, {day: "numeric"})}</b><span>${d.toLocaleDateString(undefined, {month: "short"})}</span></span>
      ${u.main_ids ? `<span class="ev-ph">${photo(u.main_ids[0], u.main_a || "", "sm")}${photo(u.main_ids[1], u.main_b || "", "sm")}</span>` : ""}
      <span class="nx-t"><b>${esc(sub || title)}</b><span>${esc(title)}${u.start ? ", " + d.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}) : ""}</span></span></li>`;
  }).join("");
  const maxU = ex ? Math.max(1, ...ex.analysts.slice(0, 5).map(a => Math.abs(a.units))) : 1;
  const top = ex ? ex.analysts.slice(0, 5).map((a, i) => `<li class="ta">
      <span class="ta-rk">${i + 1}</span>
      <span class="ta-nm"><b>${esc(a.analyst)}</b><span>${a.won}-${a.bets - a.won}, ${a.win_pct}% won</span></span>
      <span class="ta-u"><b class="${a.units >= 0 ? "won" : "lost"}">${units(a.units)}</b><span class="ub"><i class="${a.units >= 0 ? "pos" : "neg"}" style="width:${Math.abs(a.units) / maxU * 100}%"></i></span></span></li>`).join("") : "";
  return `<aside class="hg-side">
      ${next ? `<section class="panel"><div class="lw-h"><h2>${kick("Schedule")}Coming up</h2><a href="#/events">Schedule</a></div><ul class="nxl">${next}</ul></section>` : ""}
      <section class="panel"><div class="lw-h"><h2>${kick("Results")}Recent cards</h2><a href="#/events">All events</a></div><div class="rcm-list">${recent}</div></section>
    </aside>`;
}

// ---------------- events ----------------
const RECENT_FROM = "2020";   // the official record starts here; older cards are kept for histories and ratings
async function viewEvents(q) {
  const [ev, up, mr] = await Promise.all([get("events/index.json"), get("upcoming.json"), get("model_record.json")]);
  const years = [...new Set((ev || []).map(e => e.date.slice(0, 4)))].filter(y => y >= RECENT_FROM);
  const year = q.get("year") || (years.sort().at(-1) || "");
  const keep = e => year === "all" ? true : year === "older" ? e.date < RECENT_FROM : year && year !== "since" ? e.date.startsWith(year) : e.date >= RECENT_FROM;
  const list = (ev || []).filter(keep);
  const upcoming = (up || []).map((u, i) => {
    const [title, sub] = String(u.name).split(/:\s*/), d = new Date(u.start || u.date + "T12:00:00");
    const inner = `<span class="nx-d"><b>${d.toLocaleDateString(undefined, {day: "numeric"})}</b><span>${d.toLocaleDateString(undefined, {month: "short"})}</span></span>
      ${u.main_ids ? `<span class="ev-ph">${photo(u.main_ids[0], u.main_a || "", "md")}${photo(u.main_ids[1], u.main_b || "", "md")}</span>` : ""}
      <span class="nx-t"><b>${esc(sub || title)}</b><span>${esc(title)}${u.start ? ", " + d.toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit"}) : ""}${i === 0 ? " · picks are up" : ""}</span></span>`;
    return i === 0 ? `<li class="nx"><a class="nx-a" href="#/card">${inner}</a></li>` : `<li class="nx">${inner}</li>`;
  }).join("");
  const chip = (y, label) => `<a href="#/events?year=${y || "since"}" class="${y === year || (!y && year === "since") ? "on" : ""}">${label}</a>`;
  return `<h1>Events</h1>
    ${upcoming ? `<h2>Upcoming</h2><ul class="nxl panel">${upcoming}</ul>` : ""}
    <h2>Past cards</h2>
    ${eventsSummary(mr, year)}
    <div class="filters">${[...years].sort().reverse().map(y => chip(y, y)).join("")}${chip("", "Since " + RECENT_FROM)}${chip("older", "Before " + RECENT_FROM)}${chip("all", "All")}</div>
    ${year === "older" ? `<p class="note">Cards before ${RECENT_FROM} are kept for fighter histories, ratings and training, but aren't part of the record: the model had too little history behind it then to grade it fairly.</p>` : ""}
    <div class="evlist">${list.map(e => evRow(e)).join("")}</div>`;
}

function evRow(e) {
  const r = e.record || {}, graded = e.date >= RECENT_FROM && r.picks;
  const ids = e.main_ids || [];
  const [title, sub] = String(e.name).split(/:\s*/);
  const u = r.our_staked ?? r.our_units, d = new Date(e.date + "T12:00:00");
  const cell = (v, l, cls) => `<span class="ev-c"><b class="${cls || ""}">${v}</b><small>${l}</small></span>`;
  return `<a class="evrow2" href="#/event/${esc(e.slug)}">
    <span class="ev-date"><b>${d.toLocaleDateString(undefined, {day: "numeric"})}</b><small>${d.toLocaleDateString(undefined, {month: "short"})}</small></span>
    <span class="ev-ph">${photo(ids[0], e.main_a || "", "md")}${photo(ids[1], e.main_b || "", "md")}</span>
    <span class="ev-t"><small>${esc(title)}</small><b>${sub ? esc(sub) : esc(e.main || "")}</b><span>${e.location ? esc(e.location) : ""}</span></span>
    ${graded ? `<span class="ev-cells">
      ${r.our_bets ? cell(units(u), `our picks ${r.our_won}-${r.our_bets - r.our_won}`, u >= 0 ? "won" : "lost") : cell("–", "no picks")}
      ${cell(`${r.right}/${r.picks}`, "model winners")}
      ${r.value_bets ? cell(units(r.value_units), `value ${r.value_won}-${r.value_bets - r.value_won}`, r.value_units >= 0 ? "won" : "lost") : ""}
    </span>` : `<span class="ev-cells"><span class="ev-c"><small>Before ${RECENT_FROM}: not graded</small></span></span>`}
    <span class="ev-go">→</span>
  </a>`;
}

function cardBadge(r, date) {
  if (!r || !r.picks || (date && date < RECENT_FROM)) return "";
  return `<span class="cbadge"><b>${r.right}/${r.picks}</b> correct · <b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b>${
    r.our_bets ? ` · our picks ${r.our_won}/${r.our_bets} <b class="${(r.our_staked ?? r.our_units) >= 0 ? "won" : "lost"}">${units(r.our_staked ?? r.our_units)}</b>` : ""}</span>`;
}

function eventsSummary(mr, year) {
  if (!mr) return "";
  const r = year === "all" ? mr.all : year === "older" ? null : year ? mr.years.find(y => y.year === year) : (mr.since || mr.all);
  if (!r) return "";
  const label = year === "all" || !year || year === "since" ? "Since " + RECENT_FROM : year;
  const roi = x => `${x > 0 ? "+" : ""}${x}% per bet`;
  const grp = (k, title, big, bigCls, line1, line2) => `<div class="es-g ${k}"><span class="es-k">${title}</span>
    <b class="${bigCls || ""}">${big}</b><span>${line1}</span>${line2 ? `<span>${line2}</span>` : ""}</div>`;
  return `<div class="es">
    ${(() => { const su = r.our_staked_units ?? r.our_units, rk = r.our_risked ? Math.round(1000 * su / r.our_risked) / 10 : null;   // suggested stakes, like each card below
      return grp("our", "Our picks", r.our_bets ? units(su) : "–", su >= 0 ? "won" : "lost", r.our_bets ? `${r.our_won}-${r.our_bets - r.our_won} won, ${r.our_pct}%` : "No picks",
        r.our_bets ? `At suggested stakes${rk != null ? `, ${rk > 0 ? "+" : ""}${rk.toFixed(1)}% per unit risked` : ""}` : ""); })()}
    ${grp("model", "Model winners", `${r.pct}%`, "", `${r.right.toLocaleString()} of ${r.picks.toLocaleString()} fights`, `Betting each: <span class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</span>`)}
    ${grp("value", "Value picks", r.value_bets ? units(r.value_units) : "–", r.value_units >= 0 ? "won" : "lost", r.value_bets ? `${r.value_won}-${r.value_bets - r.value_won} won` : "No value picks", r.value_bets ? roi(r.value_roi_pct) : "")}
  </div>
`;
}

async function viewEvent(s) {
  const [e] = await Promise.all([get(`events/${s}.json`), loadGrap()]);
  if (!e) return `<h1>Card not found</h1><div class="empty">That card isn't in the history. <a href="#/events">See all events</a></div>`;
  const rows = e.bouts.map((b, i) => {
    const won = b.winner === "a" ? b.a : b.winner === "b" ? b.b : null;
    const mp = b.model_pick, vp = b.value_pick;
    const call = !mp ? "" : `${tierTag(mp.tier || tierOf(b.final_p_a), true)}<span class="tick ${mp.right ? "won" : "lost"}">Model${mp.lean ? " (expert lean)" : ""} ${mp.right ? "✓" : "✗"} ${mp.units != null ? units(mp.units) : ""}</span>`;
    const op = b.our_pick;
    const val = (b.expert_lean ? `<span class="lean">Expert lean: ${esc(b.expert_lean === "a" ? b.a : b.b)}</span>` : "")
      + (!op && b.passed ? `<span class="lean passed" title="The line moved more than 1 point against this side between open and close, so we passed.">Passed: line moved against ${esc(b.passed === "a" ? b.a : b.b)}</span>` : "") + (op ? `<span class="vpick ours ${op.right ? "won" : "lost"}">Our pick: ${esc(op.side === "a" ? b.a : b.b)} ${odds(op.odds)} ${op.right ? "✓" : "✗"} ${units(op.units)}</span>`
      : !vp ? "" : `<span class="vpick value ${vp.right ? "won" : "lost"}">Value pick: ${esc(vp.side === "a" ? b.a : b.b)} ${odds(vp.odds)} ${vp.right ? "✓" : "✗"} ${units(vp.units)}</span>`);
    const upset = won && b.line_p_a != null && ((b.winner === "a") !== (b.line_p_a > .5)) ? `<span class="news">Upset</span>` : "";
    const side = (n, sl, id, o, mp, w) => `<div class="side ${w ? "w" : ""}">${photo(id, n, "sm")}<div>${fighterLink(n, sl)}${w ? ` <b class="win">Winner</b>` : ""} ${grapChips(sl)}
      <div class="meta">${flagOf(sl, true)}${odds(o)}${mp != null ? ` · model ${pct(mp)}` : ""}</div></div></div>`;
    const graded = op || mp;   // our pick if we made one, otherwise the model's pick
    const ring = graded && graded.right != null ? (graded.right ? " ring-won" : " ring-lost") : "";
    return `<article data-href="${fightLink(i, s)}" tabindex="0" title="Open the fight analysis" class="bout slim tap${i === 0 ? " main" : ""}${ring}">
      <div class="status"><span class="final">${esc(b.weight_class)}</span>${b.finish ? `${esc(b.finish)}${b.round ? `, round ${b.round}` : ""}` : b.winner === "draw" ? "Draw" : b.winner === "nc" ? "No contest" : ""} ${call} ${val} ${upset}</div>
      <div class="pair">${side(b.a, b.a_slug, b.a_id, b.odds_a, b.model_p_a, b.winner === "a")}<span class="vs sm">VS</span>${side(b.b, b.b_slug, b.b_id, b.odds_b, b.model_p_a == null ? null : 1 - b.model_p_a, b.winner === "b")}</div>
      ${expertBar(b.experts, b.a, b.b, b.winner)}
    </article>`;
  }).join("");
  return `<p><a href="#/events">← All events</a></p><h1>${esc(e.name)}</h1>
    <p class="where">${dateLong(e.date)}${e.location ? ", " + esc(e.location) : ""}</p>
    ${e.record && e.record.locked && e.record.our_bets ? `<div class="share-row"><button class="pill" type="button" onclick="shareResultsImage('${esc(s)}')">Download results image</button><span>Square image of our picks and results on this card, for X and Instagram.</span></div>` : ""}
    ${e.record && e.record.picks ? `<div class="stats">
      <div class="stat"><b>${e.record.our_bets ? `${e.record.our_won}/${e.record.our_bets}` : "–"}</b><span>our picks won</span></div>
      <div class="stat"><b class="${(e.record.our_staked ?? e.record.our_units) >= 0 ? "won" : "lost"}">${e.record.our_bets ? units(e.record.our_staked ?? e.record.our_units) : "–"}</b><span>our picks, suggested stakes</span></div>
      <div class="stat"><b>${e.record.value_bets ? `${e.record.value_won}/${e.record.value_bets}` : "–"}</b><span>value picks won</span></div>
      <div class="stat"><b class="${e.record.value_units >= 0 ? "won" : "lost"}">${e.record.value_bets ? units(e.record.value_units) : "–"}</b><span>betting value picks, 1u</span></div>
      <div class="stat"><b>${e.record.right}/${e.record.picks}</b><span>model winners (${Math.round(e.record.right / e.record.picks * 100)}%), <span class="${e.record.units >= 0 ? "won" : "lost"}">${units(e.record.units)}</span> betting each</span></div>
      <div class="stat"><b>${e.favorites_right}/${e.record.picks}</b><span>betting favorites won</span></div></div>` : ""}
    ${rows}`;
}

// ---------------- fighters ----------------
async function viewFighters(q) {
  const idx = await get("fighters/index.json");
  if (!idx) return `<div class="empty">Fighter profiles appear after the next run.</div>`;
  const term = (q.get("q") || "").toLowerCase(), div = q.get("div") || "", favOnly = !!q.get("fav");
  const active = q.get("all") ? "" : new Date(Date.now() - 550 * 864e5).toISOString().slice(0, 10);
  const divs = [...new Set(idx.map(f => f.weight_class).filter(Boolean))].sort();
  const list = idx.filter(f => (!term || f.name.toLowerCase().includes(term)) && (!div || f.weight_class === div) && (favOnly ? !!FAV[f.slug] : term || !active || f.last_fight >= active));
  setTimeout(() => {
    const box = $("#fsearch");
    if (box) box.oninput = () => { location.hash = `#/fighters?q=${encodeURIComponent(box.value)}${div ? "&div=" + encodeURIComponent(div) : ""}`; };
  });
  return `<h1>Fighters</h1>
    <div class="filters"><input id="fsearch" type="search" placeholder="Search any fighter since 2010" value="${esc(q.get("q") || "")}" aria-label="Search fighters">
      <select onchange="location.hash='#/fighters?div='+encodeURIComponent(this.value)" aria-label="Division"><option value="">All divisions</option>${divs.map(d => `<option ${d === div ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      <a class="favbtn${favOnly ? " on" : ""}" href="#/fighters${favOnly ? "" : "?fav=1"}">★ Favorites${Object.keys(FAV).length ? ` (${Object.keys(FAV).length})` : ""}</a></div>
    <p class="note">${favOnly ? "Favorites." : term ? "" : "Active fighters, best first."}</p>
    <div class="grid">${list.slice(0, 120).map(f => `<a class="fcard" href="#/fighter/${esc(f.slug)}">${photo(f.espn_id, f.name, "md")}<div><b>${esc(f.name)}${champTag(f.slug)}${favStar(f.slug)}</b>
      <span class="small">${esc(f.record)} · ${esc(f.weight_class)}</span><span class="small">EDGE ${f.rating}</span></div></a>`).join("")}</div>
    ${list.length > 120 ? `<p class="note">Showing 120 of ${list.length}: search to narrow it down.</p>` : ""}`;
}

function ratingChart(h) {
  if (!h || h.length < 2) return "";
  const W = 640, H = 150, ys = h.map(x => x[1]), lo = Math.min(...ys) - 20, hi = Math.max(...ys) + 20;
  const t = d => new Date(d).getTime(), t0 = t(h[0][0]), t1 = Math.max(t(h.at(-1)[0]), t0 + 1);
  const X = d => 40 + (t(d) - t0) / (t1 - t0) * (W - 56), Y = v => 12 + (hi - v) / (hi - lo) * (H - 36);
  const d = h.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join("");
  return `<svg class="rchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rating from ${ys[0]} to ${ys.at(-1)}">
    <line x1="40" x2="${W - 16}" y1="${Y(1500)}" y2="${Y(1500)}" class="ref"/><text x="4" y="${Y(1500) + 4}">1500</text>
    <text x="4" y="${Y(hi - 20) + 4}">${hi - 20}</text><path d="${d}"/>
    ${h.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.5"/>`).join("")}
    <text x="40" y="${H - 4}">${h[0][0].slice(0, 4)}</text><text x="${W - 16}" y="${H - 4}" text-anchor="end">${h.at(-1)[0].slice(0, 4)}</text></svg>`;
}

// ---- fighter page: octagon style radar, badges, strengths and career highlights ----
function radarSvg(R, f) {
  const keys = Object.keys(R), n = keys.length, cx = 160, cy = 160, rad = 118;
  const pt = (i, r) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]; };
  const ring = r => keys.map((_, i) => pt(i, r).join(",")).join(" ");
  const poly = keys.map((k, i) => pt(i, rad * Math.max(6, R[k] ?? 0) / 100).join(",")).join(" ");
  const labels = keys.map((k, i) => { const [x, y] = pt(i, rad + 24), anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x}" y="${y + 4}" text-anchor="${anchor}" class="rl">${esc(k)}</text><text x="${x}" y="${y + 18}" text-anchor="${anchor}" class="rv">${R[k] == null ? "–" : R[k]}</text>`; }).join("");
  return `<div class="radar"><svg viewBox="-75 -10 470 350" role="img" aria-label="${esc(f.name)} style profile: ${keys.map(k => `${k} ${R[k] ?? "n/a"} percentile`).join(", ")}">
    ${[25, 50, 75, 100].map(p => `<polygon points="${ring(rad * p / 100)}" class="rg${p === 100 ? " outer" : ""}"/>`).join("")}
    ${keys.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, rad)[0]}" y2="${pt(i, rad)[1]}" class="ax"/>`).join("")}
    <polygon points="${poly}" class="shape"/>
    ${keys.map((k, i) => { const [x, y] = pt(i, rad * Math.max(6, R[k] ?? 0) / 100); return `<circle cx="${x}" cy="${y}" r="3.5" class="dot"/>`; }).join("")}
    ${labels}</svg><div class="radar-ph">${photo(f.espn_id, f.name, "md")}</div></div>`;
}
function fighterBadges(f) {
  const b = [], r = RANK[f.slug];
  if (r && r.rank === 0) b.push(["gold", `Champion · ${esc(r.div)}`]);
  else if (f.held_title) b.push(["gold2", "Former champion"]);
  if (f.streak >= 3) b.push(["green", `${f.streak}-fight win streak`]);
  const L = f.losses_by || {};
  if ((L.KO || 0) + (L.SUB || 0) + (L.DEC || 0) === 0 && (f.fights || []).length >= 3) b.push(["green", "Unbeaten in the UFC"]);
  if (f.finish_rate >= 0.7 && ((f.wins_by || {}).KO || 0) + ((f.wins_by || {}).SUB || 0) >= 4) b.push(["red", `Finisher · ${Math.round(100 * f.finish_rate)}% of wins`]);
  if (f.last_fight && (Date.now() - new Date(f.last_fight)) / 864e5 <= 183) b.push(["blue", "Recently active"]);
  else if (f.last_fight && (Date.now() - new Date(f.last_fight)) / 864e5 > 548) b.push(["grey", "Inactive 18+ months"]);
  if (f.title_fights) b.push(["grey", `${f.title_fights} title fight${f.title_fights > 1 ? "s" : ""}`]);
  return b.length ? `<div class="fbadges">${b.map(([c, t]) => `<span class="fbadge ${c}">${t}</span>`).join("")}</div>` : "";
}
const STRENGTH_WORDS = {Striking: "striking volume", Defense: "strike defense", Power: "knockout power", Wrestling: "wrestling (takedowns)",
  "Takedown D": "takedown defense", Control: "positional control", Submissions: "submission threat", Durability: "durability"};
function strengthLine(R) {
  if (!R) return "";
  const E = Object.entries(R).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1]);
  if (!E.length) return "";
  const top = E.filter(([, v]) => v >= 75).slice(0, 2), low = E.filter(([, v]) => v <= 25).slice(-1)[0];
  return `<div class="fstrength">
    ${top.length ? `<div><span class="fs-k">Greatest strength</span><p><b>${esc(STRENGTH_WORDS[top[0][0]])}</b>: better than ${top[0][1]}% of UFC fighters with stats.${top[1] ? ` Also strong in ${esc(STRENGTH_WORDS[top[1][0]])} (${top[1][1]}%).` : ""}</p></div>`
      : `<div><span class="fs-k">Profile</span><p><b>Well-rounded</b>: no single area in the top quarter, best at ${esc(STRENGTH_WORDS[E[0][0]])} (${E[0][1]}%).</p></div>`}
    ${low ? `<div class="weak"><span class="fs-k">Watch</span><p>${esc(STRENGTH_WORDS[low[0]])}: ${low[1]}th percentile.</p></div>` : ""}</div>`;
}
function highlightCards(f) {
  const H = f.highlights || {}, cards = [];
  const meth = m => ({"U-DEC": "unanimous decision", "S-DEC": "split decision", "M-DEC": "majority decision", KO: "KO/TKO", SUB: "submission", DEC: "decision"}[m] || m || "");
  const yr = d => esc(String(d || "").slice(0, 4));
  if (H.best_win) cards.push(["gold", "Best win", `${fighterLink(H.best_win.opp, H.best_win.opp_slug)}`, `rated ${H.best_win.opp_rating} going in · ${yr(H.best_win.date)}, ${esc(meth(H.best_win.method))}`]);
  if (H.upset) cards.push(["teal", "Biggest upset", `${odds(H.upset.odds)} vs ${fighterLink(H.upset.opp, H.upset.opp_slug)}`, `won as the underdog · ${yr(H.upset.date)}`]);
  if (H.higher_rated && H.higher_rated.count) cards.push(["purple", "Beat higher-rated opponents", `${H.higher_rated.count} win${H.higher_rated.count > 1 ? "s" : ""}`,
    H.higher_rated.top.map(x => `${fighterLink(x.opp, x.opp_slug)} <small>+${x.gap}</small>`).join("<br>")]);
  if (H.vs_champs) cards.push(["blue", "Against UFC champions", `${H.vs_champs.won}-${H.vs_champs.lost}`,
    H.vs_champs.opponents.map(x => `${fighterLink(x.opp, x.opp_slug)} <small>${esc(x.record)}</small>`).join("<br>")]);
  if (!cards.length) return "";
  return `<h2>${kick("By the numbers", "gold")}Career highlights</h2>
    <div class="hlgrid">${cards.map(([c, k, big, sub]) => `<div class="hl ${c}"><span class="hl-k">${k}</span><b>${big}</b><div class="hl-s">${sub}</div></div>`).join("")}</div>`;
}

async function viewFighter(s) {
  const [f, avgs] = await Promise.all([get(`fighters/${s}.json`), get("division_avg.json")]);
  if (!f) {   // a UFC debutant on the upcoming card: a short page from the card itself
    const pr = await getPred();
    const b = pr && (pr.fights || []).find(x => x.a_slug === s || x.b_slug === s);
    if (b) {
      const isA = b.a_slug === s, me = isA ? b.a : b.b, opp = isA ? b.b : b.a, oppS = isA ? b.b_slug : b.a_slug;
      const ch = b.p_a == null ? null : isA ? b.p_a : 1 - b.p_a, o = isA ? b.odds_a : b.odds_b, rec = isA ? b.record_a : b.record_b;
      return `<p><a href="#/card">← Card</a></p>
        <section class="fhero"><figure class="fh-ph">${photo(isA ? b.a_id : b.b_id, me, "xl")}</figure><div class="fh-main">
        <h1>${esc(me)}</h1><p class="fh-sub">${rankOf(s, true)}${flagOf(s, true)}${esc(b.weight_class || "")}</p>
        <div class="fchips">${rec ? `<div class="fchip"><b>${esc(rec)}</b><span>Pro record</span></div>` : ""}<div class="fchip"><b>Debut</b><span>UFC fights</span></div></div></div></section>
        <div class="empty">UFC debut against ${fighterLink(opp, oppS)} at ${esc(pr.event || "the next card")}.${ch != null ? ` Our chance ${pct(ch)}` : ""}${o != null ? `, line ${odds(o)}` : ""}.<br>
        A full page with ratings and fight history appears after the first UFC fight.</div>`;
    }
    return `<h1>Fighter not found</h1><div class="empty">We don't have UFC fights for that fighter yet. Debut fighters get a page after their first UFC fight.<br><a href="#/fighters">Search all fighters</a></div>`;
  }
  const by = (o, total) => ["KO", "SUB", "DEC"].map(k => `<div class="byrow"><span>${{KO: "KO/TKO", SUB: "Submission", DEC: "Decision"}[k]}</span>
    <i style="width:${total ? o[k] / total * 100 : 0}%"></i><b>${o[k]}</b></div>`).join("");
  const w = f.wins_by.KO + f.wins_by.SUB + f.wins_by.DEC, l = f.losses_by.KO + f.losses_by.SUB + f.losses_by.DEC;
  const st = f.style || {}, g = f.grappling || {}, A = (avgs || {})[f.weight_class] || {};
  const p2 = v => (v * 100).toFixed(0) + "%", n2 = v => (+v).toFixed(2);
  const recent = (f.fights || []).filter(x => ["W", "L", "D"].includes(x.result)).slice(0, 10).reverse();
  const chip = (big, small) => `<div class="fchip"><b>${big}</b><span>${small}</span></div>`;
  // one stat as a bar against the division median; better = 1 when higher is better, -1 when lower is
  const bar = (label, v, avg, fmt, better) => {
    if (v == null) return "";
    const top = Math.max(v, avg ?? 0) * 1.3 || 1, good = avg == null ? null : better * (v - avg) > 0;
    return `<div class="sbar"><span class="sl">${label}</span>
      <span class="track"><i class="${good == null ? "" : good ? "good" : "bad"}" style="width:${Math.min(100, v / top * 100)}%"></i>${avg != null ? `<em style="left:${Math.min(100, avg / top * 100)}%" title="Division median ${fmt(avg)}"></em>` : ""}</span>
      <b>${fmt(v)}</b></div>`;
  };
  const val = (x, y) => x ?? y ?? null;
  const striking = [
    bar("Sig. strikes landed / min", val(g.slpm, st.sig_strikes_landed_per_min), A.slpm, n2, 1),
    bar("Sig. strikes absorbed / min", val(g.sapm, st.sig_strikes_absorbed_per_min), A.sapm, n2, -1),
    bar("Striking accuracy", val(g.str_acc, st.sig_strike_accuracy), A.str_acc, p2, 1),
    bar("Strike defense", g.str_def, A.str_def, p2, 1),
    bar("Knockdowns / 15 min", val(g.kd_per15, st.knockdowns_per_15), A.kd_per15, n2, 1)].join("");
  const grappling = [
    bar("Takedowns / 15 min", val(g.td_per15, st.takedowns_per_15), A.td_per15, n2, 1),
    bar("Takedown defense", val(g.td_def, st.takedown_defense), A.td_def, p2, 1),
    bar("Submission attempts / 15", val(g.sub_per15, st.submission_attempts_per_15), A.sub_per15, n2, 1),
    bar("Control time share", st.control_time_share, null, p2, 1)].join("");
  const mix = ks => ks.every(k => g[k] != null) ? ks.map(k => Math.round(g[k] * 100) + "%").join(" / ") : null;
  const extras = [["Strikes to head / body / leg", mix(["head", "body", "leg"])], ["Standing / clinch / ground", mix(["standing", "clinch", "ground"])],
    ["Average fight time", g.avg_time != null ? `${Math.floor(g.avg_time)}:${String(Math.round((g.avg_time % 1) * 60)).padStart(2, "0")}` : null],
    ["Times submitted", g.ufc_fights ? `${g.sub_losses} in ${g.ufc_fights} fights` : null]].filter(x => x[1]);
  const pr = await getPred();
  const nxi = pr ? (pr.fights || []).findIndex(x => (x.a_slug === s || x.b_slug === s) && x.state !== "post") : -1;
  const nextFight = nxi < 0 ? "" : (() => { const b = pr.fights[nxi], isA = b.a_slug === s, opp = isA ? b.b : b.a, oppS = isA ? b.b_slug : b.a_slug;
    const ch = b.hidden || b.p_a == null ? null : isA ? b.p_a : 1 - b.p_a, o = isA ? b.odds_a : b.odds_b;
    const mine = b.our_pick && b.our_pick === (isA ? b.a : b.b), against = b.our_pick && !mine;
    return `<a class="nextfight" href="${fightLink(nxi)}"><span class="nf-k">Next fight</span>
      <span class="nf-t"><b>vs ${esc(opp)}</b><small>${esc(pr.event)} · ${dateLong(pr.date)}${b.weight_class ? " · " + esc(b.weight_class) : ""}</small></span>
      <span class="nf-n">${ch != null ? `<b>${pct(ch)}</b><small>our chance${o != null ? " · " + odds(o) : ""}</small>` : b.hidden ? `<b>${lockIcon}</b><small>for members${o != null ? " · line " + odds(o) : ""}</small>` : o != null ? `<b>${odds(o)}</b><small>line</small>` : ""}</span>
      ${mine ? `<span class="nf-pick">Our pick</span>` : against ? `<span class="nf-pick vs">We pick ${esc(opp)}</span>` : ""}<span class="nf-go">Breakdown →</span></a>`; })();
  return `<p><a href="#/fighters">← Fighters</a></p>${nextFight}
    <section class="fhero">
      <figure class="fh-ph">${photo(f.espn_id, f.name, "xl")}${(() => { const c = PHOTOS.photos[f.slug]; const used = c && photoSrc(f.espn_id, f.name)[0] === c.src;
        return used ? `<figcaption>Photo: ${esc(c.author || "Wikimedia Commons")}, <a href="${esc(c.license_url || c.page)}" target="_blank" rel="noopener">${esc(c.license)}</a></figcaption>` : ""; })()}</figure>
      <div class="fh-main">
        <h1>${esc(f.name)}</h1>${FAV[f.slug] ? `<p class="favtag">★ Jono's favorite${FAV[f.slug].note ? ` · ${esc(FAV[f.slug].note)}` : ""}</p>` : ""}
        ${fighterBadges(f)}
        <p class="fh-sub">${RANK[f.slug] && RANK[f.slug].rank === 0 ? "" : rankOf(f.slug, true)}${RANK[f.slug] && RANK[f.slug].p4p ? `<span class="urank p4p">#${RANK[f.slug].p4p} P4P</span>` : ""}${flagOf(f.slug, true)}${esc(f.weight_class)}${f.stance ? ", " + esc(f.stance) : ""}${f.age ? `, age ${f.age}` : ""}${f.height_cm ? `, ${cm(f.height_cm)}` : ""}${f.reach_cm ? `, ${inch(f.reach_cm)} reach` : ""}</p>
        ${g.birthplace || g.trains_at ? `<p class="fh-sub small">${g.birthplace ? "From " + esc(g.birthplace) : ""}${g.birthplace && g.trains_at ? ". " : ""}${g.trains_at ? "Trains at " + esc(g.trains_at) : ""}${g.fighting_style ? ". " + esc(g.fighting_style) : ""}</p>` : ""}
        <div class="fchips">
          ${chip(esc(f.ufc_record), "UFC record")}${f.pro_record ? chip(esc(f.pro_record), "Pro record") : ""}
          ${chip(f.rating ?? "–", `${METHOD}, peak ${f.peak_rating ?? "–"}`)}
          ${chip(f.streak > 0 ? "W" + f.streak : f.streak < 0 ? "L" + -f.streak : "–", "Streak")}
          ${chip(f.finish_rate != null ? p2(f.finish_rate) : "–", "Finish rate")}
        </div>
        ${recent.length ? `<div class="form" aria-label="Last ${recent.length} fights, oldest first">${recent.map(x => `<a href="#/event/${esc(x.event_slug)}" class="fm ${x.result}" title="${esc(x.result)} vs ${esc(x.opp)}, ${esc(x.date)}">${x.result}</a>`).join("")}<span class="small">last ${recent.length}, oldest first</span></div>` : ""}
        ${g.flags && g.flags.length ? `<ul class="gflags">${g.flags.map(x => `<li><span class="gflag ${x.flag === "Big grappler" ? "off" : "def"}">${esc(x.flag)}</span> ${esc(x.why)}</li>`).join("")}</ul>` : ""}
      </div>
    </section>
    ${f.radar ? `<h2>${kick(METHOD, "gold")}Style profile</h2>
      <div class="fprofile">${radarSvg(f.radar, f)}<div class="fp-side">${strengthLine(f.radar)}
</div></div>` : ""}
    ${highlightCards(f)}
    <div class="cols">
      <section><h2>How they win (${w})</h2>${by(f.wins_by, w)}</section>
      <section><h2>How they lose (${l})</h2>${by(f.losses_by, l)}</section>
    </div>
    <h2>Career stats</h2>
    ${striking || grappling ? `<p class="note">White mark: ${esc(f.weight_class)} median.</p>
      <div class="cols"><section><h3>Striking</h3>${striking}</section><section><h3>Grappling</h3>${grappling}</section></div>
      ${extras.length ? `<div class="fextras">${extras.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}`
      : `<p class="note">Career stats appear once this fighter's UFC.com page is collected (nightly).</p>`}
    <p class="cmp-cta"><a class="btn" href="#/compare?a=${esc(f.slug)}">Compare ${esc(f.name.split(" ")[0])} with another fighter</a></p>
    ${(f.rating_history || []).length >= 2 ? `<h2>Rating over time</h2>${ratingChart(f.rating_history)}` : ""}
    <h2>UFC fights</h2>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Opponent</th><th>Result</th><th class="hide-sm">Method</th><th class="n">Odds</th><th class="n">Model</th><th class="n hide-sm">Rating</th></tr></thead><tbody>
    ${f.fights.map(x => `<tr><td><a href="#/event/${esc(x.event_slug)}">${esc(x.date)}</a></td><td>${fighterLink(x.opp, x.opp_slug)}</td>
      <td class="${x.result === "W" ? "won" : x.result === "L" ? "lost" : ""}">${x.result}${x.title ? " (title)" : ""}</td>
      <td class="hide-sm">${esc(x.finish || "")}${x.round ? `, R${x.round}` : ""}</td><td class="n">${odds(x.odds)}</td><td class="n">${pct(x.model_p)}</td>
      <td class="n hide-sm">${x.rating_before} → ${x.rating_after}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------------- experts ----------------
async function viewExperts() {
  const [e, mt] = await Promise.all([get("experts.json"), get("model_test.json")]);
  if (!e) return `<h1>Expert check</h1><div class="empty">Expert picks appear after the next run collects them.</div>`;
  const A = e.analysts, pos = A.filter(a => a.units > 0), r = x => x.roi_pct == null ? "–" : (x.roi_pct > 0 ? "+" : "") + x.roi_pct + "%";
  const lean = (e.by_strength || []).find(s => /^Lean/.test(s.consensus));
  const card = a => `<div class="xw"><span class="xw-k">★ Winning record</span><b>${esc(a.analyst)}</b>
      <div class="xw-n"><span><b>${a.won}-${a.bets - a.won}</b>${a.win_pct}% won</span><span><b class="won">${units(a.units)}</b>${r(a)} per pick</span>
      ${a.high_confidence && a.high_confidence.bets ? `<span><b>${a.high_confidence.won}-${a.high_confidence.bets - a.high_confidence.won}</b>high-confidence picks, ${r(a.high_confidence)}</span>` : ""}</div></div>`;
  return `<h1>Expert check</h1>
    <p class="lede">We grade ${A.length} public MMA analysts against the betting line, so you don't have to.</p>
    <div class="xverdict"><div class="xv-main"><span class="pf-kick">The finding</span><h2>Most experts don't beat the line.</h2>
      <p>Over ${e.consensus.bets} fights (${esc(e.first)} to ${esc(e.last)}), following the majority went ${e.consensus.won}-${e.consensus.bets - e.consensus.won}, ${r(e.consensus)} per bet: they mostly pick favorites the odds already price in. Adding them to our model made it worse, so ${METHOD} leaves them out.</p></div>
      <div class="xv-stats">
        <div><b>${pos.length} of ${A.length}</b><span>analysts are profitable</span></div>
        <div><b class="lost">${r(e.consensus)}</b><span>betting the consensus</span></div>
        ${lean ? `<div><b class="won">${r(lean)}</b><span>close fights where 65-80% agree: our expert leans</span></div>` : ""}
      </div></div>
    <h2>${kick("Worth watching", "gold")}The ones with winning records</h2>
    <div class="xwgrid">${pos.map(card).join("") || `<div class="empty">No analyst is profitable yet.</div>`}</div>
    <p class="note">Their picks show in <b class="gold">gold</b> on each fight's expert bar. A few hundred picks is still a small sample, so watch whether they hold up.</p>
    <h2>${kick("Where experts help", "teal")}Expert leans</h2>
    <p class="note">The one place the crowd has added value: fights the line calls close, where 65%+ of analysts agree. When the model has no pick there, the lean becomes one of our picks, tracked separately on the <a href="#/record">Record</a> page.</p>
    <details class="fine xfull"><summary>Full leaderboard and test details</summary>
      <div class="tablewrap"><table><thead><tr><th>#</th><th>Analyst</th><th class="n">Record</th><th class="n">Win %</th><th class="n">Units</th><th class="n hide-sm">Per pick</th></tr></thead><tbody>
        ${A.map((a, i) => `<tr class="${a.units > 0 ? "xwin" : ""}"><td>${i + 1}</td><td>${esc(a.analyst)}${a.units > 0 ? " ★" : ""}</td><td class="n">${a.won}-${a.bets - a.won}</td><td class="n">${a.win_pct}%</td>
          <td class="n ${a.units >= 0 ? "won" : "lost"}">${units(a.units)}</td><td class="n hide-sm">${r(a)}</td></tr>`).join("")}</tbody></table></div>
      <div class="tablewrap"><table><thead><tr><th>Consensus</th><th class="n">Record</th><th class="n">Won</th><th class="n">Line expected</th><th class="n">Per bet</th></tr></thead><tbody>
        ${e.by_strength.map(s => `<tr><td>${esc(s.consensus)}</td><td class="n">${s.won}-${s.bets - s.won}</td><td class="n">${s.bets ? Math.round(100 * s.won / s.bets) : "–"}%</td><td class="n">${s.line_expected_pct}%</td><td class="n ${s.roi_pct >= 0 ? "won" : "lost"}">${r(s)}</td></tr>`).join("")}
        <tr><td>Consensus on the underdog</td><td class="n">${e.against_the_line.won}-${e.against_the_line.bets - e.against_the_line.won}</td><td class="n">${Math.round(100 * e.against_the_line.won / e.against_the_line.bets)}%</td><td class="n">–</td><td class="n lost">${r(e.against_the_line)}</td></tr></tbody></table></div>
      <p class="note">Return per 1-unit bet at the posted odds. Model test: adding the consensus to the line moved log loss from ${e.test.log_loss_line_refit} to ${e.test.log_loss_line_plus_experts} (lower is better), tested one card at a time on ${e.test.bouts} fights.</p>
    </details>
    <p class="small">Results graded by Octagon Edge.</p>`;
}

// ---------------- about and photo credits ----------------
async function viewAbout() {
  const mr = await get("model_record.json"), S = mr ? (mr.since || mr.all) : null;
  return `<h1>About Octagon Edge</h1>
    <p class="lede">I'm Jono. I got tired of UFC picks with nothing behind them, so I built a rating for every UFC fighter and a model that prices every fight. When my number and the sportsbook's disagree by enough, that's a pick. Every one goes up before the fight and gets graded after it.</p>
    <div class="about">
      <section><h2>What you get each week</h2><ul class="dots">
        <li>A chance for every fighter on the card, next to the betting line's</li>
        <li>Our picks: the few fights where we think the price is off, with a suggested stake and the reasons</li>
        <li>Expert consensus, betting splits, line movement and a full tale of the tape for every bout</li>
        <li>Live results on fight night, and a record that's locked once each fight ends</li>
        <li>Free: every betting line, EDGE Rating, one pick per card and the full record. ${PLANS && PLANS.plans ? PLANS.plans.map(p => `${esc(p.name)} $${p.price}`).join(" or ") + " unlocks every pick." : ""} <a href="#/pricing">See plans</a></li></ul></section>
      <section><h2>How we keep it honest</h2><ul class="dots">
        <li>Every pick is graded at the average sportsbook's price, never the best one</li>
        <li>Picks are locked before the fight and never edited after it</li>
        <li>Ideas only make it into the model if they hold up in two separate stretches of years</li>
        <li>No affiliate links and no sportsbook sponsorship: members pay for the picks, so our only job is getting them right</li></ul></section>
    </div>
    ${S ? `<div class="hw-stats"><div><b>${S.our_pct}%</b><span>our picks won since ${mr.from || 2020}</span></div><div><b class="${S.our_units >= 0 ? "won" : "lost"}">${units(S.our_units)}</b><span>flat 1-unit bets</span></div><div><b>${S.our_bets}</b><span>picks graded</span></div><div><b>7,500+</b><span>UFC fights since 2010 in the data</span></div></div>` : ""}
    <h2>Who's behind it</h2>
    <p class="note">The data and the numbers update themselves through fight week. The picks and the notes on them are mine. The full method is on <a href="#/how">How it works</a>.</p>
    <h2>Data and credits</h2>
    <p class="note">Results, cards and lines from ESPN; sportsbook prices from The Odds API; career stats from UFC.com; historical fights from the Ultimate UFC Dataset. Freely licensed fighter photos from Wikimedia Commons are credited on the <a href="#/credits">photo credits</a> page. Octagon Edge isn't affiliated with the UFC, ESPN or any sportsbook.</p>
    <p class="note">For fun and research, not betting advice. 21+ where sports betting is legal. If gambling stops being fun, call 1-800-GAMBLER.</p>`;
}

function viewTerms() {
  return `<h1>Terms of use</h1><div class="legal">
    <p class="where">Last updated ${esc(dateLong("2026-11-08"))}</p>
    <h2>What this is</h2><p>Octagon Edge publishes predictions and picks for UFC fights. It's information and entertainment, not betting, financial or legal advice. Past results, including the record on this site, don't guarantee future results. You decide what to bet, if anything, and you're responsible for following the law where you live.</p>
    <h2>Who can use it</h2><p>You must be 21 or older, or the legal betting age where you are if that's higher, to use the picks for betting. Sports betting isn't legal everywhere.</p>
    <h2>Paid plans</h2><p>An Event Pass covers the picks for one fight card. A Monthly plan covers every card while it's active and renews each month until you cancel. You can cancel anytime; you keep access until the end of the period you paid for. Prices are shown before you pay and may change for future periods with notice. Payments are handled by our payment provider; we never see or store your card number.</p>
    <h2>Refunds</h2><p>Picks are delivered as soon as you pay, so payments aren't refundable once a card's picks are visible to you. If something went wrong on our end, such as being charged twice, get in touch and we'll fix it.</p>
    <h2>Fights change</h2><p>Fights get cancelled, moved or changed. If a fight with a pick is canceled, the pick is void and isn't counted in the record. No refunds are given for changes to a card.</p>
    <h2>Your account</h2><p>Plans are for one person. Please don't share your login or repost paid picks in full. We may end access for accounts that do.</p>
    <h2>The content</h2><p>The site's text, ratings and data presentation belong to Octagon Edge. Fighter photos, results and lines come from the sources credited on the About and Photo credits pages. Octagon Edge isn't affiliated with the UFC, ESPN or any sportsbook.</p>
    <h2>Limits</h2><p>The site is provided as is. We work to keep it accurate and online, but data can be late or wrong and the site can go down. To the extent the law allows, we aren't liable for losses from using it, including betting losses, and our total liability is limited to what you paid in the last three months.</p>
    <h2>Changes</h2><p>We may update these terms. The date at the top shows the latest version; continuing to use the site means you accept it.</p>
    <p class="note">If gambling stops being fun, call 1-800-GAMBLER.</p></div>`;
}
function viewPrivacy() {
  return `<h1>Privacy</h1><div class="legal">
    <p class="where">Last updated ${esc(dateLong("2026-11-08"))}</p>
    <h2>The short version</h2><p>We collect as little as we can: your email if you sign up, and what's needed to run your plan. We don't sell your information and there are no ad trackers on this site.</p>
    <h2>What we collect</h2><ul class="dots">
      <li><b>Email address</b>, if you join the email list or create an account, to send picks and sign you in.</li>
      <li><b>Plan and payment records</b> (plan, dates, receipts). Card details go straight to our payment provider and never reach us.</li>
      <li><b>Settings on your device</b>, such as your preferred card view, kept in your browser's storage. They stay on your device.</li></ul>
    <h2>Who else handles it</h2><p>Only the services that run the site: the host (GitHub Pages), the payment provider, the sign-in provider and the email service. Each gets only what it needs for its job.</p>
    <h2>Your choices</h2><p>Every email has an unsubscribe link. You can ask us to see, correct or delete what we hold about you; deleting your account ends any paid plan.</p>
    <h2>Children</h2><p>The site isn't meant for anyone under 21, and we don't knowingly collect information from minors.</p>
    <h2>Changes</h2><p>If this policy changes, the date at the top changes too. For anything that affects how your information is used, members get an email first.</p></div>`;
}
async function viewCredits() {
  const list = Object.values(PHOTOS.photos || {}).sort((a, b) => a.name < b.name ? -1 : 1);
  return `<h1>Photo credits</h1>
    <p class="note">${PHOTOS.mode === "espn_first" ? "Fighter photos come from ESPN where available; the" : PHOTOS.mode === "commons_first" ? "Fighters without a photo below use their ESPN headshot. The" : "The"} photos below are from Wikimedia Commons, used under the license shown. Thank you to every photographer who shares their work.</p>
    <p class="note">Country flags: <a href="https://github.com/lipis/flag-icons" target="_blank" rel="noopener">flag-icons</a> by Panayiotis Lipiridis, MIT license. Countries are the ones ESPN lists for each fighter, or the country of birth on UFC.com.</p>
    ${list.length ? `<div class="tablewrap"><table><thead><tr><th>Fighter</th><th>Photographer</th><th>License</th><th class="hide-sm">Source</th></tr></thead><tbody>${list.map(c =>
      `<tr><td>${fighterLink(c.name)}</td><td>${esc(c.author || "Unknown")}</td><td>${c.license_url ? `<a href="${esc(c.license_url)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}</td>
      <td class="hide-sm"><a href="${esc(c.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Freely licensed photos are collected each weekday morning; credits appear here once they are.</div>`}`;
}

// ---------------- rankings, record, how it works ----------------
const rkTabs = on => `<div class="filters rk-tabs">${[["divisions", "#/rankings", "UFC divisions"], ["ratings", "#/rankings?view=ratings", "Our ratings"], ["alltime", "#/rankings?view=alltime", "All-time"],
  ["movers", "#/movers", "Movers"], ["compare", "#/compare", "Who wins?"]].map(([k, h, t]) => `<a href="${h}" class="${k === on ? "on" : ""}">${t}</a>`).join("")}</div>`;
// ---- Rankings: one snapshot card per UFC division (official ranks, our ratings) ----
const DIV_ORDER = ["Heavyweight", "Light Heavyweight", "Middleweight", "Welterweight", "Lightweight", "Featherweight",
  "Bantamweight", "Flyweight", "Women's Bantamweight", "Women's Flyweight", "Women's Strawweight"];
function divisionCards(fx) {
  const bySlug = {}; (fx || []).forEach(x => { bySlug[x.slug] = x; });
  const divs = {};
  for (const [s, r] of Object.entries(RANK)) if (r && r.div != null) (divs[r.div] = divs[r.div] || []).push({s, rank: r.rank});
  const names = Object.keys(divs).sort((a, b) => (DIV_ORDER.indexOf(a) + 1 || 99) - (DIV_ORDER.indexOf(b) + 1 || 99));
  if (!names.length) return "";
  return `<div class="divgrid">${names.map(d => {
    const L = divs[d].sort((a, b) => a.rank - b.rank), ch = L.find(x => x.rank === 0), top = L.filter(x => x.rank > 0).slice(0, 5);
    const nm = s => (bySlug[s] || {}).name || s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const rt = s => (bySlug[s] || {}).rating;
    return `<section class="divcard">
      ${ch ? `<a class="dc-champ" href="#/fighter/${esc(ch.s)}">${photo((bySlug[ch.s] || {}).espn_id, nm(ch.s), "xl")}
        <span class="dc-div">${esc(d)}</span><span class="dc-name">${esc(nm(ch.s))}${favStar(ch.s)}</span>
        <span class="dc-sub"><span class="champtag">Champ</span>${flagOf(ch.s)}${rt(ch.s) ? `<b>${rt(ch.s)}</b>` : ""}</span></a>`
        : `<div class="dc-champ vacant"><span class="dc-div">${esc(d)}</span><span class="dc-name">Title vacant</span></div>`}
      <ol class="dc-list">${top.map(x => `<li><span class="dc-rk">#${x.rank}</span><span class="dc-f">${flagOf(x.s)}${fighterLink(nm(x.s), x.s)}</span><span class="dc-r">${rt(x.s) ?? "–"}</span></li>`).join("")}</ol>
      <a class="dc-more" href="#/rankings?div=${encodeURIComponent(d)}">Our ratings for the division →</a>
    </section>`; }).join("")}</div>`;
}

// ---- Movers & leaderboards ----
async function viewMovers() {
  const m = await get("movers.json", true);
  if (!m || !m.card) return `<div class="empty">Leaderboards appear after the next update.</div>`;
  const sgn = v => v == null ? "–" : (v > 0 ? "+" : "") + v;
  const row = (x, val, cls, extra) => `<li><span class="mv-ph">${photo(x.espn_id, x.name, "sm")}</span><span class="mv-who">${fighterLink(x.name, x.slug)}<small>${extra != null ? extra : esc(x.weight_class || "")}</small></span><span class="mv-val ${cls || ""}">${val}</span></li>`;
  const board = (title, k, items, note) => `<section class="mv-board ${k}"><h3>${title}</h3>${note ? `<p class="note">${note}</p>` : ""}<ol>${items}</ol></section>`;
  const up = m.card.filter(x => (x.change || 0) > 0).slice(0, 6), down = m.card.filter(x => (x.change || 0) < 0).slice(-6).reverse();
  return `<h1>Movers & leaderboards</h1>${rkTabs("movers")}
    <p class="where">After ${m.event_slug ? `<a href="#/event/${esc(m.event_slug)}">${esc(m.event || "the last card")}</a>` : esc(m.event || "the last card")}</p>
    <div class="mv-grid two">
      ${board(`${kick("Last card", "gold")}Biggest gains`, "up", up.map(x => row(x, sgn(x.change), "won", `${x.result === "W" ? "def." : x.result === "L" ? "lost to" : "vs"} ${esc(x.opp || "")}`)).join(""))}
      ${board(`${kick("Last card", "red")}Biggest drops`, "down", down.map(x => row(x, sgn(x.change), "lost", `${x.result === "L" ? "lost to" : x.result === "W" ? "def." : "vs"} ${esc(x.opp || "")}`)).join(""))}
    </div>
    <div class="mv-grid two">
      ${board(`${kick("90 days", "teal")}Hottest risers`, "up", m.gainers.slice(0, 8).map(x => row(x, sgn(x.change), "won", `${x.was} → ${x.rating}`)).join(""))}
      ${board(`${kick("90 days", "blue")}Cooling off`, "down", m.droppers.slice(0, 8).map(x => row(x, sgn(x.change), "lost", `${x.was} → ${x.rating}`)).join(""))}
    </div>
    <div class="mv-grid three">
      ${board(`${kick("27 and under", "gold")}Rising stars`, "", m.rising.map(x => row(x, x.rating, "", `Age ${x.age} · ${esc(x.record || "")}`)).join(""), "Highest-rated active fighters 27 or younger.")}
      ${board(`${kick("Active", "teal")}Win streaks`, "", m.streaks.map(x => row(x, x.streak + "W", "won", esc(x.record || ""))).join(""), "Current UFC win streaks.")}
      ${board(`${kick("6+ UFC wins", "red")}Finishers`, "", m.finishers.map(x => row(x, Math.round(100 * x.finish_rate) + "%", "", `${x.wins} UFC wins`)).join(""), "Share of UFC wins by KO or submission.")}
    </div>
    ${board(`${kick("Since 2010", "blue")}Highest peak ratings`, "peaks", m.peaks.map((x, i) => row(x, x.peak, "", `${i === 0 ? "All-time high in our data" : esc(x.weight_class || "")}`)).join(""), "Our data starts in 2010, so earlier greats like GSP and Anderson Silva are underrated here.")}
`;
}

// ---- Who wins? Any two fighters, rating-based chance and stats side by side ----
function glickoP(a, b) {
  const S = 173.7178, g = p => 1 / Math.sqrt(1 + 3 * p * p / (Math.PI * Math.PI));
  const ph = f => { const t = Math.max(0, (Date.now() - new Date(f.last_fight)) / 864e5) / 90;
    return Math.min(Math.sqrt((f.rd / S) ** 2 + 0.06 ** 2 * t), 350 / S); };
  return 1 / (1 + Math.exp(-g(Math.hypot(ph(a), ph(b))) * ((a.rating - b.rating) / S)));
}
async function viewCompare(q) {
  const fx = await get("fighters/index.json") || [];
  const sa = q.get("a") || "", sb = q.get("b") || "";
  const [A, B] = await Promise.all([sa ? get(`fighters/${sa}.json`, true) : null, sb ? get(`fighters/${sb}.json`, true) : null]);
  // same weight class only: once one corner is set, the other corner's list is that division
  const divOf = F => F ? F.weight_class || (fx.find(x => x.slug === F.slug) || {}).weight_class || null : null;
  const dA = divOf(A), dB = divOf(B);
  const listFor = d => fx.filter(x => !d || x.weight_class === d);
  const opts = `<datalist id="fxlist-a">${listFor(dB).map(x => `<option value="${esc(x.name)}">`).join("")}</datalist>
    <datalist id="fxlist-b">${listFor(dA).map(x => `<option value="${esc(x.name)}">`).join("")}</datalist>`;
  const box = (k, F) => { const own = k === "a" ? dA : dB, other = k === "a" ? dB : dA;   // own division, or the one this corner is limited to
    const d = F ? own : other ? other + " only" : null;
    return `<label class="cmp-in ${k}"><span>${k === "a" ? "Red corner" : "Blue corner"}${d ? ` · ${esc(d)}` : ""}</span>
    <input list="fxlist-${k}" data-k="${k}" placeholder="${d ? "Type a " + esc(d.toLowerCase()) : "Type a fighter"}" value="${F ? esc(F.name) : ""}" autocomplete="off"></label>`; };
  let body = `<div class="empty">Pick two fighters to see who our ratings favor and how they compare.</div>`;
  const booked = q.get("booked") === "1";   // a real booked fight, e.g. someone moving up a division
  if (A && B && dA && dB && dA !== dB && !booked) {
    body = `<div class="empty">${esc(A.name)} is a ${esc(dA.toLowerCase())} and ${esc(B.name)} a ${esc(dB.toLowerCase())}. Who wins? only compares fighters in the same division. <a href="#/compare?a=${esc(A.slug)}">Keep ${esc(A.name)}</a></div>`;
  } else if (A && B) {
    const p = glickoP(A, B), s = A.style || {}, t = B.style || {};
    const cm = v => v == null ? "–" : Math.round(v) + " cm";
    const pctv = v => v == null ? "–" : Math.round(100 * v) + "%";
    const n2 = v => v == null ? "–" : (+v).toFixed(2);
    const rows = [
      [METHOD, A.rating, B.rating, x => x, 1], ["Peak " + METHOD, A.peak_rating, B.peak_rating, x => x, 1],
      ["UFC record", A.ufc_record, B.ufc_record, x => x || "–", 0], ["Streak", A.streak, B.streak, x => x == null ? "–" : x > 0 ? x + "W" : x < 0 ? -x + "L" : "–", 1],
      ["Age", A.age, B.age, x => x ?? "–", -1], ["Height", A.height_cm, B.height_cm, cm, 0], ["Reach", A.reach_cm, B.reach_cm, cm, 1],
      ["Stance", A.stance, B.stance, x => x || "–", 0], ["Finish rate", A.finish_rate, B.finish_rate, pctv, 1],
      ["Sig. strikes landed / min", s.sig_strikes_landed_per_min, t.sig_strikes_landed_per_min, n2, 1],
      ["Sig. strikes absorbed / min", s.sig_strikes_absorbed_per_min, t.sig_strikes_absorbed_per_min, n2, -1],
      ["Takedowns / 15 min", s.takedowns_per_15, t.takedowns_per_15, n2, 1], ["Takedown defense", s.takedown_defense, t.takedown_defense, pctv, 1],
      ["Control time share", s.control_time_share, t.control_time_share, pctv, 1], ["Sub attempts / 15 min", s.submission_attempts_per_15, t.submission_attempts_per_15, n2, 1],
      ["Knockdowns / 15 min", s.knockdowns_per_15, t.knockdowns_per_15, n2, 1], ["Last fight", A.last_fight, B.last_fight, x => x || "–", 0]];
    const tr = ([lab, x, y, fmt, better]) => { const win = better && x != null && y != null && x !== y ? ((x > y) === (better > 0) ? "a" : "b") : "";
      return `<tr><td class="ca${win === "a" ? " best" : ""}">${fmt(x)}</td><th>${lab}</th><td class="cb${win === "b" ? " best" : ""}">${fmt(y)}</td></tr>`; };
    const side = (F, k, ch) => `<a class="lc-corner ${k}" href="#/fighter/${esc(F.slug)}">${photo(F.espn_id, F.name, "xl")}
      <span class="lc-name">${esc(F.name)}${champTag(F.slug)}${favStar(F.slug)}</span><span class="lc-meta">${rankOf(F.slug)}${flagOf(F.slug, true)}</span>
      <span class="lc-pct">${pct(ch)}</span><span class="lc-odds">${esc(F.weight_class || "")}</span></a>`;
    body = `<div class="cmp-face lc-face">${side(A, "a", p)}<span class="lc-vs">VS</span>${side(B, "b", 1 - p)}</div>
      <div class="lc-bar"><i class="a" style="width:${Math.round(100 * p)}%"></i><i class="b"></i></div>
      <p class="note cmp-why">${esc(p >= 0.5 ? A.name : B.name)} by ${pct(Math.max(p, 1 - p))} on ${METHOD} alone.
        On fight week the full model also weighs age, reach, layoffs, form and the betting line, so a real pick can differ.
</p>
      <div class="tablewrap"><table class="cmp-t"><thead><tr><th class="ca">${esc(A.name)}</th><th></th><th class="cb">${esc(B.name)}</th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>
      <p class="note">Stats are per UFC fight from ESPN's fight stats. Gold marks the better number.</p>`;
  } else if (A || B) body = `<div class="empty">Now pick the other corner.</div>`;
  setTimeout(() => document.querySelectorAll(".cmp-in input").forEach(i => i.addEventListener("change", () => {
    const hit = fx.find(x => x.name.toLowerCase() === i.value.trim().toLowerCase()); if (!hit) return;
    const other = i.dataset.k === "a" ? dB : dA, msg = document.querySelector(".cmp-msg");
    if (other && hit.weight_class !== other) { if (msg) msg.textContent = `${hit.name} fights at ${hit.weight_class.toLowerCase()}. Pick a ${other.toLowerCase()}, or clear the other corner first.`; return; }
    const p2 = new URLSearchParams({a: sa, b: sb}); p2.set(i.dataset.k, hit.slug);
    location.hash = "#/compare?" + [...p2].filter(([, v]) => v).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&"); })), 0);
  return `<h1>Who wins?</h1>${rkTabs("compare")}<p class="where">Two fighters from the same division, head to head on our ratings.</p>
    <div class="cmp-pick">${box("a", A)}${box("b", B)}</div>${opts}<p class="cmp-msg" role="status"></p>
    ${A && B ? `<p class="cmp-swap"><a href="#/compare?a=${esc(B.slug)}&b=${esc(A.slug)}">Swap corners</a> · <a href="#/compare">Clear</a></p>` : ""}
    ${body}`;
}

// all-time: every UFC fighter since 2010 by peak EDGE Rating (5+ UFC fights, so a hot start doesn't count)
function allTime(fx, women) {
  const L = (fx || []).filter(x => x.peak && (x.ufc_fights || 0) >= 5 && String(x.weight_class).startsWith("Women") === women)
    .sort((a, b) => b.peak - a.peak).slice(0, 50);
  if (!L.length) return `<div class="empty">The all-time list appears after the next update.</div>`;
  const active = x => x.last_fight && (Date.now() - new Date(x.last_fight)) / 864e5 < 548;
  return `<p class="where">The best UFC fighters since 2010, by the highest ${METHOD} each one reached. At least 5 UFC fights.</p>
    <div class="filters"><a href="#/rankings?view=alltime" class="${women ? "" : "on"}">Men</a><a href="#/rankings?view=alltime&w=1" class="${women ? "on" : ""}">Women</a></div>
    <ol class="at">${L.map((x, i) => `<li><span class="at-rk">${i + 1}</span>${photo(x.espn_id, x.name, "sm")}
      <span class="at-n">${fighterLink(x.name, x.slug)}<small>${esc(x.weight_class || "")} · ${esc(x.record || "")}${x.titles ? ` · ${x.titles} title fight${x.titles > 1 ? "s" : ""}` : ""}${active(x) ? "" : " · inactive"}</small></span>
      <span class="at-p"><b>${x.peak}</b><small>peak, ${x.peak_date ? esc(x.peak_date.slice(0, 4)) : ""}</small></span>
      <span class="at-now">${active(x) ? `<b>${x.rating}</b><small>now</small>` : ""}</span></li>`).join("")}</ol>`;
}
async function viewRankings(q) {
  const [r, fx] = await Promise.all([get("ratings.json", true), get("fighters/index.json")]);
  const ix = {}; (fx || []).forEach(x => { ix[x.name] = x; });
  if (!r) return `<div class="empty">Rankings appear after the first run.</div>`;
  const div = q && q.get("div") || "";
  const d = (r.divisions || []).find(x => x.division === div);
  const list = d ? d.fighters : r.fighters;
  const chip = (v, label) => `<a href="#/rankings${v ? "?div=" + encodeURIComponent(v) : "?view=ratings"}" class="${v === div ? "on" : ""}">${esc(label)}</a>`;
  const view = q && q.get("view") || (div ? "ratings" : "divisions");
  const tabs = rkTabs(view);
  if (view === "divisions") return `<h1>Rankings</h1>${tabs}${divisionCards(fx)}`;
  if (view === "alltime") return `<h1>Rankings</h1>${tabs}${allTime(fx, q && q.get("w") === "1")}`;
  return `<h1>Rankings</h1>${tabs}
    <div class="filters">${chip("", "Pound for pound")}${(r.divisions || []).map(x => chip(x.division, x.division.replace("Women's ", "W ").replace("Light Heavyweight", "Light Heavy"))).join("")}</div>
    <h2>${esc(d ? d.division : "Pound for pound")}</h2>
    <div class="tablewrap"><table><thead><tr><th class="n">#</th><th>Fighter</th>${d ? "" : `<th class="hide-sm">Division</th>`}<th class="n">UFC record</th><th>${METHOD}</th><th class="n hide-sm">±</th><th class="n hide-sm">Last fight</th></tr></thead><tbody>
    ${list.map((f, i) => { const x = ix[f.fighter] || {}, lo = 1500, hi = Math.max(...list.map(y => y.rating));
      return `<tr class="${i === 0 ? "top1" : ""}"><td class="n rk">${i + 1}</td><td><span class="rkname">${photo(x.espn_id, f.fighter, "sm")}${flagOf(x.slug)}${fighterLink(f.fighter, x.slug)}</span></td>${d ? "" : `<td class="hide-sm">${esc(f.division || "")}</td>`}<td class="n">${esc(f.record || "")}</td>
        <td class="rbar"><span><i style="width:${Math.max(4, (f.rating - lo) / Math.max(1, hi - lo) * 100)}%"></i></span><b>${f.rating}</b></td><td class="n hide-sm">±${f.rd}</td><td class="n hide-sm">${esc(f.last_fight)}</td></tr>`; }).join("")}</tbody></table></div>`;
}

function yearTable(mr) {
  if (!mr) return "";
  const pc = x => x == null ? "–" : x + "%";
  const stk = r => r.our_risked ? Math.round(1000 * r.our_staked_units / r.our_risked) / 10 : null;
  const row = r => `<tr><td>${esc(r.year || "All years")}</td>
    <td class="n">${r.our_bets ? `${r.our_won}-${r.our_bets - r.our_won}` : "–"}</td>
    <td class="n ${r.our_units >= 0 ? "won" : "lost"}">${r.our_bets ? units(r.our_units) : "–"}</td>
    <td class="n hide-sm">${r.our_bets ? (r.our_roi_pct > 0 ? "+" : "") + Number(r.our_roi_pct).toFixed(1) + "%" : "–"}</td>
    <td class="n ${r.our_staked_units >= 0 ? "won" : "lost"}">${r.our_risked ? units(r.our_staked_units) : "–"}</td>
    <td class="n hide-sm">${stk(r) != null ? (stk(r) > 0 ? "+" : "") + stk(r).toFixed(1) + "%" : "–"}</td>
    <td class="n">${pc(r.pct)}</td></tr>`;
  return `<h2>Year by year</h2>
    <p class="note">Our picks each year at the average sportsbook's closing price.</p>
    <details class="fine"><summary>How it's graded</summary><ul>
      <li><b>Prices:</b> the average of 3+ sportsbooks' closing lines where we have them (most fights from 2019 on), otherwise the one closing line. A better price than average is upside the record doesn't count.</li>
      <li><b>Stakes:</b> 1.5u at -199 or longer, 1u from -200 to -399, 0.5u at -400 or shorter.</li>
      <li><b>Close fights:</b> where the model has no pick but 65%+ of tracked analysts agree, their side is our pick (since April 2026).</li>
      <li><b>Line movement:</b> if the line moved more than 1 point against our side between open and close, we pass. Applied from 2023 on, where opening lines exist; earlier cards have none.</li>
      <li><b>Why 2020:</b> earlier fights still train the model, but there was too little history before then to grade fairly.</li></ul></details>
    <div class="tablewrap"><table class="yr-t"><thead><tr><th>Year</th><th class="n">Our picks</th><th class="n">Units, flat</th><th class="n hide-sm">Per bet</th>
      <th class="n">Units, stakes</th><th class="n hide-sm">Per unit risked</th><th class="n">Winners picked</th></tr></thead><tbody>
      ${mr.years.map(row).join("")}${row({...mr.all, year: "Since " + (mr.from || 2020)})}</tbody></table></div>`;
}

const KEEP_KICK = new Set(["Last card", "Next card"]);
const kick = (t, c) => KEEP_KICK.has(t) ? `<span class="kicker${c ? " " + c : ""}">${t}</span>` : "";
// time left until an ISO start, as broadcast-style blocks; ticks via tickClocks()
const clock = iso => `<div class="cd" data-cd="${esc(iso)}" aria-label="Countdown"></div>`;
function tickClocks() {
  document.querySelectorAll("[data-cd]").forEach(el => {
    const ms = new Date(el.dataset.cd) - Date.now();
    if (ms <= 0) { el.innerHTML = `<span class="cd-live">Picks locked: fights underway</span>`; return; }
    const t = [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60];
    el.innerHTML = t.map((v, i) => `<span><b>${String(v).padStart(2, "0")}</b><small>${["days", "hrs", "min"][i]}</small></span>`).join("");
  });
}
setInterval(tickClocks, 15000);
function ledgerBoxes(L, start) {
  if (!L || !L.fights) return `<div class="lr-wait"><div><span class="kicker">Starts ${esc(dateLong(L ? L.from : "2026-10-31"))}</span>
    <b>The live record opens with this card</b><p>Picks locked before each fight at the average sportsbook price. Never recalculated.</p></div>${start ? clock(start) : ""}</div>`;
  const last = (L.rows || []).filter(g => g.our_pick && g.our_units).slice(-10);
  const strip = last.length ? `<div class="form lr-form" aria-label="Our last ${last.length} picks, oldest first">${last.map(g => `<span class="fm ${g.our_units > 0 ? "W" : "L"}" title="${esc(g.our_pick)} ${odds(g.our_odds)}, ${esc(g.date)}">${g.our_units > 0 ? "W" : "L"}</span>`).join("")}<span class="small">our last ${last.length} picks, oldest first</span></div>` : "";
  const u = x => `<b class="${x >= 0 ? "won" : "lost"}">${units(x)}</b>`;
  return `<div class="stats">
    <div class="stat key"><b>${L.our_won}/${L.our_bets} ${L.our_bets ? `<span class="${L.our_units >= 0 ? "won" : "lost"}">${units(L.our_units)}</span>` : ""}</b><span>our picks${L.our_bets ? `, ${Math.round(100 * L.our_won / L.our_bets)}% won` : ""}</span></div>
    <div class="stat key">${u(L.our_staked_units)}<span>suggested stakes${L.our_risked ? ` (${L.our_staked_units >= 0 ? "+" : ""}${(100 * L.our_staked_units / L.our_risked).toFixed(1)}% return)` : ""}, on ${L.our_risked}u risked</span></div>
    <div class="stat model"><b>${L.model_right}/${L.fights}</b><span>winners picked (${Math.round(100 * L.model_right / L.fights)}%)</span></div>
    ${L.value_bets ? `<div class="stat value">${u(L.value_units)}<span>value picks, ${L.value_won}/${L.value_bets} won (flat 1u)</span></div>` : ""}</div>
    ${clvLine(L)}
    ${L.experts_bets ? `<div class="recbits"><span>Model's picks <b>${L.model_won}/${L.model_bets}</b> ${u(L.model_staked_units)}</span><span>Expert leans <b>${L.experts_won}/${L.experts_bets}</b> ${u(L.experts_staked_units)}</span><span class="small">at suggested stakes</span></div>` : ""}${strip}`;
}

// closing line value: did the price get worse after we picked? (+ points = we beat the close)
function clvLine(L) {
  const c = L && L.our_clv;
  if (!c || !c.bets) return `<p class="clv-note"><b>Closing line value</b> is tracked from UFC 334 on: for each pick, the price when it first appeared vs. the price at fight time.</p>`;
  const sg = x => (x > 0 ? "+" : "") + x.toFixed(1);
  return `<div class="clv"><span class="clv-k">Beat the close</span><b>${Math.round(100 * c.beat / c.bets)}%</b>
    <span>${c.beat}/${c.bets} of our picks got a better price than the line at fight time · average ${sg(c.avg)} points</span></div>`;
}

// Record page: results for any timeframe, from every graded fight (backtest before the live record, locked picks after)
let RR = null;
function timeframePanel(rr, key) {
  if (!rr || !rr.rows || !rr.rows.length) return "";
  const rows = rr.rows, lastDate = rows.reduce((m, r) => r[0] > m ? r[0] : m, "");
  const ago = d => { const x = new Date(lastDate + "T12:00:00"); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
  const ranges = [["last", "Last card", r => r[0] === lastDate], ["1m", "1M", r => r[0] > ago(31)], ["3m", "3M", r => r[0] > ago(92)],
    ["6m", "6M", r => r[0] > ago(183)], ["ytd", lastDate.slice(0, 4), r => r[0].startsWith(lastDate.slice(0, 4))], ["all", "Since " + rr.from, () => true]];
  const [k, label, fn] = ranges.find(x => x[0] === key) || ranges[4];
  const R = rows.filter(fn);
  const n = R.length, mw = R.filter(r => r[2]).length, mu = R.reduce((s, r) => s + (r[3] || 0), 0);
  const O = R.filter(r => r[4]), ow = O.filter(r => r[4][0]).length, ou = O.reduce((s, r) => s + r[4][1], 0), os = O.reduce((s, r) => s + r[4][2], 0), ok = O.reduce((s, r) => s + r[4][3], 0);
  const V = R.filter(r => r[5]), vw = V.filter(r => r[5][0]).length, vu = V.reduce((s, r) => s + r[5][1], 0);
  const r1 = x => Math.round(x * 10) / 10, pc = (a, b) => b ? (Math.round(1000 * a / b) / 10).toFixed(1) + "%" : "–";
  const tier = t => { const T = R.filter(r => r[1] === t[0]); return `<div class="tf-t t-${t.toLowerCase()}">${tierTag(t, true)}<b>${pc(T.filter(r => r[2]).length, T.length)}</b><span>${T.filter(r => r[2]).length}/${T.length}</span></div>`; };
  const live = R.some(r => r[0] >= rr.live_from), back = R.some(r => r[0] < rr.live_from);
  return `<section class="tframe" id="tframe">
    <div class="tf-head"><h2>${kick("Explore", "blue")}Results by timeframe</h2>
      <div class="filters tf-chips">${ranges.map(([kk, lb]) => `<a href="#/record?tf=${kk}" class="${kk === k ? "on" : ""}" data-tf="${kk}">${esc(lb)}</a>`).join("")}</div></div>
    <div class="stats four tf-stats">
      <div class="stat model"><b>${pc(mw, n)}</b><span>winners picked (${mw}/${n})</span></div>
      <div class="stat key"><b>${ow}-${O.length - ow} <span class="sub ${os >= 0 ? "won" : "lost"}">${units(r1(os))}</span></b><span>our picks at suggested stakes${ok ? ` (${os >= 0 ? "+" : ""}${(100 * os / ok).toFixed(1)}% on ${r1(ok)}u risked)` : ""}</span></div>
      <div class="stat value"><b class="${vu >= 0 ? "won" : "lost"}">${units(r1(vu))}</b><span>value picks, ${vw}-${V.length - vw} (flat 1u)</span></div>
      <div class="stat model"><b class="${mu >= 0 ? "won" : "lost"}">${units(r1(mu))}</b><span>every model winner (flat 1u)</span></div>
      ${(() => { const F = R.filter(r => r[6]), fu = F.reduce((s, r) => s + (r[6][1] || 0), 0), fw = F.filter(r => r[6][0]).length;
        return F.length ? `<div class="stat"><b class="${fu >= 0 ? "won" : "lost"}">${units(r1(fu))}</b><span>betting every favorite instead, ${pc(fw, F.length)} won (flat 1u)</span></div>` : ""; })()}</div>
    <div class="tf-tiers"><span class="tf-l">By confidence</span>${["High", "Medium", "Low"].map(tier).join("")}</div>
    <p class="note">${n} fights, flat 1-unit bets at the average sportsbook's closing line.</p>
  </section>`;
}

// Record: EDGE against simply betting the favorite, so the advantage is plain to see
function vsLine(mr) {
  const s = mr && mr.since, v = s && s.vs_line; if (!v || !v.fights) return "";
  const yr = mr.years && mr.years[0], y = yr && yr.vs_line;
  const pc = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "–";
  const bar = (label, val, max, cls) => `<div class="vl-bar"><span>${label}</span><div class="vl-track"><i class="${cls}" style="width:${Math.max(2, Math.abs(val) / max * 100)}%"></i></div><b class="${val >= 0 ? "won" : "lost"}">${units(val)}</b></div>`;
  const max = Math.max(Math.abs(v.line_units), Math.abs(s.our_units), Math.abs(v.disagree_model_units), 1);
  return `<section class="vline"><div class="vl-head"><h2>${kick("Proof", "gold")}${METHOD} vs. the betting line</h2>
      <p class="note">Betting every favorite loses to the bookmaker's cut. Same cards, same closing prices, ${mr.from || 2020} to now.</p></div>
    <div class="vl-grid">
      <div class="vl-card"><span class="vl-k">Units</span>
        ${bar("Bet every favorite", v.line_units, max, "neg")}
        ${bar("Our picks", s.our_units, max, "pos")}
        ${bar("When we disagree with the line", v.disagree_model_units, max, "pos")}
        <p class="small">Same cards, same closing prices. ${v.fights.toLocaleString()} fights with a betting line.</p></div>
      <div class="vl-card vl-hero"><span class="vl-k">When ${METHOD} disagrees with the line</span>
        <b class="vl-big">${v.disagree_model_right}-${v.disagree - v.disagree_model_right}</b>
        <p>${v.disagree} fights where we picked the betting underdog. They won <b>${pc(v.disagree_model_right, v.disagree)}</b>${v.disagree_line_expected != null ? `; the line said ${v.disagree_line_expected}%` : ""}.</p>
        ${v.disagree_line_expected != null ? `<div class="vl-cmp">
          <div><span>Our side won</span><i class="pos" style="width:${(100 * v.disagree_model_right / v.disagree).toFixed(1)}%"></i><b>${pc(v.disagree_model_right, v.disagree)}</b></div>
          <div><span>Line expected</span><i class="ln" style="width:${v.disagree_line_expected}%"></i><b>${v.disagree_line_expected}%</b></div></div>` : ""}
        <p class="small">Worth <b class="${v.disagree_model_units >= 0 ? "won" : "lost"}">${units(v.disagree_model_units)}</b> flat on those fights alone.</p></div>
      <div class="vl-card vl-minor"><span class="vl-k">Picking winners</span>
        <p>About even with the betting favorite, because we agree with it in ${pc(v.fights - v.disagree, v.fights)} of fights. The edge is in the price, not the winner.</p>
        <p class="small">On the ${v.fights.toLocaleString()} fights with a betting line.</p>
        <div class="vl-row"><span>${METHOD}</span><b>${pc(v.model_right, v.fights)}</b></div>
        <div class="vl-row"><span>Betting favorite</span><b>${pc(v.line_right, v.fights)}</b></div>
        ${y ? `<div class="vl-row sub"><span>${esc(yr.year)}: ${METHOD} / favorite</span><b>${pc(y.model_right, y.fights)} / ${pc(y.line_right, y.fights)}</b></div>` : ""}</div>
    </div></section>`;
}

// accuracy by confidence tier: live record, this year and since 2020
function tierBoard(L, mr) {
  if (!mr || !mr.since || !mr.since.tiers) return "";
  const yr = mr.years && mr.years[0], col = (t, k) => { const x = (k === "live" ? (L && L.tiers || {})[t] : k === "yr" ? (yr && yr.tiers || {})[t] : mr.since.tiers[t]) || {};
    return x.picks ? `<b>${Math.round(100 * x.right / x.picks)}%</b><span>${x.right}/${x.picks}</span>` : `<b>–</b><span>no fights yet</span>`; };
  return `<h2>${kick("Confidence", "gold")}Accuracy by confidence</h2>
    <p class="note">Every fight gets a tier from our chance for the favorite: <b>High</b> 70%+, <b>Medium</b> 58-70%, <b>Low</b> under 58%. Winners picked in each tier:</p>
    <div class="tierboard">${["High", "Medium", "Low"].map(t => `<div class="tb t-${t.toLowerCase()}"><h3>${tierTag(t)}</h3>
      <div class="tb-row"><span>Live record</span>${col(t, "live")}</div>
      <div class="tb-row"><span>${esc(yr ? yr.year : "This year")}</span>${col(t, "yr")}</div>
      <div class="tb-row main"><span>Since ${mr.from || 2020}</span>${col(t, "since")}</div></div>`).join("")}</div>`;
}

// the live record as a spreadsheet file, built in the browser from ledger.json
async function downloadLedger() {
  const L = await get("ledger.json", true); if (!L || !L.rows) return;
  const head = ["date", "fighter_a", "fighter_b", "winner", "confidence", "our_pick", "our_pick_source", "our_odds", "stake_units", "our_result", "our_units_at_stake", "our_units_flat",
    "value_pick", "value_odds", "value_result", "model_winner", "model_result"];
  const res = (pk, w) => !pk ? "" : !w ? "pending" : pk === w ? "won" : "lost";
  const lines = L.rows.map(g => [g.date, g.a, g.b, g.winner || "", g.tier || "", g.our_pick || "", g.our_pick ? (g.our_source === "experts" ? "expert lean" : "model") : "",
    g.our_pick ? g.our_odds : "", g.our_pick ? g.stake || "" : "", g.our_units > 0 ? "won" : g.our_units < 0 ? "lost" : g.our_pick ? (g.winner ? "push" : "pending") : "",
    g.our_pick ? g.our_staked_units : "", g.our_pick ? g.our_units : "", g.value_pick || "", g.value_pick ? g.value_odds : "", res(g.value_pick, g.winner),
    g.model_pick || "", res(g.model_pick, g.winner)]);
  const cell = v => { const x = v == null ? "" : String(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const csv = [head, ...lines].map(r => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], {type: "text/csv"})), el = document.createElement("a");
  el.href = url; el.download = `octagon-edge-locked-picks-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.downloadLedger = downloadLedger;
async function viewRecord(q) {
  const [L, mr, rr] = await Promise.all([get("ledger.json", true), get("model_record.json"), get("record_rows.json", true)]);
  const tf = q && q.get("tf") || "ytd";
  const rows = L && L.rows ? L.rows : [];
  return `<h1>Record</h1>
    ${vsLine(mr)}
    ${mr ? `<h2>Our picks vs. the betting line, ${mr.from || 2020} on</h2>${unitsChart(mr.curve, lineCurve(rr))}
` : ""}
    ${timeframePanel(rr, tf)}
    ${rows.length ? `<div class="dl-row"><div><b>Every pick, fight by fight</b><span>${rows.length} fights since ${esc(dateLong(L.from))}: our pick, odds, stake, result, value pick and the model's winner, locked before each fight.</span></div>
      <button class="btn" type="button" onclick="downloadLedger()">Download CSV</button></div>` : ""}
    ${yearTable(mr)}`;
}

async function viewHow() {
  const [b, mr] = await Promise.all([get("backtest.json", true), get("model_record.json")]);
  const S = mr ? (mr.since || mr.all) : null;
  if (!b) return `<h1>How it works</h1><div class="empty">The backtest summary appears after the first full run.</div>`;
  const row = (cells, head) => `<tr>${cells.map((c, i) => `<${head ? "th" : "td"}${i ? ' class="n"' : ""}>${c}</${head ? "th" : "td"}>`).join("")}</tr>`;
  const f3 = x => x == null ? "–" : Number(x).toFixed(3);
  const label = r => r.learner === "market" ? "Closing line, cut removed"
    : ({glicko_only: "Rating alone", core: "Core", "core+form": "Core + form", "core+form+context": "Core + form + context", all: "All groups"}[r.features] || r.features)
      + ({logistic: "", boost: ", boosted trees", blend: ", blended learners"}[r.learner] ?? ", " + r.learner);
  const s1 = b.stage1.map(r => row([esc(label(r)), f3(r.log_loss), f3(r.brier), pct(r.accuracy)])).join("");
  const s2 = b.stage2.map(r => row([esc(r.probability), f3(r.log_loss), f3(r.brier), pct(r.accuracy)])).join("");
  const pct1 = x => x == null ? "–" : x.toFixed(1) + "%";
  const pts = e => Math.round(e * 100) + (Math.round(e * 100) === 1 ? " point" : " points");
  const ed = await get("edges.json", true);
  const sg = x => x == null ? "–" : (x > 0 ? "+" : "") + x.toFixed(1) + "%";
  const edges = !ed ? "" : `<h2>Edges: where the line has been wrong</h2>
    <p class="note">Flat bets on the fighter in each situation, tested in two separate periods: a real edge shows up in both. Layoff returners and +300 underdogs are already built into our chances.</p>
    <div class="tablewrap"><table class="bt"><thead>${row(["Situation", ...ed.periods.flatMap(p => [p + " fights", "Won", "Line said", "Per bet"]), "Verdict"], true)}</thead><tbody>${
    ed.rows.filter(r => r.verdict !== "too few fights").sort((a, b) => (a.verdict > b.verdict ? 1 : -1))
      .map(r => row([esc(r.situation), ...ed.periods.flatMap(p => [r["n " + p], pct1(r["won " + p]), pct1(r["line said " + p]), sg(r["roi " + p])]), esc(r.verdict)])).join("")}</tbody></table></div>`;
  const roi = b.roi.map(r => row([pts(r.edge), r.bets, r["win_%"] == null ? "–" : r["win_%"].toFixed(1) + "%", (r.units > 0 ? "+" : "") + r.units.toFixed(1), r["roi_%"] == null ? "–" : r["roi_%"].toFixed(1) + "%"])).join("");
  const step = (n, t, d) => `<div class="hw-step"><span class="hw-n">${n}</span><b>${t}</b><p>${d}</p></div>`;
  return `<h1>How it works</h1>
    <p class="lede">We give every fighter a chance to win. When ours beats the betting line, it's a pick, and every pick is graded.</p>
    <div class="howbrand"><div><span class="pf-kick">${METHOD}</span><p>Our rating for every UFC fighter since 2010, built on Glicko-2: it rises and falls with each result, weighs who you beat, and knows how sure it is about each fighter.</p></div>
      <div><span class="pf-kick">Confidence</span><p>Every fight gets a tier from our chance for the favorite. ${tierTag("High")} 70%+ has picked ${S && S.tiers ? S.tiers.High.pct + "%" : "about 80%"} of winners since 2020, ${tierTag("Medium")} 58-70% ${S && S.tiers ? S.tiers.Medium.pct + "%" : ""}, ${tierTag("Low")} under 58% ${S && S.tiers ? S.tiers.Low.pct + "%" : ""}.</p></div></div>
    <div class="hw">
      ${step(1, "Rate every fighter", "Every UFC fight since 2010 feeds a rating, weighted by how the fight ended and who it was against.")}
      ${step(2, "Predict the fight", "Rating, form, experience, age, reach and finishing history give each fighter a chance to win.")}
      ${step(3, "Blend with the line", "The line knows things we don't (injuries, camps), so we blend with it, plus adjustments for layoffs and long shots.")}
      ${step(4, "Find the value", "Beat the line by 3+ points on a favorite or 70%+ fighter, or experts agree in a close fight: that's a pick, sized by price. If the line moves against it during the week, we pass.")}
    </div>
    ${b.early_moves && b.early_moves.picks ? (() => { const E = b.early_moves, u = x => (x >= 0 ? "+" : "") + x.toFixed(1) + "u";
      return `<section class="early-edge"><span class="pf-kick">Bet early</span>
      <div class="ee-row"><div><b>${Math.round(E.pct)}%</b><span>of the time, the line moved toward our side after we picked at the opening line</span></div>
        <div><b class="${E.units_open >= 0 ? "won" : "lost"}">${u(E.units_open)}</b><span>those picks at opening prices</span></div>
        <div><b class="${E.units_close >= 0 ? "won" : "lost"}">${u(E.units_close)}</b><span>the same picks at closing prices</span></div></div>
      <p class="note">${E.from}-${E.to}: ${E.picks.toLocaleString()} picks made against the opening line (${E.toward} lines moved our way, ${E.away} against), flat 1 unit. The market usually comes around to our side, so most of the edge is in the early price. That's why picks go up as the lines open, with the time and price they were posted.</p></section>`; })() : ""}
    ${S ? `<div class="hw-stats">
      <div><b>${S.our_pct}%</b><span>of our picks won since ${mr.from || 2020}</span></div>
      <div><b class="${S.our_units >= 0 ? "won" : "lost"}">${units(S.our_units)}</b><span>flat 1-unit bets, ${S.our_roi_pct > 0 ? "+" : ""}${S.our_roi_pct}% per bet</span></div>
      <div><b>${S.pct}%</b><span>of all fights' winners picked</span></div>
      <div><b>${S.our_bets}</b><span>picks graded at the average sportsbook's price</span></div></div>` : ""}
    <p class="note">Results before Oct 31, 2026 come from testing the method on past cards, each fight predicted only from earlier fights, with today's pick rules applied to every card (the line-movement pass from 2023 on, where opening lines exist). Every pick since then was posted and locked before the fight.</p>
    <details class="tech"><summary>Technical detail: model tests, betting by edge, and situational edges</summary>
    <p class="note">Each year is predicted from earlier fights only. Log loss and Brier score the chances: lower is better. Last run ${esc(b.run_at)}.</p>
    <h2>The model alone</h2><div class="tablewrap"><table class="bt"><thead>${row(["Probability", "Log loss", "Brier", "Winners"], true)}</thead><tbody>${s1}</tbody></table></div>
    <h2>Blended with the line, ${esc(b.years)}</h2><div class="tablewrap"><table class="bt"><thead>${row(["Probability", "Log loss", "Brier", "Winners"], true)}</thead><tbody>${s2}</tbody></table></div>
    <h2>Flat 1-unit bets by edge</h2><div class="tablewrap"><table class="bt"><thead>${row(["Edge needed", "Bets", "Won", "Units", "Per bet"], true)}</thead><tbody>${roi}</tbody></table></div>
    ${b.early ? `<h2>Betting at the opening line</h2>
      <p class="note">"Line moved toward": how often the line later moved our way. Above 50% means the market came around to our pick.</p>
      <div class="tablewrap"><table class="bt"><thead>${row(["Edge needed", "Bets", "Won", "Per bet, opening odds", "Per bet, closing odds", "Line moved toward"], true)}</thead><tbody>${
      b.early.map(r => row([pts(r.edge), r.bets_open, r["win_%_open"] == null ? "–" : r["win_%_open"].toFixed(1) + "%", r["roi_%_open"] == null ? "–" : r["roi_%_open"].toFixed(1) + "%",
        r["roi_close_%"] == null ? "–" : r["roi_close_%"].toFixed(1) + "%", r["moved_toward_%"].toFixed(1) + "%"])).join("")}</tbody></table></div>`
      : `<h2>Betting at the opening line</h2><p class="note">Appears once the history backfill has collected opening lines.</p>`}
    ${edges}
    </details>
    <p class="note">Betting lines are sharp and past results don't guarantee future ones.</p>`;
}

// ---------------- router ----------------
let photosLoaded = false;
const SKEL = `<div class="skel" aria-label="Loading"><i class="s-h"></i><i class="s-b"></i><i class="s-b"></i><i class="s-b short"></i></div>`;
async function route() {
  if (!photosLoaded) { photosLoaded = true; const [ph, co, rk, fv] = await Promise.all([get("photos.json"), get("countries.json", true), get("ufc_ranks.json", true),
    fetch("favorites.json?t=" + Date.now()).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch("plans.json?t=" + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null).then(x => { PLANS = x; }),
    fetch("takes.json?t=" + Date.now()).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(x => { TAKES = x || {}; })]);
    if (ph) PHOTOS = ph; if (co) COUNTRY = co; if (rk && rk.fighters) RANK = rk.fighters;
    for (const x of fv || []) FAV[x.slug || slug(x.name)] = x; }
  const [p, qs] = (location.hash.slice(1) || "/").split("?");
  const q = new URLSearchParams(qs || ""), parts = p.split("/").filter(Boolean);
  const page = parts[0] || "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === ({event: "events", fighter: "fighters", movers: "rankings", compare: "rankings", fight: "card"}[page] || page)));
  const views = {home: viewHome, card: viewCard, events: () => viewEvents(q), event: () => viewEvent(parts[1]),
    fighters: () => viewFighters(q), fighter: () => viewFighter(parts[1]), experts: viewExperts,
    rankings: () => viewRankings(q), movers: viewMovers, compare: () => viewCompare(q), fight: () => viewFight(parts[1], parts[2]), pricing: viewPricing, account: viewAccount, record: () => viewRecord(q), how: viewHow, about: viewAbout, terms: viewTerms, privacy: viewPrivacy, credits: viewCredits};
  const skel = setTimeout(() => { $("#view").innerHTML = SKEL; }, 150);   // placeholder if the data is slow
  const html = await (views[page] || viewHome)();
  clearTimeout(skel);
  const keepFocus = document.activeElement && document.activeElement.id === "fsearch";
  $("#view").innerHTML = html;
  const h1 = page !== "home" && $("#view h1");
  if (h1 && !h1.nextElementSibling?.classList.contains("powered") && ["events", "event", "fighters", "fighter", "rankings", "movers", "compare", "record"].includes(page))
    h1.insertAdjacentHTML("afterend", `<p class="powered"><span></span>
      <button class="sharebtn" type="button" aria-label="Share this page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Share</button></p>`);
  // the title and its Share button on one line
  if (h1 && h1.nextElementSibling?.classList.contains("powered") && !h1.parentElement.classList.contains("ptitle")) {
    const t = document.createElement("div"); t.className = "ptitle"; h1.before(t); t.append(h1, h1.nextElementSibling);
  }
  if (keepFocus) { const b = $("#fsearch"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  else if (!qs) window.scrollTo(0, 0);
  liveBar();
  tickClocks();
  const cta = document.querySelector(".hcta");
  if (cta) { const lock = paywallOn() && myPlan() === "free"; cta.textContent = lock ? "Unlock picks" : "This week's picks"; cta.href = lock ? "#/pricing" : "#/card"; }
  let pb = document.getElementById("pvbadge"); const pv = previewPlan();
  if (pv && pv !== "off") { if (!pb) { pb = document.createElement("a"); pb.id = "pvbadge"; pb.href = "#/account"; document.body.appendChild(pb); }
    pb.textContent = "Previewing: " + ({free: "Free visitor", event: "Event Pass", monthly: "Monthly"}[pv] || pv) + " · change"; } else if (pb) pb.remove();
  if (page === "home" && !window.countedUp) { window.countedUp = true; countUp(); }
}

// the main event's chances count up once when the home page first loads
function countUp() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const els = document.querySelectorAll(".faceoff .pc");
  els.forEach(el => {
    const target = parseFloat(el.textContent); if (!(target >= 0)) return;
    const t0 = performance.now(), dur = 900;
    const tick = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * e) + "%"; if (k < 1) requestAnimationFrame(tick); };
    el.textContent = "0%"; requestAnimationFrame(tick);
  });
  const hero = document.querySelector(".hero"); if (hero) hero.classList.add("intro");
}
window.addEventListener("hashchange", () => { const m = document.querySelector(".tabbar .more"); if (m) m.open = false; route(); });
route();

// header search: instant fighter results from the index
(function headerSearch() {
  const box = document.getElementById("hs"), res = document.getElementById("hsr");
  if (!box) return;
  let idx = null, sel = 0, hits = [];
  const fold = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const close = () => { res.hidden = true; };
  const go = x => { if (!x) return; close(); box.value = ""; box.blur(); location.hash = "#/fighter/" + x.slug; };
  const draw = () => {
    res.innerHTML = hits.length ? hits.map((x, i) => `<a href="#/fighter/${esc(x.slug)}" class="${i === sel ? "on" : ""}" data-i="${i}">${photo(x.espn_id, x.name, "sm")}
      <span class="hs-n"><span>${esc(x.name)}${champTag(x.slug)}${favStar(x.slug)}</span><small>${esc(x.weight_class || "")} · ${esc(x.record || "")}</small></span><b>${x.rating ?? ""}</b></a>`).join("")
      : `<div class="hs-none">No fighter by that name</div>`;
    res.hidden = false;
  };
  box.addEventListener("input", async () => {
    const q = fold(box.value.trim());
    if (q.length < 2) return close();
    idx = idx || await get("fighters/index.json") || [];
    const starts = [], has = [];
    for (const x of idx) { const n = fold(x.name); if (n.startsWith(q) || n.split(" ").some(w => w.startsWith(q))) starts.push(x); else if (n.includes(q)) has.push(x); }
    hits = starts.concat(has).slice(0, 8); sel = 0; draw();
  });
  box.addEventListener("keydown", e => {
    if (res.hidden) return;
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, hits.length - 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === "Enter") { go(hits[sel]); e.preventDefault(); }
    else if (e.key === "Escape") close();
  });
  res.addEventListener("click", () => { close(); box.value = ""; });
  document.addEventListener("click", e => { if (!e.target.closest(".hsearch")) close(); });
})();

// share the page: the phone's share sheet where there is one, otherwise copy the link
document.addEventListener("click", async e => {
  const b = e.target.closest(".sharebtn"); if (!b) return;
  const h = document.querySelector("#view h1"), title = (h ? h.textContent.trim() + " · " : "") + "Octagon Edge";
  try { if (navigator.share) { await navigator.share({title, url: location.href}); return; } } catch (err) { if (err && err.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(location.href); } catch (err) {}
  const t = document.createElement("div"); t.className = "lc-toast won"; t.innerHTML = "<b>Link copied</b><small>Paste it anywhere to share this page.</small>";
  document.body.appendChild(t); setTimeout(() => t.classList.add("out"), 2200); setTimeout(() => t.remove(), 2900);
});

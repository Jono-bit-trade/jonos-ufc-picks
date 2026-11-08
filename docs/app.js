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
function lineChart(hist, f) {
  const pts = (hist || []).map(h => ({t: new Date(h.t).getTime(), p: fair(h.a, h.b), a: h.a, b: h.b})).filter(x => x.p != null);
  if (pts.length < 2) return "";
  const W = 560, H = 120, P = {l: 8, r: 8, t: 14, b: 18};
  const lo = Math.min(...pts.map(x => x.p), 0.5) - 0.03, hi = Math.max(...pts.map(x => x.p), 0.5) + 0.03;
  const t0 = pts[0].t, t1 = Math.max(pts.at(-1).t, t0 + 1);
  const X = t => P.l + (t - t0) / (t1 - t0) * (W - P.l - P.r), Y = p => P.t + (hi - p) / (hi - lo) * (H - P.t - P.b);
  const d = pts.map((x, i) => (i ? "L" : "M") + X(x.t).toFixed(1) + " " + Y(x.p).toFixed(1)).join("");
  const area = d + ` L${X(pts.at(-1).t).toFixed(1)} ${Y(lo).toFixed(1)} L${X(t0).toFixed(1)} ${Y(lo).toFixed(1)} Z`;
  const first = pts[0], last = pts.at(-1), day = t => new Date(t).toLocaleDateString(undefined, {month: "short", day: "numeric"});
  const toward = last.p > first.p ? f.a : last.p < first.p ? f.b : null;
  return `<figure class="lchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(f.a)}'s chance by the line moved from ${pct(first.p)} to ${pct(last.p)}">
      <line x1="${P.l}" x2="${W - P.r}" y1="${Y(0.5)}" y2="${Y(0.5)}" class="mid"/>
      <path d="${area}" class="area"/><path d="${d}" class="ln"/>
      <circle cx="${X(first.t)}" cy="${Y(first.p)}" r="3.5" class="dot"/><circle cx="${X(last.t)}" cy="${Y(last.p)}" r="4.5" class="dot now"/>
      <text x="${P.l}" y="${H - 4}">${day(first.t)}</text><text x="${W - P.r}" y="${H - 4}" text-anchor="end">${day(last.t)}</text>
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
  return f.start ? `<div class="status">${new Date(f.start).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}${f.segment ? ", " + esc(f.segment) : ""}</div>` : "";
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
    <p class="note">Each analyst's overall record and units on SplitPicks bouts. <b class="wtag">W</b> marks analysts with a winning record. Shown for reference: expert picks are not used in our chances because they haven't improved them in testing.</p></details>`;
}

// grappling flags (site_data.py): slug -> ["Big grappler", "Grappling defense"]
let GRAP = {};
async function loadGrap() { GRAP = (await get("grappling_flags.json", true)) || {}; }
function grapChips(slug) {
  return (GRAP[slug] || []).map(f => `<span class="gflag ${f === "Big grappler" ? "off" : "def"}" title="${f === "Big grappler"
    ? "Takes fights to the mat: 2.5+ takedowns or 1+ submission attempts per 15 minutes" : "Stops 80%+ of takedowns and rarely gets submitted"}">${f === "Big grappler" ? "Grappler" : "Grappling D"}</span>`).join("");
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
    <div class="xb-s"><span>${e.picks_a}</span><a href="${esc(e.url)}" target="_blank" rel="noopener">via SplitPicks</a><span>${e.picks_b}</span></div>
  </div>`;
}

function bout(f, i, edge) {
  const pa = f.p_a, line = f.market_p_a, m = f.method || {};
  const tag = (debut, rating, rec) => (debut ? "UFC debut" : "EDGE " + rating) + (rec ? ` · ${esc(rec)}` : "");
  let pickHtml;
  const leanTag = f.expert_lean ? `<span class="lean" title="Close fight by the line, and 65%+ of the analysts agree">Expert lean: ${esc(f.expert_lean)}</span>` : "";
  const bestP = f.our_pick ? (f.our_pick === f.a ? f.best_a : f.best_b) : null, cur = f.our_pick ? (f.our_pick === f.a ? f.odds_a : f.odds_b) : null;
  if (f.our_pick) pickHtml = `<span class="pick ours">Our pick${f.our_pick === f.expert_lean && f.our_pick !== f.pick ? " (expert lean)" : ""}: ${esc(f.our_pick)} ${odds(cur)}${f.stake ? ` · ${f.stake}u` : ""}</span>${f.our_pick === f.pick ? `<span class="vtag" title="Also the value pick: our chance beats the line by more than 3 points">Value</span>` : ""}${
    bestP != null && cur != null && (bestP > 0 ? bestP / 100 : 100 / -bestP) > (cur > 0 ? cur / 100 : 100 / -cur) ? `<span class="shop">Best price ${odds(bestP)}</span>` : ""}${leanTag}`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else if (f.pick) pickHtml = `<span class="pick value">Value pick: ${esc(f.pick)} ${odds(f.pick === f.a ? f.odds_a : f.odds_b)}</span>`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else if (leanTag) pickHtml = leanTag;
  else pickHtml = `<div class="nopick">${line == null ? "No betting line yet." : "No bet: the model and the line are within " + Math.round(edge * 100) + " points."}</div>`;
  if (f.our_pick && f.why && f.why.length) pickHtml += `<ul class="why">${f.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
  const moved = f.open_a != null && f.odds_a != null && (f.open_a !== f.odds_a)
    ? `Opened ${odds(f.open_a)} / ${odds(f.open_b)}, now ${odds(f.odds_a)} / ${odds(f.odds_b)}`
    : f.odds_a != null ? `Line ${odds(f.odds_a)} / ${odds(f.odds_b)}` : "";
  const books = f.books ? `${f.books} book${f.books > 1 ? "s" : ""}, best ${odds(f.best_a)} / ${odds(f.best_b)}` : "";
  const pa100 = Math.round(pa * 100);
  // ring: did our pick (or, without one, the model's pick) win?
  const w = f.state === "post" && f.result ? f.result.winner : null;
  const called = f.our_pick || f.model_pick || f.expert_lean || (pa != null ? (pa > 0.5 ? f.a : f.b) : null);
  const ring = w && called ? (called === w ? " ring-won" : " ring-lost") : "";
  return `<article id="bout-${i}" class="bout${i === 0 ? " main" : ""}${f.state === "post" ? " done" : ""}${f.state === "in" ? " is-live" : ""}${ring}">
    ${status(f)}
    <div class="corners">
      <div class="a">${photo(f.a_id, f.a)}<div><div class="name">${fighterLink(f.a, f.a_slug)}</div><div class="meta">${rankOf(f.a_slug)}${flagOf(f.a_slug, true)}${tag(f.debut_a, f.rating_a, f.record_a)}</div>${grapChips(f.a_slug)}</div></div>
      <div class="class">${esc(f.weight_class)}${f.rounds === 5 ? "<br>5 rounds" : ""}${tierTag(f.tier || tierOf(f.p_a))}</div>
      <div class="b"><div><div class="name">${fighterLink(f.b, f.b_slug)}</div><div class="meta">${rankOf(f.b_slug)}${flagOf(f.b_slug, true)}${tag(f.debut_b, f.rating_b, f.record_b)}</div>${grapChips(f.b_slug)}</div>${photo(f.b_id, f.b)}</div>
    </div>
    <div class="pct"><span class="pa">${pa100}%</span><span class="lbl">Model</span><span class="pb">${100 - pa100}%</span></div>
    <div class="bar" role="img" aria-label="Model ${pct(pa)} for ${esc(f.a)}${line != null ? ", line " + pct(line) : ""}">
      <div class="fill" style="width:${pa * 100}%"></div>
      ${line != null ? `<div class="line" style="left:${line * 100}%"></div>` : ""}
    </div>
    <div class="legend"><span>Fair ${odds(f.fair_odds_a)}</span><span class="hide-sm">Line ${line != null ? pct(line) + " / " + pct(1 - line) : "not posted"}</span><span>Fair ${odds(f.fair_odds_b)}</span></div>
    ${expertBar(f.experts, f.a, f.b, f.state === "post" ? f.winner : null)}
    ${pickHtml}
    <details class="moves-d"><summary><span class="moves">${spark(f.line_history || [])}<span>${moved}</span><span>${books}</span></span></summary>${lineChart(f.line_history, f)}</details>
    ${f.splits ? `<div class="splits">DraftKings bettors: ${Math.round(f.splits.handle_a * 100)}% of money, ${Math.round(f.splits.bets_a * 100)}% of bets on ${esc(f.a.split(" ").at(-1))} · ${Math.round(f.splits.handle_b * 100)}% / ${Math.round(f.splits.bets_b * 100)}% on ${esc(f.b.split(" ").at(-1))}${
      Math.abs(f.splits.handle_a - f.splits.bets_a) >= 0.2 ? ` <b class="sharp">Money ≠ bets: bigger bettors on ${esc((f.splits.handle_a > f.splits.bets_a ? f.a : f.b).split(" ").at(-1))}</b>` : ""}</div>` : ""}
    <a class="fx-open" href="${fightLink(i)}">Fight analysis <span>styles, tale of the tape, line movement</span></a>
  </article>`;
}

// ---------------- matchup: tale of the tape ----------------
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
    <table class="l5-t"><tbody>${L.map(z => `<tr>
      <td><span class="fm ${z.result === "NC" ? "D" : z.result}">${z.result === "NC" ? "NC" : z.result}</span></td>
      <td class="l5-o">${fighterLink(z.opp, z.opp_slug)}<small>${esc(z.date)}${z.title ? " · title fight" : ""}</small></td>
      <td class="l5-h">${esc(how(z))}</td>
      <td class="n">${z.odds != null ? odds(z.odds) : "–"}</td>
      <td>${z.odds == null ? "" : z.odds < 0 ? `<span class="fd fav">Favorite</span>` : `<span class="fd dog">Underdog</span>`}</td></tr>`).join("")}</tbody></table></section>`;
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
      model: b.model_pick ? side(b.model_pick.side) : null, lean: b.expert_lean ? side(b.expert_lean) : null};
    back = `<a class="pill" href="#/event/${esc(x)}">← ${esc(e.name)}</a>`; title = e.name; when = dateLong(e.date);
  } else {
    const p = await get("predictions.json", true); const f = p && p.fights[+x];
    if (!f) return `<h1>Fight not found</h1><div class="empty"><a class="pill" href="#/card">This card</a></div>`;
    const w = f.state === "post" && f.result ? f.result.winner : null;
    F = {a: f.a, b: f.b, a_slug: f.a_slug, b_slug: f.b_slug, a_id: f.a_id, b_id: f.b_id, p: f.p_a, line: f.market_p_a, odds_a: f.odds_a, odds_b: f.odds_b,
      wc: f.weight_class, rounds: f.rounds, tier: f.tier || tierOf(f.p_a), ours: f.our_pick, ours_odds: f.our_pick ? (f.our_pick === f.a ? f.odds_a : f.odds_b) : null,
      stake: f.stake, value: f.pick, why: f.why, experts: f.experts, hist: f.line_history, f, winner: w, how: w ? (f.result.detail || "") : "",
      model: f.model_pick, lean: f.expert_lean, start: f.start, state: f.state, status: f.status};
    back = `<a class="pill" href="#/card">← ${esc(p.event)}</a>`; title = p.event; when = f.start ? new Date(f.start).toLocaleString(undefined, {weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : dateLong(p.date);
  }
  const [A, B] = await Promise.all([F.a_slug ? get(`fighters/${F.a_slug}.json`, true) : null, F.b_slug ? get(`fighters/${F.b_slug}.json`, true) : null]);
  const corner = (k) => { const nm = F[k], sl = F[k + "_slug"], P = k === "a" ? A : B, ch = F.p == null ? null : k === "a" ? F.p : 1 - F.p, o = F["odds_" + k];
    return `<a class="lc-corner ${k}${F.ours === nm ? " ours" : ""}${F.winner && F.winner !== nm ? " lostc" : ""}" href="#/fighter/${esc(sl)}">${photo(F[k + "_id"], nm, "xl")}
      <span class="lc-name">${esc(nm)}${champTag(sl)}${favStar(sl)}</span><span class="lc-meta">${rankOf(sl)}${flagOf(sl, true)}</span>
      <span class="fx-rec">${P ? `${esc(P.ufc_record)} UFC · EDGE ${P.rating}` : "UFC debut"}</span>
      <span class="lc-pct">${pct(ch)}</span><span class="lc-odds">${o != null ? odds(o) : "no line"}</span>
      ${F.winner === nm ? `<span class="lc-tag won">Winner</span>` : F.ours === nm ? `<span class="lc-tag ours">Our pick${F.stake ? " · " + F.stake + "u" : ""}</span>` : F.value === nm ? `<span class="lc-tag value">Value pick</span>` : ""}</a>`; };
  const form = P => P && P.fights ? P.fights.filter(z => ["W", "L", "D"].includes(z.result)).slice(0, 5).reverse().map(z => `<span class="fm ${z.result}" title="${esc(z.result)} vs ${esc(z.opp)}, ${esc(z.date)}">${z.result}</span>`).join("") : "";
  const call = F.ours ? `<div class="fx-call ours"><span class="fx-k">Our pick</span><b>${esc(F.ours)} ${odds(F.ours_odds)}</b><span>${F.stake ? F.stake + "u stake · " : ""}${F.ours === F.value ? "beats the line" : F.ours === F.lean ? "expert lean" : ""}</span></div>`
    : F.value ? `<div class="fx-call value"><span class="fx-k">Value pick</span><b>${esc(F.value)} ${odds(F.value === F.a ? F.odds_a : F.odds_b)}</b><span>beats the line, but not a confident enough pick to bet</span></div>`
    : `<div class="fx-call none"><span class="fx-k">No bet</span><b>${F.line == null ? "No line yet" : "Fairly priced"}</b><span>${F.line == null ? "We'll rate it once odds post." : "Our chance and the line are within 3 points."}</span></div>`;
  const mark = nm => F.winner && nm ? (F.winner === nm ? ` <em class="won">✓ won</em>` : ` <em class="lost">✗ lost</em>`) : "";

  const status = F.winner ? `<span class="fx-res">${esc(F.winner)} won${F.how ? " · " + esc(F.how.replace(/^Final\s*-?\s*/i, "")) : ""}</span>` : F.state === "in" ? `<span class="live">Live</span>` : `<span class="fx-when">${esc(when)}</span>`;
  return `<div class="fx-top">${back}</div>
    <h1 class="fx-h1">${esc(F.a)} <span>vs</span> ${esc(F.b)}</h1>
    <p class="fx-sub">${esc(F.wc || "")}${F.rounds === 5 ? " · 5 rounds" : ""} · ${status} ${tierTag(F.tier)}</p>
    <section class="fx-face"><div class="lc-face">${corner("a")}<span class="lc-vs">VS</span>${corner("b")}</div>
      ${F.p != null ? `<div class="lc-bar"><i class="a" style="width:${Math.round(100 * F.p)}%"></i><i class="b"></i>${F.line != null ? `<em style="left:${Math.round(100 * F.line)}%" title="Betting line"></em>` : ""}</div>
      <p class="fx-legend">Big numbers: our chance. White tick: the betting line${F.line != null ? ` (${pct(F.line)} / ${pct(1 - F.line)})` : ""}.</p>` : ""}</section>
    <div class="fx-grid">
      <section class="fx-panel"><h2>${kick("Styles", "gold")}Head to head</h2>
        ${A && A.radar || B && B.radar ? radarDual(A && A.radar, B && B.radar, {name: F.a}, {name: F.b}) + `<p class="note">Percentiles among UFC fighters with fight stats, ${esc(F.a)} first.</p>` : `<p class="note">Style profiles appear once both fighters have three UFC fights with stats.</p>`}</section>
      <section class="fx-panel"><h2>${kick(METHOD, "gold")}Our call</h2>${F.winner && (F.ours || F.value) ? call.replace("</b>", mark(F.ours || F.value) + "</b>") : call}${F.model ? `<div class="fx-model"><span>Model's winner</span><b>${esc(F.model)}${mark(F.model)}</b></div>` : ""}
        ${F.why && F.why.length ? `<ul class="why">${F.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        ${expertBar(F.experts, F.a, F.b, null)}
        ${F.hist ? lineChart(F.hist, F.f) : ""}
      </section>
    </div>
    <h2>${kick("Recent form", "gold")}Last 5 fights</h2>
    <div class="l5grid">${last5(A, F.a, "a")}${last5(B, F.b, "b")}</div>
    <h2>${kick("Tale of the tape", "gold")}Side by side</h2>
    <div class="fx-tape">${tape(A, B, F.rounds)}</div>
    <p class="fx-links"><a class="pill" href="#/compare?a=${esc(F.a_slug)}&b=${esc(F.b_slug)}">Open in Who wins?</a><a class="pill" href="#/fighter/${esc(F.a_slug)}">${esc(F.a)}</a><a class="pill" href="#/fighter/${esc(F.b_slug)}">${esc(F.b)}</a></p>`;
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
  <p class="note">${ga.source === "UFC.com" || gb.source === "UFC.com" ? "Career numbers from each fighter's UFC.com page." : "Full career numbers appear once UFC.com pages are collected (nightly)."} Green marks the better number.</p>
  ${lines.length ? `<h3>Against this kind of opponent</h3><ul class="vslist">${lines.join("")}</ul>
    <p class="note">Styles come from fight stats where we have them (takedowns and control time make a wrestler, submission attempts a grappler, striking volume or KO wins a striker), otherwise from how the fighter wins. Small samples: a 2-1 record says little.</p>` : ""}`;
}

async function viewCard() {
  const [p] = await Promise.all([get("predictions.json", true), loadGrap()]);
  if (!p) return `<div class="empty">No predictions yet: the first scheduled run fills this in.</div>`;
  clearTimeout(window.refresh);
  if (p.fights.some(f => f.state === "in")) window.refresh = setTimeout(route, 120000);   // fight night: refresh every 2 minutes
  $("#updated").textContent = `Data updated ${new Date(p.updated).toLocaleString()} from ${p.card_source}.`;
  if (!p.fights.length) return `<h1>Next card</h1><div class="empty">${esc(p.message || "No bouts listed yet.")}</div>`;
  const mr = await get("model_record.json"), yr = mr && mr.years[0], all = mr && (mr.since || mr.all);
  const track = !mr ? "" : `<div class="rstrip">
    <span><b>Our picks ${esc(yr.year)}</b> ${yr.our_won}/${yr.our_bets} <em class="${yr.our_units >= 0 ? "won" : "lost"}">${units(yr.our_units)}</em></span>
    <span><b>Since ${mr.from || 2020}</b> ${all.our_won}/${all.our_bets} <em class="${all.our_units >= 0 ? "won" : "lost"}">${units(all.our_units)}</em></span>
    <span><b>Winners ${esc(yr.year)}</b> ${yr.pct}%</span>
    <a href="#/record">Full record</a></div>`;
  if (liveOn(p)) window.refresh = setTimeout(route, 120000);
  return `${liveCenter(p)}<h1>${esc(p.event)}</h1>
    <p class="where">${dateLong(p.date)}${p.location ? ", " + esc(p.location) : ""}</p>${track}
    <div class="cardgrid"><div class="cg-main">
    <details class="explain"><summary>How to read this card</summary><p class="note">The bar is the model's chance for each fighter. The white tick is the betting line with the bookmaker's cut removed. The thinner bar shows how the analysts tracked by SplitPicks are picking. "Our pick" is the selective pick: the model beats the line by 3+ points and the fighter is either the betting favorite or 70%+ likely to win (no underdogs longer than +150). In close fights (line 40-60%) where 65%+ of the analysts agree, their side is tagged "Expert lean" and becomes our pick if the model has none. No our pick when both fighters are debuting. The stake (1.5u, 1u or 0.5u) is sized by price; "Best price" shows when one book beats the average line. "Value pick" means it beats the line but is an underdog the model isn't confident in. In a near coin flip (45-55%), the value pick is also the model's winner.</p></details>
    ${cardToggle()}
    ${cardView() === "compact" ? `<div class="compact">${p.fights.map((f, i) => compactRow(f, i, p.edge_threshold)).join("")}</div>`
      : p.fights.map((f, i) => bout(f, i, p.edge_threshold)).join("")}
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
      ${ours.length ? ours.map(x => row(x)).join("") : `<p class="note">No picks yet. They appear as lines and expert picks come in.</p>`}
      ${ours.length ? `<div class="cs-tot"><span>${ours.length} pick${ours.length > 1 ? "s" : ""}</span><b>${Math.round(risk * 10) / 10}u risked</b></div>` : ""}</section>
    ${vals.length ? `<section class="cs-box"><h3>${kick("Underdogs", "teal")}Value picks only</h3>${vals.map(x => row(x, "v")).join("")}
      <p class="small">The model beats the line here but isn't confident enough to make it a pick.</p></section>` : ""}
    <section class="cs-box"><h3>${kick("Confidence", "blue")}On this card</h3>
      ${["High", "Medium", "Low"].map(t => `<div class="cs-tier">${tierTag(t)}<b>${tiers[t]}</b><span>${T && T[t] ? `${T[t].pct}% right since ${mr.from || 2020}` : ""}</span></div>`).join("")}</section>
  </div></aside>`;
}

function cardView() { try { return localStorage.getItem("cardView") || "full"; } catch (e) { return "full"; } }
function setCardView(v) { try { localStorage.setItem("cardView", v); } catch (e) {} route(); }
function cardToggle() {
  const v = cardView();
  return `<div class="viewtoggle" role="group" aria-label="Card view"><button type="button" aria-pressed="${v === "full"}" onclick="setCardView('full')">Full cards</button><button type="button" aria-pressed="${v === "compact"}" onclick="setCardView('compact')">Compact</button></div>`;
}
function compactRow(f, i, edge) {
  const pa = f.p_a, line = f.market_p_a;
  const w = f.state === "post" && f.result ? f.result.winner : null;
  const called = f.our_pick || f.model_pick || f.expert_lean || (pa != null ? (pa > 0.5 ? f.a : f.b) : null);
  const ring = w && called ? (called === w ? " ring-won" : " ring-lost") : "";
  const sideA = pa >= 0.5, last = n => esc(n.split(" ").slice(-1)[0]);
  return `<details id="bout-${i}" class="crow${ring}"><summary>
      <span class="cr-a${sideA ? " fav" : ""}">${esc(f.a)}</span>
      <span class="cr-p"><b class="pa">${pct(pa)}</b><span class="cr-l">${line != null ? "line " + pct(line) : "no line"}</span><b class="pb">${pct(1 - pa)}</b></span>
      <span class="cr-b${!sideA ? " fav" : ""}">${esc(f.b)}</span>
      <span class="cr-pick">${tierTag(f.tier || tierOf(pa), true)}${f.our_pick ? `<span class="mini-ticket">${last(f.our_pick)} ${odds(f.our_pick === f.a ? f.odds_a : f.odds_b)}${f.stake ? " · " + f.stake + "u" : ""}</span>${f.our_pick === f.pick ? `<span class="vtag">Value</span>` : ""}` : f.pick ? `<span class="vtag">Value ${last(f.pick)} ${odds(f.pick === f.a ? f.odds_a : f.odds_b)}</span>` : f.expert_lean ? `<span class="lean">Lean ${last(f.expert_lean)}</span>` : ""}</span>
    </summary>${bout(f, i, edge)}</details>`;
}

// ---------------- this week's picks, units chart, fight-night bar ----------------
const pay = o => o > 0 ? o / 100 : 100 / -o;
function picksStrip(p) {
  const ours = (p.fights || []).filter(f => f.our_pick);
  if (!ours.length) return `<div class="slip empty-slip">No picks yet for this card. Picks appear as lines and expert picks come in during fight week.</div>`;
  return `<div class="slip">${ours.map(f => {
    const o = f.our_pick === f.a ? f.odds_a : f.odds_b, best = f.our_pick === f.a ? f.best_a : f.best_b;
    const opp = f.our_pick === f.a ? f.b : f.a;
    const done = f.state === "post" && f.result && f.result.winner;
    const res = done ? (f.result.winner === f.our_pick ? "won" : "lost") : "";
    return `<a class="ticket ${res}" href="#/card">
      <span class="tk-name">${esc(f.our_pick)}</span>
      <span class="tk-opp">vs ${esc(opp)}</span>
      <span class="tk-row"><b>${odds(o)}</b>${f.stake ? `<b>${f.stake}u</b>` : ""}${tierTag(f.tier || tierOf(f.p_a), true)}${f.our_pick === f.pick ? `<i class="v">Value</i>` : f.expert_lean === f.our_pick ? `<i>Expert lean</i>` : ""}</span>
      ${best != null && o != null && pay(best) > pay(o) ? `<span class="tk-best">Best price ${odds(best)}</span>` : ""}
      ${f.why && f.why.length ? `<span class="tk-why">${esc(f.why[0])}</span>` : ""}
      ${res ? `<span class="tk-res">${res === "won" ? "Won" : "Lost"}</span>` : ""}
    </a>`;
  }).join("")}</div>`;
}

function unitsChart(curve) {
  if (!curve || curve.length < 2) return "";
  const W = 860, H = 220, P = {l: 44, r: 14, t: 14, b: 26};
  const t = d => new Date(d).getTime(), t0 = t(curve[0][0]), t1 = t(curve.at(-1)[0]);
  const ys = curve.flatMap(c => [c[1], c[2]]), lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
  const X = d => P.l + (t(d) - t0) / Math.max(1, t1 - t0) * (W - P.l - P.r), Y = v => P.t + (hi - v) / Math.max(1, hi - lo) * (H - P.t - P.b);
  const path = k => curve.map((c, i) => (i ? "L" : "M") + X(c[0]).toFixed(1) + " " + Y(c[k]).toFixed(1)).join("");
  const years = [...new Set(curve.map(c => c[0].slice(0, 4)))];
  const step = hi - lo > 60 ? 20 : 10, grid = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid.push(v);
  const last = curve.at(-1);
  return `<figure class="uchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Our picks, cumulative units: ${units(last[1])} flat, ${units(last[2])} with suggested stakes">
    ${grid.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? "zero" : "g"}"/><text x="${P.l - 6}" y="${Y(v) + 4}" class="yl">${v > 0 ? "+" : ""}${v}</text>`).join("")}
    ${years.map(y => { const x = X(`${y}-01-01` < curve[0][0] ? curve[0][0] : `${y}-01-01`); return `<line x1="${x}" x2="${x}" y1="${P.t}" y2="${H - P.b}" class="g"/><text x="${x + 3}" y="${H - 8}" class="xl">${y}</text>`; }).join("")}
    <path d="${path(1)}" class="flat"/><path d="${path(2)}" class="staked"/>
  </svg><figcaption><span class="k staked"></span>Suggested stakes ${units(last[2])} <span class="k flat"></span>Flat 1 unit ${units(last[1])}</figcaption></figure>`;
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
    const ch = f.p_a == null ? null : side === "a" ? f.p_a : 1 - f.p_a, o = side === "a" ? f.odds_a : f.odds_b;
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
  const rows = order.filter(x => x.f.our_pick);
  if (!rows.length) return "";
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
  const p = await get("predictions.json", true);
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
async function recapBanner(ev) {
  const e0 = (ev || [])[0];
  if (!e0 || (Date.now() - new Date(e0.date + "T23:59:00")) / 864e5 > 7) return "";
  const e = await get(`events/${e0.slug}.json`);
  if (!e) return "";
  let r = e.record || {};
  // the live record's locked picks for this card, when it has them, so the recap matches the Record page
  const L = await get("ledger.json", true);
  const lr = L && L.rows ? L.rows.filter(g => g.date === e0.date) : [];
  if (lr.length) {
    const o = lr.filter(g => g.our_pick), okp = g => g.winner && g.winner === g.our_pick;
    r = {our_bets: o.length, our_won: o.filter(okp).length, our_staked: Math.round(100 * o.reduce((s, g) => s + (g.our_staked_units || 0), 0)) / 100,
         right: lr.filter(g => g.model_pick === g.winner).length, picks: lr.length};
    let bestL = null;
    for (const g of lr) for (const [pk, od] of [[g.our_pick, g.our_odds], [g.model_pick, g.model_odds], [g.value_pick, g.value_odds]])
      if (pk && pk === g.winner && od != null && (!bestL || od > bestL.odds)) bestL = {name: pk, odds: od};
    if (bestL) { const b = e.bouts.find(b => b.a === bestL.name || b.b === bestL.name);
      return recapHtml(e, r, {...bestL, id: b ? (b.a === bestL.name ? b.a_id : b.b_id) : null}); }
    return recapHtml(e, r, null);
  }
  let best = null;
  for (const b of e.bouts) {
    const op = b.our_pick, mp = b.model_pick;
    for (const [k, pk] of [["our", op], ["model", mp]]) if (pk && pk.right && pk.odds != null && (!best || pk.odds > best.odds))
      best = {name: pk.side === "a" ? b.a : b.b, odds: pk.odds, kind: k, id: pk.side === "a" ? b.a_id : b.b_id};
  }
  return recapHtml(e, r, best);
}
function recapHtml(e, r, best) {
  return `<a class="recap" href="#/event/${esc(e.slug)}">
    <span class="rc-l"><b>Last card</b><span>${esc(e.name)}</span></span>
    ${r.our_bets ? `<span class="rc-s"><b>${r.our_won}-${r.our_bets - r.our_won}</b><span>our picks</span></span><span class="rc-s"><b class="${(r.our_staked ?? r.our_units) >= 0 ? "won" : "lost"}">${units(r.our_staked ?? r.our_units)}</b><span>units</span></span>` : ""}
    <span class="rc-s"><b>${r.right}/${r.picks}</b><span>winners picked</span></span>
    ${best ? `<span class="rc-best">${photo(best.id, best.name, "sm")}<span><small>Best call</small><b>${esc(best.name)} ${odds(best.odds)}</b></span></span>` : ""}
  </a>`;
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
  return `<section class="proof">
    <div class="pf-head"><span class="pf-kick">Powered by ${METHOD}</span>
      <h1>Smarter UFC picks, <em>proven in public.</em></h1>
      <p>Every fight rated, every pick locked before the bell, every result graded. No cherry-picking.</p></div>
    <div class="pf-cards">
      <a class="pf-card c1" href="#/record"><span class="pf-l">Winners picked</span><b>${yr ? yr.pct : s.pct}%</b>
        <span class="pf-s">${yr ? `${yr.right}/${yr.picks} fights in ${esc(yr.year)}` : ""} · ${s.pct}% across ${s.picks.toLocaleString()} since ${mr.from || 2020}</span><span class="pf-go">See the full record →</span></a>
      <a class="pf-card c2" href="#/card"><span class="pf-l">High-confidence picks</span><b>${hi ? hi.pct : "–"}%</b>
        <span class="pf-s">${hi ? `${hi.right.toLocaleString()} of ${hi.picks.toLocaleString()} won since ${mr.from || 2020}, our chance 70%+` : ""}</span><span class="pf-go">This week's card →</span></a>
      <a class="pf-card c3" href="#/record"><span class="pf-l">Our picks</span><b class="${s.our_units >= 0 ? "won" : "lost"}">${units(s.our_units)}</b>
        <span class="pf-s">${s.our_won}/${s.our_bets} won since ${mr.from || 2020}, flat 1u${live ? ` · live record ${live}` : ""}</span><span class="pf-go">Live, locked record →</span></a>
    </div></section>`;
}

async function viewHome() {
  const [p, ev, ex, up] = await Promise.all([get("predictions.json", true), get("events/index.json"), get("experts.json"), get("upcoming.json")]);
  let hero = `<div class="empty">The next card appears here as soon as it's announced.</div>`, picksH = "";
  if (p && p.fights.length && liveOn(p)) {
    hero = liveCenter(p); picksH = `<h2>${kick("This week", "gold")}Our picks</h2>${picksStrip(p)}`;
    clearTimeout(window.refresh); window.refresh = setTimeout(route, 120000);
  } else if (p && p.fights.length) {
    const m = p.fights[0], start = (up || []).find(u => u.date === p.date)?.start || m.start;
    hero = `<section class="hero">
      <div class="when">${kick("Next card", "red")}${dateLong(p.date)}${start ? ` · <b>${countdown(start)}</b>` : ""}</div>
      <h2 class="hero-t">${esc(p.event)}</h2>
      <div class="faceoff">
        <a href="#/fighter/${esc(m.a_slug)}">${photo(m.a_id, m.a, "xl")}<span class="n">${esc(m.a)}</span>${rankOf(m.a_slug)}${flagOf(m.a_slug, true)}<span class="pc a">${pct(m.p_a)}</span><span class="ln">Line ${m.market_p_a != null ? pct(m.market_p_a) + " · " + odds(m.odds_a) : "not posted"}</span></a>
        <span class="vs">VS</span>
        <a href="#/fighter/${esc(m.b_slug)}">${photo(m.b_id, m.b, "xl")}<span class="n">${esc(m.b)}</span>${rankOf(m.b_slug)}${flagOf(m.b_slug, true)}<span class="pc b">${pct(1 - m.p_a)}</span><span class="ln">Line ${m.market_p_a != null ? pct(1 - m.market_p_a) + " · " + odds(m.odds_b) : "not posted"}</span></a>
      </div>
      ${(p.schedule || []).length ? `<div class="tvsched">${p.schedule.map(sg => `<div class="tv"><b>${esc(sg.segment)}</b><span>${new Date(sg.start).toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short"})}</span><small>${sg.bouts} fight${sg.bouts > 1 ? "s" : ""}${sg.tv && sg.tv.length ? " · " + esc(sg.tv.join(", ")) : ""}</small></div>`).join("")}</div>` : ""}
      <div class="legendline">Big number: our chance. Line: the betting line's chance with the bookmaker's cut removed, and the moneyline.</div>
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
  const L = await get("ledger.json", true), recap = p && liveOn(p) ? "" : await recapBanner(ev);
  const firstStart = p && L && p.date === L.from ? ((p.schedule || [])[0] || {}).start || (p.fights[0] || {}).start : null;
  const live = `<h2>${kick("Locked")}Live record</h2>${ledgerBoxes(L, firstStart)}`;
  const record = mr ? `${live}<h2>${kick("Since " + (mr.from || 2020), "blue")}Backtest track record</h2><div class="stats four">${box(yr.year, yr)}</div><div class="stats four">${box("Since " + (mr.from || 2020), mr.since || mr.all)}</div>
    <p class="note">Backtest: every past fight predicted only from earlier fights, at the average sportsbook's closing line. Recalculated when the method improves; the live record above never is. <a href="#/record">Full record</a></p>` : "";
  return `${proofBand(mr, L)}${recap}${hero}
    <div class="homegrid"><div class="hg-main">${picksH}${record}</div>${homeLower(ev, ex, up, p)}</div>`;
}

// the lower half of the home page: recent cards, coming up, top analysts
function homeLower(ev, ex, up, p) {
  const recent = (ev || []).slice(0, 5).map(e => { const r = e.record || {}, u = r.our_staked ?? r.our_units;
    const [t1, t2] = String(e.name).split(/:\s*/);
    return `<a class="rc-mini" href="#/event/${esc(e.slug)}"><span class="rcm-t"><b>${esc(t2 || t1)}</b><small>${esc(e.date)} · model ${r.right ?? "–"}/${r.picks ?? "–"}</small></span>
      ${r.our_bets ? `<span class="rcm-u ${u >= 0 ? "won" : "lost"}"><b>${units(u)}</b><small>picks ${r.our_won}/${r.our_bets}</small></span>` : ""}</a>`; }).join("");
  const next = (up || []).filter(u => !p || u.date !== p.date).slice(0, 4).map(u => {
    const [title, sub] = String(u.name).split(/:\s*/);
    const d = new Date(u.start || u.date + "T12:00:00");
    return `<li class="nx"><span class="nx-d"><b>${d.toLocaleDateString(undefined, {day: "numeric"})}</b><span>${d.toLocaleDateString(undefined, {month: "short"})}</span></span>
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
  const year = q.get("year") || "";
  const years = [...new Set((ev || []).map(e => e.date.slice(0, 4)))].filter(y => y >= RECENT_FROM);
  const keep = e => year === "all" ? true : year === "older" ? e.date < RECENT_FROM : year ? e.date.startsWith(year) : e.date >= RECENT_FROM;
  const list = (ev || []).filter(keep);
  const upcoming = (up || []).map((u, i) => {
    const [title, sub] = String(u.name).split(/:\s*/), d = new Date(u.start || u.date + "T12:00:00");
    const inner = `<span class="nx-d"><b>${d.toLocaleDateString(undefined, {day: "numeric"})}</b><span>${d.toLocaleDateString(undefined, {month: "short"})}</span></span>
      <span class="nx-t"><b>${esc(sub || title)}</b><span>${esc(title)}${u.start ? ", " + d.toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit"}) : ""}${i === 0 ? " · picks are up" : ""}</span></span>`;
    return i === 0 ? `<li class="nx"><a class="nx-a" href="#/card">${inner}</a></li>` : `<li class="nx">${inner}</li>`;
  }).join("");
  const chip = (y, label) => `<a href="#/events${y ? "?year=" + y : ""}" class="${y === year ? "on" : ""}">${label}</a>`;
  return `<h1>Events</h1>
    ${upcoming ? `<h2>Upcoming</h2><ul class="nxl panel">${upcoming}</ul>` : ""}
    <h2>Past cards</h2>
    ${eventsSummary(mr, year)}
    <div class="filters">${chip("", "Since " + RECENT_FROM)}${years.map(y => chip(y, y)).join("")}${chip("older", "Before " + RECENT_FROM)}${chip("all", "All")}</div>
    ${year === "older" ? `<p class="note">Cards before ${RECENT_FROM} are kept for fighter histories, ratings and training, but aren't part of the record: the model had too little history behind it then to grade it fairly.</p>` : ""}
    <div class="evlist">${list.map(e => evRow(e)).join("")}</div>`;
}

function evRow(e) {
  const r = e.record || {}, graded = e.date >= RECENT_FROM && r.picks;
  const ids = e.main_ids || [];
  const [title, sub] = String(e.name).split(/:\s*/);
  return `<a class="evrow" href="#/event/${esc(e.slug)}">
    <span class="ev-ph">${photo(ids[0], e.main_a || "", "md")}${photo(ids[1], e.main_b || "", "md")}</span>
    <span class="ev-t"><b>${esc(title)}</b><span>${sub ? esc(sub) : esc(e.main || "")}</span><span class="small">${dateLong(e.date)}${e.location ? ", " + esc(e.location) : ""}</span></span>
    ${graded ? `<span class="ev-r">${r.our_bets ? `<span class="ev-chip ${(r.our_staked ?? r.our_units) >= 0 ? "won" : "lost"}">${units(r.our_staked ?? r.our_units)}<small>our picks ${r.our_won}/${r.our_bets}</small></span>` : `<span class="ev-chip none">No picks</span>`}
      <span class="small">Model ${r.right}/${r.picks}</span></span>` : ""}
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
  const label = year === "all" ? "Since " + RECENT_FROM : year || "Since " + RECENT_FROM;
  return `<div class="stats">
    <div class="stat key"><b>${r.our_bets ? `${r.our_won}/${r.our_bets}` : "–"}</b><span>${label}: our picks won${r.our_pct ? ` (${r.our_pct}%)` : ""}</span></div>
    <div class="stat key"><b class="${r.our_units >= 0 ? "won" : "lost"}">${r.our_bets ? units(r.our_units) : "–"}</b><span>${label}: our picks units${r.our_bets ? ` (${r.our_roi_pct > 0 ? "+" : ""}${r.our_roi_pct}% per bet)` : ""}</span></div>
    <div class="stat model"><b>${r.right}/${r.picks}</b><span>${label}: fights picked correctly</span></div>
    <div class="stat model"><b>${r.pct}%</b><span>${label}: correct</span></div>
    <div class="stat"><b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b><span>${label}: betting every model winner (${r.roi_pct > 0 ? "+" : ""}${r.roi_pct}% per bet)</span></div>
    <div class="stat"><b>${r.value_bets ? `${r.value_won}/${r.value_bets}` : "–"}</b><span>${label}: value picks won</span></div>
    <div class="stat"><b class="${r.value_units >= 0 ? "won" : "lost"}">${r.value_bets ? units(r.value_units) : "–"}</b><span>${label}: betting value picks${r.value_bets ? ` (${r.value_roi_pct > 0 ? "+" : ""}${r.value_roi_pct}% per bet)` : ""}</span></div>
  </div>
  <p class="note">Each fight predicted by a model trained only on earlier fights. Units are flat 1-unit bets at the average sportsbook's closing moneyline.</p>`;
}

async function viewEvent(s) {
  const [e] = await Promise.all([get(`events/${s}.json`), loadGrap()]);
  if (!e) return `<h1>Card not found</h1><div class="empty">That card isn't in the history. <a href="#/events">See all events</a></div>`;
  const rows = e.bouts.map((b, i) => {
    const won = b.winner === "a" ? b.a : b.winner === "b" ? b.b : null;
    const mp = b.model_pick, vp = b.value_pick;
    const call = !mp ? "" : `${tierTag(mp.tier || tierOf(b.final_p_a), true)}<span class="tick ${mp.right ? "won" : "lost"}">Model${mp.lean ? " (expert lean)" : ""} ${mp.right ? "✓" : "✗"} ${mp.units != null ? units(mp.units) : ""}</span>`;
    const op = b.our_pick;
    const val = (b.expert_lean ? `<span class="lean">Expert lean: ${esc(b.expert_lean === "a" ? b.a : b.b)}</span>` : "") + (op ? `<span class="vpick ours ${op.right ? "won" : "lost"}">Our pick: ${esc(op.side === "a" ? b.a : b.b)} ${odds(op.odds)} ${op.right ? "✓" : "✗"} ${units(op.units)}</span>`
      : !vp ? "" : `<span class="vpick value ${vp.right ? "won" : "lost"}">Value pick: ${esc(vp.side === "a" ? b.a : b.b)} ${odds(vp.odds)} ${vp.right ? "✓" : "✗"} ${units(vp.units)}</span>`);
    const upset = won && b.line_p_a != null && ((b.winner === "a") !== (b.line_p_a > .5)) ? `<span class="news">Upset</span>` : "";
    const side = (n, sl, id, o, mp, w) => `<div class="side ${w ? "w" : ""}">${photo(id, n, "sm")}<div>${fighterLink(n, sl)}${w ? ` <b class="win">Winner</b>` : ""} ${grapChips(sl)}
      <div class="meta">${flagOf(sl, true)}${odds(o)}${mp != null ? ` · model ${pct(mp)}` : ""}</div></div></div>`;
    const graded = op || mp;   // our pick if we made one, otherwise the model's pick
    const ring = graded && graded.right != null ? (graded.right ? " ring-won" : " ring-lost") : "";
    return `<article class="bout slim${i === 0 ? " main" : ""}${ring}">
      <div class="status"><span class="final">${esc(b.weight_class)}</span>${b.finish ? `${esc(b.finish)}${b.round ? `, round ${b.round}` : ""}` : b.winner === "draw" ? "Draw" : b.winner === "nc" ? "No contest" : ""} ${call} ${val} ${upset}</div>
      <div class="pair">${side(b.a, b.a_slug, b.a_id, b.odds_a, b.model_p_a, b.winner === "a")}<span class="vs sm">VS</span>${side(b.b, b.b_slug, b.b_id, b.odds_b, b.model_p_a == null ? null : 1 - b.model_p_a, b.winner === "b")}</div>
      ${expertBar(b.experts, b.a, b.b, b.winner)}
      <a class="fx-open" href="${fightLink(i, s)}">Fight analysis <span>styles and tale of the tape</span></a>
    </article>`;
  }).join("");
  return `<p><a href="#/events">← All events</a></p><h1>${esc(e.name)}</h1>
    <p class="where">${dateLong(e.date)}${e.location ? ", " + esc(e.location) : ""}</p>
    ${e.record && e.record.picks ? `<div class="stats">
      <div class="stat"><b>${e.record.right}/${e.record.picks}</b><span>model winners (${Math.round(e.record.right / e.record.picks * 100)}%)</span></div>
      <div class="stat"><b class="${e.record.units >= 0 ? "won" : "lost"}">${units(e.record.units)}</b><span>betting every model winner</span></div>
      <div class="stat"><b>${e.record.value_bets ? `${e.record.value_won}/${e.record.value_bets}` : "–"}</b><span>value picks won</span></div>
      <div class="stat"><b class="${e.record.value_units >= 0 ? "won" : "lost"}">${e.record.value_bets ? units(e.record.value_units) : "–"}</b><span>betting value picks</span></div>
      <div class="stat"><b>${e.record.our_bets ? `${e.record.our_won}/${e.record.our_bets}` : "–"}</b><span>our picks won</span></div>
      <div class="stat"><b class="${(e.record.our_staked ?? e.record.our_units) >= 0 ? "won" : "lost"}">${e.record.our_bets ? units(e.record.our_staked ?? e.record.our_units) : "–"}</b><span>our picks, suggested stakes</span></div>
      <div class="stat"><b>${e.favorites_right}/${e.record.picks}</b><span>betting favorites won</span></div></div>` : ""}
    ${e.record && e.record.locked ? `<p class="note"><b>Live record:</b> these are the picks locked before each fight, at the price then, the same as the Record page.</p>` : ""}
    <p class="note">"Model" is its chance before the fight, from a model trained only on earlier fights. Winners picked use our final chance (model blended with the line). Units are flat 1-unit bets at the average sportsbook's closing moneyline. Value picks beat the line by 3+ points; our picks also need the fighter to be the favorite or 70%+ likely, and no long underdog, or an expert lean in a close fight, and not both fighters debuting: the same rules as the live card.</p>${rows}`;
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
    <p class="note">${favOnly ? "Your favorite fighters. Add more by telling Claude, or edit docs/favorites.json." : term ? "" : "Active fighters (fought in the last 18 months), best rated first. Search finds everyone."}</p>
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
    const pr = await get("predictions.json", true);
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
  return `<p><a href="#/fighters">← Fighters</a></p>
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
        <p class="note">Each point is a percentile among UFC fighters with fight stats: 90 means better than 90% of them. Defense counts strikes absorbed (fewer is better); durability counts how rarely they've been stopped.</p></div></div>` : ""}
    ${highlightCards(f)}
    <div class="cols">
      <section><h2>How they win (${w})</h2>${by(f.wins_by, w)}</section>
      <section><h2>How they lose (${l})</h2>${by(f.losses_by, l)}</section>
    </div>
    <h2>Career stats</h2>
    ${striking || grappling ? `<p class="note">Bars compare with the ${esc(f.weight_class)} median (the white mark). Green is better than the median, red worse.</p>
      <div class="cols"><section><h3>Striking</h3>${striking}</section><section><h3>Grappling</h3>${grappling}</section></div>
      ${extras.length ? `<div class="fextras">${extras.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}`
      : `<p class="note">Career stats appear once this fighter's UFC.com page is collected (nightly).</p>`}
    <p class="cmp-cta"><a class="btn" href="#/compare?a=${esc(f.slug)}">Compare ${esc(f.name.split(" ")[0])} with another fighter</a></p>
    <h2>Rating over time</h2>${ratingChart(f.rating_history)}
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
    <p class="small">Analyst picks from <a href="${esc(e.source_url)}" target="_blank" rel="noopener">SplitPicks</a>, used with credit. Results graded by Octagon Edge.</p>`;
}

// ---------------- about and photo credits ----------------
async function viewAbout() {
  const mr = await get("model_record.json"), S = mr ? (mr.since || mr.all) : null;
  return `<h1>About Octagon Edge</h1>
    <p class="lede">Octagon Edge is an independent fight-picks project. It predicts every bout on every card, compares that with the betting line, and only calls a pick when the numbers say the line has it wrong.</p>
    <div class="about">
      <section><h2>What you get each week</h2><ul class="dots">
        <li>A chance for every fighter on the card, next to the betting line's</li>
        <li>Our picks: the few fights where we think the price is off, with a suggested stake and the reasons</li>
        <li>Expert consensus, betting splits, line movement and a full tale of the tape for every bout</li>
        <li>Live results on fight night, and a record that's locked once each fight ends</li></ul></section>
      <section><h2>How we keep it honest</h2><ul class="dots">
        <li>Every pick is graded at the average sportsbook's price, never the best one</li>
        <li>The live record can't be edited after a fight; the backtest is labelled as a backtest</li>
        <li>Ideas only make it into the model if they hold up in two separate stretches of years</li>
        <li>No paid picks, no affiliate links, no sportsbook sponsorship</li></ul></section>
    </div>
    ${S ? `<div class="hw-stats"><div><b>${S.our_pct}%</b><span>our picks won, backtest since ${mr.from || 2020}</span></div><div><b class="${S.our_units >= 0 ? "won" : "lost"}">${units(S.our_units)}</b><span>flat 1-unit bets</span></div><div><b>${S.our_bets}</b><span>picks graded</span></div><div><b>7,500+</b><span>UFC fights since 2010 in the data</span></div></div>` : ""}
    <h2>Who's behind it</h2>
    <p class="note">Built and run by Jono, a fight fan who wanted picks backed by numbers rather than hype. The model, the data pipeline and this site update themselves through fight week; the method is laid out in full on <a href="#/how">How it works</a>.</p>
    <h2>Data and credits</h2>
    <p class="note">Results, cards and lines from ESPN; sportsbook prices from The Odds API; expert picks from SplitPicks; career stats from UFC.com; historical fights from the Ultimate UFC Dataset. Freely licensed fighter photos from Wikimedia Commons are credited on the <a href="#/credits">photo credits</a> page. Octagon Edge isn't affiliated with the UFC, ESPN or any sportsbook.</p>
    <p class="note">For fun and research, not betting advice. 21+ where sports betting is legal. If gambling stops being fun, call 1-800-GAMBLER.</p>`;
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
const rkTabs = on => `<div class="filters rk-tabs">${[["divisions", "#/rankings", "UFC divisions"], ["ratings", "#/rankings?view=ratings", "Our ratings"],
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
    <p class="note">${METHOD}s (built on Glicko-2) from every UFC fight since 2010. Active means a UFC fight in the last 18 months. Updated after every card.</p>`;
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
  const opts = `<datalist id="fxlist">${fx.map(x => `<option value="${esc(x.name)}">`).join("")}</datalist>`;
  const box = (k, F) => `<label class="cmp-in ${k}"><span>${k === "a" ? "Red corner" : "Blue corner"}</span>
    <input list="fxlist" data-k="${k}" placeholder="Type a fighter" value="${F ? esc(F.name) : ""}" autocomplete="off"></label>`;
  let body = `<div class="empty">Pick two fighters to see who our ratings favor and how they compare.</div>`;
  if (A && B) {
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
        ${A.weight_class && B.weight_class && A.weight_class !== B.weight_class ? `<br>Different divisions (${esc(A.weight_class)} vs ${esc(B.weight_class)}): size isn't in the rating, so treat this as fun.` : ""}</p>
      <div class="tablewrap"><table class="cmp-t"><thead><tr><th class="ca">${esc(A.name)}</th><th></th><th class="cb">${esc(B.name)}</th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>
      <p class="note">Stats are per UFC fight from ESPN's fight stats. Gold marks the better number.</p>`;
  } else if (A || B) body = `<div class="empty">Now pick the other corner.</div>`;
  setTimeout(() => document.querySelectorAll(".cmp-in input").forEach(i => i.addEventListener("change", () => {
    const hit = fx.find(x => x.name.toLowerCase() === i.value.trim().toLowerCase()); if (!hit) return;
    const p2 = new URLSearchParams({a: sa, b: sb}); p2.set(i.dataset.k, hit.slug);
    location.hash = "#/compare?" + [...p2].filter(([, v]) => v).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&"); })), 0);
  return `<h1>Who wins?</h1>${rkTabs("compare")}<p class="where">Any two fighters, head to head on our ratings.</p>
    <div class="cmp-pick">${box("a", A)}${box("b", B)}</div>${opts}
    ${A && B ? `<p class="cmp-swap"><a href="#/compare?a=${esc(B.slug)}&b=${esc(A.slug)}">Swap corners</a> · <a href="#/compare">Clear</a></p>` : ""}
    ${body}`;
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
  if (view === "divisions") return `<h1>Rankings</h1>${tabs}<p class="note">Official UFC champions and top 5 in each division, with our rating beside each name. Tap a division for our full ratings.</p>${divisionCards(fx)}`;
  return `<h1>Rankings</h1>${tabs}<p class="note">${METHOD}s from every UFC fight since 2010 (built on Glicko-2), active fighters only (fought in the last 18 months). The ± shows how sure the rating is: it shrinks with each fight and grows during layoffs. Divisions use each fighter's latest non-catchweight fight.</p>
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
  const row = r => `<tr><td>${esc(r.year || "All years")}</td><td class="n">${r.right}/${r.picks}</td><td class="n">${pc(r.pct)}</td>
    <td class="n ${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</td><td class="n hide-sm">${pc(r.roi_pct)}</td>
    <td class="n">${r.value_bets ? `${r.value_won}/${r.value_bets}` : "–"}</td><td class="n ${r.value_units >= 0 ? "won" : "lost"}">${r.value_bets ? units(r.value_units) : "–"}</td>
    <td class="n hide-sm">${pc(r.value_roi_pct)}</td>
    <td class="n">${r.our_bets ? `${r.our_won}/${r.our_bets}` : "–"}</td><td class="n ${r.our_units >= 0 ? "won" : "lost"}">${r.our_bets ? units(r.our_units) : "–"}</td></tr>`;
  return `<h2>Model track record by year</h2>
    <p class="note">Flat 1-unit bets at the average sportsbook's closing price, starting ${mr.from || 2020}.</p>
    <div class="recbits">${(mr.periods || []).map(p => `<span>Our picks ${esc(p.label)} <b>${p.our_won}/${p.our_bets}</b> <b class="${p.our_units >= 0 ? "won" : "lost"}">${units(p.our_units)}</b></span>`).join("")}<span>Expert leans <b>${mr.all.lean_won}/${mr.all.lean_bets}</b> <b class="${mr.all.lean_units >= 0 ? "won" : "lost"}">${units(mr.all.lean_units)}</b></span></div>
    <details class="fine"><summary>How it's graded</summary><ul>
      <li><b>Prices:</b> the average of 3+ sportsbooks' closing lines where we have them (most fights from 2019 on), otherwise the one closing line. A better price than average is upside the record doesn't count.</li>
      <li><b>Stakes:</b> 1.5u at -199 or longer, 1u from -200 to -399, 0.5u at -400 or shorter.</li>
      <li><b>Expert leans:</b> close fights where 65%+ of analysts agree and the model has no pick. Tracked since April 2026, included in our picks.</li>
      <li><b>Why 2020:</b> earlier fights still train the model, but there was too little history before then to grade fairly.</li></ul></details>
    <div class="tablewrap"><table><thead><tr><th>Year</th><th class="n">Winners</th><th class="n">Correct</th><th class="n">Units</th><th class="n hide-sm">Per bet</th>
      <th class="n">Value picks</th><th class="n">Value units</th><th class="n hide-sm">Per bet</th><th class="n">Our picks</th><th class="n">Our units</th></tr></thead><tbody>
      ${mr.years.map(row).join("")}${row({...mr.all, year: "Since " + (mr.from || 2020)})}</tbody></table></div>`;
}

const kick = (t, c) => `<span class="kicker${c ? " " + c : ""}">${t}</span>`;
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
  const r1 = x => Math.round(x * 10) / 10, pc = (a, b) => b ? Math.round(100 * a / b) + "%" : "–";
  const tier = t => { const T = R.filter(r => r[1] === t[0]); return `<div class="tf-t t-${t.toLowerCase()}">${tierTag(t, true)}<b>${pc(T.filter(r => r[2]).length, T.length)}</b><span>${T.filter(r => r[2]).length}/${T.length}</span></div>`; };
  const live = R.some(r => r[0] >= rr.live_from), back = R.some(r => r[0] < rr.live_from);
  return `<section class="tframe" id="tframe">
    <div class="tf-head"><h2>${kick("Explore", "blue")}Results by timeframe</h2>
      <div class="filters tf-chips">${ranges.map(([kk, lb]) => `<a href="#/record?tf=${kk}" class="${kk === k ? "on" : ""}" data-tf="${kk}">${esc(lb)}</a>`).join("")}</div></div>
    <div class="stats four tf-stats">
      <div class="stat model"><b>${pc(mw, n)}</b><span>winners picked (${mw}/${n})</span></div>
      <div class="stat key"><b>${ow}/${O.length} <span class="sub ${os >= 0 ? "won" : "lost"}">${units(r1(os))}</span></b><span>our picks at suggested stakes${ok ? ` (${os >= 0 ? "+" : ""}${(100 * os / ok).toFixed(1)}% on ${r1(ok)}u risked)` : ""}</span></div>
      <div class="stat value"><b class="${vu >= 0 ? "won" : "lost"}">${units(r1(vu))}</b><span>value picks, ${vw}/${V.length} won (flat 1u)</span></div>
      <div class="stat model"><b class="${mu >= 0 ? "won" : "lost"}">${units(r1(mu))}</b><span>every model winner (flat 1u)</span></div></div>
    <div class="tf-tiers"><span class="tf-l">By confidence</span>${["High", "Medium", "Low"].map(tier).join("")}</div>
    <p class="note">${n} fights${live && back ? ": the backtest before " + esc(dateLong(rr.live_from)) + ", locked live picks from then on" : live ? ", all from the locked live record" : ", from the backtest at the average closing line"}.</p>
  </section>`;
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

async function viewRecord(q) {
  const [L, mr, rr] = await Promise.all([get("ledger.json", true), get("model_record.json"), get("record_rows.json", true)]);
  const tf = q && q.get("tf") || "ytd";
  const rows = L && L.rows ? L.rows : [];
  return `<h1>Record</h1>
    <h2>Live record, locked</h2>
    <p class="note">Every pick from ${esc(dateLong(L ? L.from : "2026-10-31"))} on, locked before the fight and never changed.</p>
    ${ledgerBoxes(L)}
    ${unitsChart(ledgerCurve(rows))}
    ${timeframePanel(rr, tf)}
    ${tierBoard(L, mr)}
    ${rows.length ? `<h2>Every locked pick</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Fight</th><th class="hide-sm">Conf.</th><th>Our pick</th><th class="n">Odds</th><th class="n">Stake</th><th class="n">Result</th><th class="hide-sm">Value pick</th><th class="hide-sm">Model's winner</th></tr></thead><tbody>${
      rows.map(g => `<tr><td>${esc(g.date)}</td><td>${esc(g.a)} vs ${esc(g.b)}</td><td class="hide-sm">${tierTag(g.tier, true)}</td><td>${g.our_pick ? esc(g.our_pick) + (g.our_source === "experts" ? " (expert lean)" : "") : "–"}</td>
        <td class="n">${g.our_pick ? odds(g.our_odds) : ""}</td><td class="n">${g.stake ? g.stake + "u" : ""}</td>
        <td class="n ${g.our_units > 0 ? "won" : g.our_units < 0 ? "lost" : ""}">${g.our_pick ? (g.our_units > 0 ? "Won " : g.our_units < 0 ? "Lost " : "Push ") + units(g.our_staked_units) : ""}</td>
        <td class="hide-sm ${g.value_pick ? (g.value_pick === g.winner ? "won" : "lost") : ""}">${g.value_pick ? `${esc(g.value_pick)} ${odds(g.value_odds)} ${g.value_pick === g.winner ? "✓" : "✗"}` : "–"}</td>
        <td class="hide-sm ${g.model_pick === g.winner ? "won" : "lost"}">${esc(g.model_pick)} ${g.model_pick === g.winner ? "✓" : "✗"}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <h2>Backtest, ${mr ? mr.from || 2020 : 2020} on</h2>
    ${mr ? unitsChart(mr.curve) : ""}
    <p class="note">What today's method would have picked on every past card, using only earlier fights. A simulation that's updated as the method improves; the live record is the one to judge by.</p>
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
      ${step(4, "Find the value", "Beat the line by 3+ points on a favorite or 70%+ fighter, or experts agree in a close fight: that's a pick, sized by price.")}
    </div>
    ${S ? `<div class="hw-stats">
      <div><b>${S.our_pct}%</b><span>of our picks won since ${mr.from || 2020}</span></div>
      <div><b class="${S.our_units >= 0 ? "won" : "lost"}">${units(S.our_units)}</b><span>flat 1-unit bets, ${S.our_roi_pct > 0 ? "+" : ""}${S.our_roi_pct}% per bet</span></div>
      <div><b>${S.pct}%</b><span>of all fights' winners picked</span></div>
      <div><b>${S.our_bets}</b><span>picks graded at the average sportsbook's price</span></div></div>` : ""}
    <p class="note">Backtest numbers, each fight predicted only from earlier fights. The <a href="#/record">live record</a> starts Oct 31, 2026.</p>
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
    fetch("favorites.json?t=" + Date.now()).then(r => r.ok ? r.json() : []).catch(() => [])]);
    if (ph) PHOTOS = ph; if (co) COUNTRY = co; if (rk && rk.fighters) RANK = rk.fighters;
    for (const x of fv || []) FAV[x.slug || slug(x.name)] = x; }
  const [p, qs] = (location.hash.slice(1) || "/").split("?");
  const q = new URLSearchParams(qs || ""), parts = p.split("/").filter(Boolean);
  const page = parts[0] || "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === ({event: "events", fighter: "fighters", movers: "rankings", compare: "rankings", fight: "card"}[page] || page)));
  const views = {home: viewHome, card: viewCard, events: () => viewEvents(q), event: () => viewEvent(parts[1]),
    fighters: () => viewFighters(q), fighter: () => viewFighter(parts[1]), experts: viewExperts,
    rankings: () => viewRankings(q), movers: viewMovers, compare: () => viewCompare(q), fight: () => viewFight(parts[1], parts[2]), record: () => viewRecord(q), how: viewHow, about: viewAbout, credits: viewCredits};
  const skel = setTimeout(() => { $("#view").innerHTML = SKEL; }, 150);   // placeholder if the data is slow
  const html = await (views[page] || viewHome)();
  clearTimeout(skel);
  const keepFocus = document.activeElement && document.activeElement.id === "fsearch";
  $("#view").innerHTML = html;
  const h1 = page !== "home" && $("#view h1");
  if (h1 && !h1.nextElementSibling?.classList.contains("powered") && ["card", "events", "event", "fighters", "fighter", "rankings", "movers", "compare", "record"].includes(page))
    h1.insertAdjacentHTML("afterend", `<p class="powered"><span>Powered by <b>${METHOD}</b> · every pick locked before the fight</span>
      <button class="sharebtn" type="button" aria-label="Share this page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Share</button></p>`);
  if (keepFocus) { const b = $("#fsearch"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  else if (!qs) window.scrollTo(0, 0);
  liveBar();
  tickClocks();
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

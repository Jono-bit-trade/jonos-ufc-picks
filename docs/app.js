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

// ESPN headshot, with initials when ESPN has no photo
function photo(id, name, size = "md") {
  const ini = esc(String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join(""));
  if (!id) return `<span class="ph ${size}" aria-hidden="true"><span>${ini}</span></span>`;
  return `<span class="ph ${size}"><img loading="lazy" alt="" src="https://a.espncdn.com/i/headshots/mma/players/full/${esc(id)}.png"
    onerror="this.remove()"><span>${ini}</span></span>`;
}
const units = u => u == null ? "–" : (u > 0 ? "+" : u < 0 ? "−" : "") + Math.abs(u).toFixed(1) + "u";
const recLine = r => !r || !r.picks ? "" :
  `Model ${r.right}/${r.picks} (${Math.round(r.right / r.picks * 100)}%)` + (r.our_bets ? ` · our picks ${r.our_won}/${r.our_bets} (${Math.round(r.our_won / r.our_bets * 100)}%) <span class="${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)}</span>` : "");
const fighterLink = (name, s) => `<a class="fl" href="#/fighter/${esc(s || slug(name))}">${esc(name)}</a>`;

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
  const n = e.picks_a + e.picks_b, sa = e.picks_a / n;
  return `<div class="experts">
    <div class="exl"><span>Experts: ${e.picks_a} on ${esc(a.split(" ").at(-1))}</span><span>${e.picks_b} on ${esc(b.split(" ").at(-1))}</span></div>
    <div class="exbar" role="img" aria-label="${e.picks_a} of ${n} analysts picked ${esc(a)}"><i style="width:${sa * 100}%"></i></div>
    <div class="exl small"><span>Winning analysts: ${e.win_a ?? 0}</span><a href="${esc(e.url)}" target="_blank" rel="noopener">Data from SplitPicks</a><span>Winning analysts: ${e.win_b ?? 0}</span></div>
    ${analystList(e, a, b, winner)}
  </div>`;
}

function bout(f, i, edge) {
  const pa = f.p_a, line = f.market_p_a, m = f.method || {};
  const tag = (debut, rating, rec) => (debut ? "UFC debut" : "Rating " + rating) + (rec ? ` · ${esc(rec)}` : "");
  let pickHtml;
  const leanTag = f.expert_lean ? `<span class="lean" title="Close fight by the line, and 65%+ of the analysts agree">Expert lean: ${esc(f.expert_lean)}</span>` : "";
  const bestP = f.our_pick ? (f.our_pick === f.a ? f.best_a : f.best_b) : null, cur = f.our_pick ? (f.our_pick === f.a ? f.odds_a : f.odds_b) : null;
  if (f.our_pick) pickHtml = `<span class="pick ours">Our pick: ${esc(f.our_pick)} ${odds(cur)}${f.stake ? ` · ${f.stake}u` : ""}</span>${
    bestP != null && cur != null && (bestP > 0 ? bestP / 100 : 100 / -bestP) > (cur > 0 ? cur / 100 : 100 / -cur) ? `<span class="shop">Best price ${odds(bestP)}</span>` : ""}${leanTag}`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else if (f.pick) pickHtml = `<span class="pick">Value pick: ${esc(f.pick)} ${odds(f.pick === f.a ? f.odds_a : f.odds_b)}</span>`
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
  const called = f.our_pick || f.expert_lean || (pa != null ? (pa > 0.5 ? f.a : f.b) : null);
  const ring = w && called ? (called === w ? " ring-won" : " ring-lost") : "";
  return `<article class="bout${i === 0 ? " main" : ""}${f.state === "post" ? " done" : ""}${ring}">
    ${status(f)}
    <div class="corners">
      <div class="a">${photo(f.a_id, f.a)}<div><div class="name">${fighterLink(f.a, f.a_slug)}</div><div class="meta">${tag(f.debut_a, f.rating_a, f.record_a)}</div>${grapChips(f.a_slug)}</div></div>
      <div class="class">${esc(f.weight_class)}${f.rounds === 5 ? "<br>5 rounds" : ""}</div>
      <div class="b"><div><div class="name">${fighterLink(f.b, f.b_slug)}</div><div class="meta">${tag(f.debut_b, f.rating_b, f.record_b)}</div>${grapChips(f.b_slug)}</div>${photo(f.b_id, f.b)}</div>
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
    ${tapeToggle(f.a_slug, f.b_slug, f.rounds)}
  </article>`;
}

// ---------------- matchup: tale of the tape ----------------
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
  return `<h1>${esc(p.event)}</h1>
    <p class="where">${dateLong(p.date)}${p.location ? ", " + esc(p.location) : ""}</p>${track}
    <details class="explain"><summary>How to read this card</summary><p class="note">The bar is the model's chance for each fighter. The white tick is the betting line with the bookmaker's cut removed. The thinner bar shows how the analysts tracked by SplitPicks are picking. "Our pick" is the selective pick: the model beats the line by 3+ points and the fighter is either the betting favorite or 70%+ likely to win (no underdogs longer than +150). In close fights (line 40-60%) where 65%+ of the analysts agree, their side is tagged "Expert lean" and becomes our pick if the model has none. No our pick when both fighters are debuting. The stake (1.5u, 1u or 0.5u) is sized by price; "Best price" shows when one book beats the average line. "Value pick" means it beats the line but is an underdog the model isn't confident in.</p></details>
    ${cardToggle()}
    ${cardView() === "compact" ? `<div class="compact">${p.fights.map((f, i) => compactRow(f, i, p.edge_threshold)).join("")}</div>`
      : p.fights.map((f, i) => bout(f, i, p.edge_threshold)).join("")}`;
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
  const called = f.our_pick || f.expert_lean || (pa != null ? (pa > 0.5 ? f.a : f.b) : null);
  const ring = w && called ? (called === w ? " ring-won" : " ring-lost") : "";
  const sideA = pa >= 0.5, last = n => esc(n.split(" ").slice(-1)[0]);
  return `<details class="crow${ring}"><summary>
      <span class="cr-a${sideA ? " fav" : ""}">${esc(f.a)}</span>
      <span class="cr-p"><b class="pa">${pct(pa)}</b><span class="cr-l">${line != null ? "line " + pct(line) : "no line"}</span><b class="pb">${pct(1 - pa)}</b></span>
      <span class="cr-b${!sideA ? " fav" : ""}">${esc(f.b)}</span>
      <span class="cr-pick">${f.our_pick ? `<span class="mini-ticket">${last(f.our_pick)} ${odds(f.our_pick === f.a ? f.odds_a : f.odds_b)}${f.stake ? " · " + f.stake + "u" : ""}</span>` : f.expert_lean ? `<span class="lean">Lean ${last(f.expert_lean)}</span>` : ""}</span>
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
      <span class="tk-row"><b>${odds(o)}</b>${f.stake ? `<b>${f.stake}u</b>` : ""}${f.expert_lean === f.our_pick ? `<i>Expert lean</i>` : ""}</span>
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
  const r = e.record || {};
  let best = null;
  for (const b of e.bouts) {
    const op = b.our_pick, mp = b.model_pick;
    for (const [k, pk] of [["our", op], ["model", mp]]) if (pk && pk.right && pk.odds != null && (!best || pk.odds > best.odds))
      best = {name: pk.side === "a" ? b.a : b.b, odds: pk.odds, kind: k, id: pk.side === "a" ? b.a_id : b.b_id};
  }
  return `<a class="recap" href="#/event/${esc(e.slug)}">
    <span class="rc-l"><b>Last card</b><span>${esc(e.name)}</span></span>
    ${r.our_bets ? `<span class="rc-s"><b>${r.our_won}-${r.our_bets - r.our_won}</b><span>our picks</span></span><span class="rc-s"><b class="${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)}</b><span>units</span></span>` : ""}
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

async function viewHome() {
  const [p, ev, ex, up] = await Promise.all([get("predictions.json", true), get("events/index.json"), get("experts.json"), get("upcoming.json")]);
  let hero = `<div class="empty">The next card appears here as soon as it's announced.</div>`;
  if (p && p.fights.length) {
    const m = p.fights[0], start = (up || []).find(u => u.date === p.date)?.start || m.start;
    hero = `<section class="hero">
      <div class="when">${dateLong(p.date)}${start ? ` · <b>${countdown(start)}</b>` : ""}</div>
      <h1>${esc(p.event)}</h1>
      <div class="faceoff">
        <a href="#/fighter/${esc(m.a_slug)}">${photo(m.a_id, m.a, "xl")}<span class="n">${esc(m.a)}</span><span class="pc a">${pct(m.p_a)}</span><span class="ln">Line ${m.market_p_a != null ? pct(m.market_p_a) + " · " + odds(m.odds_a) : "not posted"}</span></a>
        <span class="vs">VS</span>
        <a href="#/fighter/${esc(m.b_slug)}">${photo(m.b_id, m.b, "xl")}<span class="n">${esc(m.b)}</span><span class="pc b">${pct(1 - m.p_a)}</span><span class="ln">Line ${m.market_p_a != null ? pct(1 - m.market_p_a) + " · " + odds(m.odds_b) : "not posted"}</span></a>
      </div>
      ${(p.schedule || []).length ? `<div class="tvsched">${p.schedule.map(sg => `<div class="tv"><b>${esc(sg.segment)}</b><span>${new Date(sg.start).toLocaleString(undefined, {weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short"})}</span><small>${sg.bouts} fight${sg.bouts > 1 ? "s" : ""}${sg.tv && sg.tv.length ? " · " + esc(sg.tv.join(", ")) : ""}</small></div>`).join("")}</div>` : ""}
      <div class="legendline">Big number: our chance. Line: the betting line's chance with the bookmaker's cut removed, and the moneyline.</div>
      <a class="btn" href="#/card">See all ${p.fights.length} bouts, picks and expert splits</a>
    </section>
    <h2>This week's picks</h2>${picksStrip(p)}`;
  }
  const past = (ev || []).slice(0, 6).map(e => `<li><a href="#/event/${esc(e.slug)}"><span class="d">${esc(e.date)}</span>${esc(e.name)}</a>
    <span class="small">${recLine(e.record)}</span></li>`).join("");
  const top = ex ? ex.analysts.slice(0, 3).map((a, i) => `<li><span class="rk">${i + 1}</span>${esc(a.analyst)}<span class="small">${a.win_pct}% · ${a.won}-${a.bets - a.won} · ${a.roi_pct > 0 ? "+" : ""}${a.roi_pct}% per bet</span></li>`).join("") : "";
  const mr = await get("model_record.json");
  const yr = mr && mr.years[0], box = (label, r) => !r ? "" : `<div class="stat key"><b>${r.our_won}/${r.our_bets} <span class="${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)} (${r.our_roi_pct > 0 ? "+" : ""}${r.our_roi_pct}%)</span></b><span>${label}: our picks, ${r.our_pct}% won${r.our_risked ? `. Suggested stakes: <b class="${r.our_staked_units >= 0 ? "won" : "lost"}">${units(r.our_staked_units)} (${r.our_staked_units >= 0 ? "+" : ""}${(100 * r.our_staked_units / r.our_risked).toFixed(1)}%)</b> on ${r.our_risked}u risked` : ""}</span></div>
    <div class="stat"><b>${r.pct}%</b><span>${label}: winners picked (${r.right}/${r.picks})</span></div>
    <div class="stat"><b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b><span>${label}: betting every model winner</span></div>
    <div class="stat"><b class="${r.value_units >= 0 ? "won" : "lost"}">${units(r.value_units)}</b><span>${label}: value picks (${r.value_won}/${r.value_bets})</span></div>`;
  const L = await get("ledger.json", true), recap = await recapBanner(ev);
  const live = `<h2>Live record (locked)</h2>${ledgerBoxes(L)}`;
  const record = mr ? `${live}<h2>Backtest track record</h2><div class="stats">${box(yr.year, yr)}${box("Since " + (mr.from || 2020), mr.since || mr.all)}</div>
    <p class="note">Backtest: every past fight predicted only from earlier fights, at the average sportsbook's closing line. Recalculated when the method improves; the live record above never is. <a href="#/record">Full record</a></p>` : "";
  return `${recap}${hero}${record}
    ${homeLower(ev, ex, up, p)}`;
}

// the lower half of the home page: recent cards, coming up, top analysts
function homeLower(ev, ex, up, p) {
  const recent = (ev || []).slice(0, 4).map(evRow).join("");
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
  return `<div class="lower">
    <section class="lw-main"><div class="lw-h"><h2>Recent cards</h2><a href="#/events">All events</a></div><div class="evlist">${recent}</div></section>
    <aside class="lw-side">
      ${next ? `<section class="panel"><div class="lw-h"><h2>Coming up</h2><a href="#/events">Schedule</a></div><ul class="nxl">${next}</ul></section>` : ""}
      <section class="panel"><div class="lw-h"><h2>Top analysts</h2><a href="#/experts">Leaderboard</a></div>
        ${top ? `<ul class="tal">${top}</ul><p class="small">Units betting each analyst's picks at the posted odds, from SplitPicks.</p>` : `<p class="note">Appears once expert picks are collected.</p>`}</section>
    </aside></div>`;
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
    ${graded ? `<span class="ev-r">${r.our_bets ? `<span class="ev-chip ${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)}<small>our picks ${r.our_won}/${r.our_bets}</small></span>` : `<span class="ev-chip none">No picks</span>`}
      <span class="small">Model ${r.right}/${r.picks}</span></span>` : ""}
  </a>`;
}

function cardBadge(r, date) {
  if (!r || !r.picks || (date && date < RECENT_FROM)) return "";
  return `<span class="cbadge"><b>${r.right}/${r.picks}</b> correct · <b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b>${
    r.our_bets ? ` · our picks ${r.our_won}/${r.our_bets} <b class="${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)}</b>` : ""}</span>`;
}

function eventsSummary(mr, year) {
  if (!mr) return "";
  const r = year === "all" ? mr.all : year === "older" ? null : year ? mr.years.find(y => y.year === year) : (mr.since || mr.all);
  if (!r) return "";
  const label = year === "all" ? "Since " + RECENT_FROM : year || "Since " + RECENT_FROM;
  return `<div class="stats">
    <div class="stat key"><b>${r.our_bets ? `${r.our_won}/${r.our_bets}` : "–"}</b><span>${label}: our picks won${r.our_pct ? ` (${r.our_pct}%)` : ""}</span></div>
    <div class="stat key"><b class="${r.our_units >= 0 ? "won" : "lost"}">${r.our_bets ? units(r.our_units) : "–"}</b><span>${label}: our picks units${r.our_bets ? ` (${r.our_roi_pct > 0 ? "+" : ""}${r.our_roi_pct}% per bet)` : ""}</span></div>
    <div class="stat"><b>${r.right}/${r.picks}</b><span>${label}: fights picked correctly</span></div>
    <div class="stat"><b>${r.pct}%</b><span>${label}: correct</span></div>
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
    const call = !mp ? "" : `<span class="tick ${mp.right ? "won" : "lost"}">Model${mp.lean ? " (expert lean)" : ""} ${mp.right ? "✓" : "✗"} ${mp.units != null ? units(mp.units) : ""}</span>`;
    const op = b.our_pick;
    const val = (b.expert_lean ? `<span class="lean">Expert lean: ${esc(b.expert_lean === "a" ? b.a : b.b)}</span>` : "") + (op ? `<span class="vpick ours ${op.right ? "won" : "lost"}">Our pick: ${esc(op.side === "a" ? b.a : b.b)} ${odds(op.odds)} ${op.right ? "✓" : "✗"} ${units(op.units)}</span>`
      : !vp ? "" : `<span class="vpick ${vp.right ? "won" : "lost"}">Value pick: ${esc(vp.side === "a" ? b.a : b.b)} ${odds(vp.odds)} ${vp.right ? "✓" : "✗"} ${units(vp.units)}</span>`);
    const upset = won && b.line_p_a != null && ((b.winner === "a") !== (b.line_p_a > .5)) ? `<span class="news">Upset</span>` : "";
    const side = (n, sl, id, o, mp, w) => `<div class="side ${w ? "w" : ""}">${photo(id, n, "sm")}<div>${fighterLink(n, sl)}${w ? ` <b class="win">Winner</b>` : ""} ${grapChips(sl)}
      <div class="meta">${odds(o)}${mp != null ? ` · model ${pct(mp)}` : ""}</div></div></div>`;
    const graded = op || mp;   // our pick if we made one, otherwise the model's pick
    const ring = graded && graded.right != null ? (graded.right ? " ring-won" : " ring-lost") : "";
    return `<article class="bout slim${i === 0 ? " main" : ""}${ring}">
      <div class="status"><span class="final">${esc(b.weight_class)}</span>${b.finish ? `${esc(b.finish)}${b.round ? `, round ${b.round}` : ""}` : b.winner === "draw" ? "Draw" : b.winner === "nc" ? "No contest" : ""} ${call} ${val} ${upset}</div>
      <div class="pair">${side(b.a, b.a_slug, b.a_id, b.odds_a, b.model_p_a, b.winner === "a")}<span class="vs sm">VS</span>${side(b.b, b.b_slug, b.b_id, b.odds_b, b.model_p_a == null ? null : 1 - b.model_p_a, b.winner === "b")}</div>
      ${expertBar(b.experts, b.a, b.b, b.winner)}
      ${tapeToggle(b.a_slug, b.b_slug, b.rounds)}
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
      <div class="stat"><b class="${e.record.our_units >= 0 ? "won" : "lost"}">${e.record.our_bets ? units(e.record.our_units) : "–"}</b><span>our picks units</span></div>
      <div class="stat"><b>${e.favorites_right}/${e.record.picks}</b><span>betting favorites won</span></div></div>` : ""}
    <p class="note">"Model" is its chance before the fight, from a model trained only on earlier fights. Winners picked use our final chance (model blended with the line). Units are flat 1-unit bets at the average sportsbook's closing moneyline. Value picks beat the line by 3+ points; our picks also need the fighter to be the favorite or 70%+ likely, and no long underdog, or an expert lean in a close fight, and not both fighters debuting: the same rules as the live card.</p>${rows}`;
}

// ---------------- fighters ----------------
async function viewFighters(q) {
  const idx = await get("fighters/index.json");
  if (!idx) return `<div class="empty">Fighter profiles appear after the next run.</div>`;
  const term = (q.get("q") || "").toLowerCase(), div = q.get("div") || "";
  const active = q.get("all") ? "" : new Date(Date.now() - 550 * 864e5).toISOString().slice(0, 10);
  const divs = [...new Set(idx.map(f => f.weight_class).filter(Boolean))].sort();
  const list = idx.filter(f => (!term || f.name.toLowerCase().includes(term)) && (!div || f.weight_class === div) && (term || !active || f.last_fight >= active));
  setTimeout(() => {
    const box = $("#fsearch");
    if (box) box.oninput = () => { location.hash = `#/fighters?q=${encodeURIComponent(box.value)}${div ? "&div=" + encodeURIComponent(div) : ""}`; };
  });
  return `<h1>Fighters</h1>
    <div class="filters"><input id="fsearch" type="search" placeholder="Search any fighter since 2010" value="${esc(q.get("q") || "")}" aria-label="Search fighters">
      <select onchange="location.hash='#/fighters?div='+encodeURIComponent(this.value)" aria-label="Division"><option value="">All divisions</option>${divs.map(d => `<option ${d === div ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
    <p class="note">${term ? "" : "Active fighters (fought in the last 18 months), best rated first. Search finds everyone."}</p>
    <div class="grid">${list.slice(0, 120).map(f => `<a class="fcard" href="#/fighter/${esc(f.slug)}">${photo(f.espn_id, f.name, "md")}<div><b>${esc(f.name)}</b>
      <span class="small">${esc(f.record)} · ${esc(f.weight_class)}</span><span class="small">Rating ${f.rating}</span></div></a>`).join("")}</div>
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

async function viewFighter(s) {
  const [f, avgs] = await Promise.all([get(`fighters/${s}.json`), get("division_avg.json")]);
  if (!f) return `<h1>Fighter not found</h1><div class="empty">We don't have UFC fights for that fighter yet. Debut fighters get a page after their first UFC fight.<br><a href="#/fighters">Search all fighters</a></div>`;
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
      ${photo(f.espn_id, f.name, "xl")}
      <div class="fh-main">
        <h1>${esc(f.name)}</h1>
        <p class="fh-sub">${esc(f.weight_class)}${f.stance ? ", " + esc(f.stance) : ""}${f.age ? `, age ${f.age}` : ""}${f.height_cm ? `, ${cm(f.height_cm)}` : ""}${f.reach_cm ? `, ${inch(f.reach_cm)} reach` : ""}</p>
        ${g.birthplace || g.trains_at ? `<p class="fh-sub small">${g.birthplace ? "From " + esc(g.birthplace) : ""}${g.birthplace && g.trains_at ? ". " : ""}${g.trains_at ? "Trains at " + esc(g.trains_at) : ""}${g.fighting_style ? ". " + esc(g.fighting_style) : ""}</p>` : ""}
        <div class="fchips">
          ${chip(esc(f.ufc_record), "UFC record")}${f.pro_record ? chip(esc(f.pro_record), "Pro record") : ""}
          ${chip(f.rating ?? "–", `Rating, peak ${f.peak_rating ?? "–"}`)}
          ${chip(f.streak > 0 ? "W" + f.streak : f.streak < 0 ? "L" + -f.streak : "–", "Streak")}
          ${chip(f.finish_rate != null ? p2(f.finish_rate) : "–", "Finish rate")}
        </div>
        ${recent.length ? `<div class="form" aria-label="Last ${recent.length} fights, oldest first">${recent.map(x => `<a href="#/event/${esc(x.event_slug)}" class="fm ${x.result}" title="${esc(x.result)} vs ${esc(x.opp)}, ${esc(x.date)}">${x.result}</a>`).join("")}<span class="small">last ${recent.length}, oldest first</span></div>` : ""}
        ${g.flags && g.flags.length ? `<ul class="gflags">${g.flags.map(x => `<li><span class="gflag ${x.flag === "Big grappler" ? "off" : "def"}">${esc(x.flag)}</span> ${esc(x.why)}</li>`).join("")}</ul>` : ""}
      </div>
    </section>
    <div class="cols">
      <section><h2>How they win (${w})</h2>${by(f.wins_by, w)}</section>
      <section><h2>How they lose (${l})</h2>${by(f.losses_by, l)}</section>
    </div>
    <h2>Career stats</h2>
    ${striking || grappling ? `<p class="note">Bars compare with the ${esc(f.weight_class)} median (the white mark). Green is better than the median, red worse.</p>
      <div class="cols"><section><h3>Striking</h3>${striking}</section><section><h3>Grappling</h3>${grappling}</section></div>
      ${extras.length ? `<div class="fextras">${extras.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}`
      : `<p class="note">Career stats appear once this fighter's UFC.com page is collected (nightly).</p>`}
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
  const [e, mt, pr] = await Promise.all([get("experts.json"), get("model_test.json"), get("predictions.json", true)]);
  if (!e) return `<h1>Experts</h1><div class="empty">Expert picks appear after the next run collects them.</div>`;
  const t = e.test, r = x => x.roi_pct == null ? "–" : (x.roi_pct > 0 ? "+" : "") + x.roi_pct + "%";
  return `<h1>Experts</h1>
    <p class="note">Picks from ${e.analysts.length} analysts tracked by <a href="${esc(e.source_url)}" target="_blank" rel="noopener">SplitPicks</a>, ${esc(e.first)} to ${esc(e.last)}, graded at the lines SplitPicks shows.</p>
    <div class="callout"><b>${t.helps ? "Expert consensus added something beyond the line." : "So far, expert consensus doesn't add anything beyond the betting line."}</b>
      Across ${t.bouts} bouts on ${t.cards} cards, the consensus pick won ${e.consensus.win_pct}% of the time and the betting favorite won ${e.favorites.won_pct}%.
      Adding the consensus to the line ${t.helps ? "lowered" : "didn't lower"} the prediction error (log loss ${t.log_loss_line_refit} → ${t.log_loss_line_plus_experts}, tested one card at a time on cards it didn't learn from).
      The test reruns as more cards come in.</div>
    <div class="cols">
      <section><h2>Betting the consensus</h2><table><tbody>
        <tr><td>Every consensus pick</td><td class="n">${e.consensus.won}-${e.consensus.bets - e.consensus.won}</td><td class="n">${r(e.consensus)}</td></tr>
        <tr><td>Consensus on the underdog</td><td class="n">${e.against_the_line.won}-${e.against_the_line.bets - e.against_the_line.won}</td><td class="n">${r(e.against_the_line)}</td></tr>
        ${e.by_strength.map(s => `<tr><td>${esc(s.consensus)}</td><td class="n">${s.won}-${s.bets - s.won}</td><td class="n">${r(s)}</td></tr>`).join("")}
      </tbody></table><p class="note">Return per 1-unit bet at the posted odds.</p></section>
      <section><h2>What the line expected</h2><table><tbody>${e.by_strength.map(s => `<tr><td>${esc(s.consensus)}</td><td class="n">won ${s.bets ? Math.round(s.won / s.bets * 100) : "–"}%</td><td class="n">line said ${s.line_expected_pct ?? "–"}%</td></tr>`).join("")}</tbody></table>
      <p class="note">When the experts' pick wins more often than the line expected, the experts are adding something.</p></section>
    </div>
    ${mt ? `<h2>Head to head on the same ${mt.bouts} bouts</h2>
      <p class="note">${mt.cards} cards, ${esc(mt.first)} to ${esc(mt.last)}, each predicted using only earlier cards. Lower log loss means better-calibrated chances.</p>
      <div class="tablewrap"><table><thead><tr><th>Prediction</th><th class="n">Correct</th><th class="n">Units</th><th class="n hide-sm">Log loss</th><th class="n">Value bets</th><th class="n">Value units</th></tr></thead><tbody>
      ${mt.results.map(r => `<tr class="${r.prediction === mt.chosen ? "chosen" : ""}"><td>${esc(r.prediction)}</td><td class="n">${r.correct}/${r.bouts} (${r.pct}%)</td>
        <td class="n ${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</td><td class="n hide-sm">${r.log_loss.toFixed(3)}</td>
        <td class="n">${r.value_bets ? `${r.value_won}/${r.value_bets}` : "–"}</td><td class="n ${r.value_units >= 0 ? "won" : "lost"}">${r.value_bets ? units(r.value_units) : "–"}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">Used on the site: <b>${esc(mt.chosen)}</b>. ${mt.uses_experts ? "Expert picks are part of it." : "Adding expert picks didn't improve it, so they're shown for reference but not used in our chances."}
      Analysts with a winning record (a profit betting their picks, ${20}+ picks): <b>${esc(mt.winning_analysts.join(", ") || "none yet")}</b>. Everyone else is left out of the "winning analysts" count.</p>` : ""}
    <h2>Analyst leaderboard</h2>
    ${(() => {
      const win = new Set(mt ? mt.winning_analysts : []);
      const week = {};   // each analyst's picks on the upcoming card
      for (const f of (pr && pr.fights) || []) for (const x of (f.experts && f.experts.analysts) || []) {
        (week[x.name] = week[x.name] || []).push({who: x.side === "a" ? f.a : f.b, conf: x.conf});
      }
      const maxU = Math.max(1, ...e.analysts.map(a => Math.abs(a.units)));
      return `<div class="lb">${e.analysts.map((a, i) => {
        const w = week[a.analyst] || [];
        return `<details class="lbrow ${win.has(a.analyst) ? "winning" : ""}"><summary>
          <span class="lb-rk">${i + 1}</span>
          <span class="lb-nm">${esc(a.analyst)}${win.has(a.analyst) ? ` <b class="wtag">Winning record</b>` : ""}<small>${a.won}-${a.bets - a.won}, ${a.win_pct}% won${a.high_confidence.bets ? `, high confidence ${a.high_confidence.won}-${a.high_confidence.bets - a.high_confidence.won}` : ""}</small></span>
          <span class="lb-bar"><span class="track"><i style="width:${a.win_pct}%"></i><em style="left:50%"></em></span><small>Win %</small></span>
          <span class="lb-u ${a.units >= 0 ? "won" : "lost"}"><b>${units(a.units)}</b><span class="ub"><i class="${a.units >= 0 ? "pos" : "neg"}" style="width:${Math.abs(a.units) / maxU * 50}%"></i></span><small>${r(a)} per bet</small></span>
        </summary>
        <div class="lb-week">${w.length ? `<b>This week (${w.length} picks):</b> ${w.map(x => `${esc(x.who)}${x.conf ? ` <i class="conf c-${esc(x.conf.toLowerCase())}">${esc(x.conf)}</i>` : ""}`).join(" · ")}` : "No picks posted for this week's card yet."}</div></details>`;
      }).join("")}</div>`;
    })()}
    <p class="note">A few hundred picks is a small sample: a leaderboard this short-term is mostly luck. Watch whether the leaders hold up.</p>`;
}

// ---------------- rankings, record, how it works ----------------
async function viewRankings(q) {
  const [r, fx] = await Promise.all([get("ratings.json", true), get("fighters/index.json")]);
  const ix = {}; (fx || []).forEach(x => { ix[x.name] = x; });
  if (!r) return `<div class="empty">Rankings appear after the first run.</div>`;
  const div = q && q.get("div") || "";
  const d = (r.divisions || []).find(x => x.division === div);
  const list = d ? d.fighters : r.fighters;
  const chip = (v, label) => `<a href="#/rankings${v ? "?div=" + encodeURIComponent(v) : ""}" class="${v === div ? "on" : ""}">${esc(label)}</a>`;
  return `<h1>Rankings</h1><p class="note">Glicko-2 ratings from every UFC fight since 2010, active fighters only (fought in the last 18 months). The ± shows how sure the rating is: it shrinks with each fight and grows during layoffs. Divisions use each fighter's latest non-catchweight fight.</p>
    <div class="filters">${chip("", "Pound for pound")}${(r.divisions || []).map(x => chip(x.division, x.division.replace("Women's ", "W ").replace("Light Heavyweight", "Light Heavy"))).join("")}</div>
    <h2>${esc(d ? d.division : "Pound for pound")}</h2>
    <div class="tablewrap"><table><thead><tr><th class="n">#</th><th>Fighter</th>${d ? "" : `<th class="hide-sm">Division</th>`}<th class="n">UFC record</th><th>Rating</th><th class="n hide-sm">±</th><th class="n hide-sm">Last fight</th></tr></thead><tbody>
    ${list.map((f, i) => { const x = ix[f.fighter] || {}, lo = 1500, hi = Math.max(...list.map(y => y.rating));
      return `<tr class="${i === 0 ? "top1" : ""}"><td class="n rk">${i + 1}</td><td><span class="rkname">${photo(x.espn_id, f.fighter, "sm")}${fighterLink(f.fighter, x.slug)}</span></td>${d ? "" : `<td class="hide-sm">${esc(f.division || "")}</td>`}<td class="n">${esc(f.record || "")}</td>
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
    <p class="note">Every past fight, predicted by a model trained only on earlier fights, graded at the average sportsbook's closing moneyline with flat 1-unit bets. The record starts in ${mr.from || 2020}: earlier years are still used to train the model, but its predictions then had too little history behind them to grade fairly. Our picks by period: ${(mr.periods || []).map(p => `${p.label} ${p.our_won}/${p.our_bets} ${units(p.our_units)}`).join(" · ")}. Expert lean picks (close fights where 65%+ of analysts agree and the model has no pick), included above: ${mr.all.lean_won}/${mr.all.lean_bets} ${units(mr.all.lean_units)}, tracked since SplitPicks data began in April 2026. Suggested stakes size each our pick by price: 1.5 units at -199 or longer odds, 1 unit from -200 to -399, half a unit at -400 or shorter (tested on 2020-22 and 2023-26: more units with less risked than flat bets). Prices are the average sportsbook's, not the best: where 3+ books' closing lines exist (most fights from 2019 on), each pick is graded at their average; otherwise at the single closing line we have. Getting a better price than average is upside the record doesn't count.</p>
    <div class="tablewrap"><table><thead><tr><th>Year</th><th class="n">Winners</th><th class="n">Correct</th><th class="n">Units</th><th class="n hide-sm">Per bet</th>
      <th class="n">Value picks</th><th class="n">Value units</th><th class="n hide-sm">Per bet</th><th class="n">Our picks</th><th class="n">Our units</th></tr></thead><tbody>
      ${mr.years.map(row).join("")}${row({...mr.all, year: "Since " + (mr.from || 2020)})}</tbody></table></div>`;
}

function ledgerBoxes(L) {
  if (!L || !L.fights) return `<div class="empty">The live record starts with the ${esc(dateLong(L ? L.from : "2026-10-31"))} card. Each pick is locked when the fight ends and never recalculated.</div>`;
  const u = x => `<b class="${x >= 0 ? "won" : "lost"}">${units(x)}</b>`;
  return `<div class="stats">
    <div class="stat key"><b>${L.our_won}/${L.our_bets} ${L.our_bets ? `<span class="${L.our_units >= 0 ? "won" : "lost"}">${units(L.our_units)}</span>` : ""}</b><span>our picks${L.our_bets ? `, ${Math.round(100 * L.our_won / L.our_bets)}% won` : ""}</span></div>
    <div class="stat key">${u(L.our_staked_units)}<span>suggested stakes${L.our_risked ? ` (${L.our_staked_units >= 0 ? "+" : ""}${(100 * L.our_staked_units / L.our_risked).toFixed(1)}% return)` : ""}, on ${L.our_risked}u risked</span></div>
    <div class="stat"><b>${L.model_right}/${L.fights}</b><span>winners picked (${Math.round(100 * L.model_right / L.fights)}%)</span></div></div>`;
}

async function viewRecord() {
  const [L, mr] = await Promise.all([get("ledger.json", true), get("model_record.json")]);
  const rows = L && L.rows ? L.rows : [];
  return `<h1>Record</h1>
    <h2>Live record, locked</h2>
    <p class="note">Every pick from ${esc(dateLong(L ? L.from : "2026-10-31"))} on, exactly as it stood before the fight (pick, average sportsbook price, stake), graded when the fight ends and never changed afterwards, whatever the model or data later get.</p>
    ${ledgerBoxes(L)}
    ${unitsChart(ledgerCurve(rows))}
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Fight</th><th>Our pick</th><th class="n">Odds</th><th class="n">Stake</th><th class="n">Result</th><th class="hide-sm">Model's winner</th></tr></thead><tbody>${
      rows.map(g => `<tr><td>${esc(g.date)}</td><td>${esc(g.a)} vs ${esc(g.b)}</td><td>${g.our_pick ? esc(g.our_pick) + (g.expert_lean && g.expert_lean === g.our_pick ? " (lean)" : "") : "–"}</td>
        <td class="n">${g.our_pick ? odds(g.our_odds) : ""}</td><td class="n">${g.stake ? g.stake + "u" : ""}</td>
        <td class="n ${g.our_units > 0 ? "won" : g.our_units < 0 ? "lost" : ""}">${g.our_pick ? (g.our_units > 0 ? "Won " : g.our_units < 0 ? "Lost " : "Push ") + units(g.our_staked_units) : ""}</td>
        <td class="hide-sm ${g.model_pick === g.winner ? "won" : "lost"}">${esc(g.model_pick)} ${g.model_pick === g.winner ? "✓" : "✗"}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <h2>Backtest, ${mr ? mr.from || 2020 : 2020} on</h2>
    ${mr ? unitsChart(mr.curve) : ""}
    <p class="note">What the current method would have picked on every past card, each fight predicted only from earlier fights. It's recalculated when the method or data improve, so it is a simulation, not a record of real picks: the locked live record above is the one to judge by.</p>
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
    <p class="note">Each situation is bet flat on the fighter in it, at the closing line, in two separate periods. A real edge shows in both. "Line said" is the line's average chance; "Won" is what happened. Fades in both periods mean betting <em>against</em> that fighter has paid. Layoff returners and +300 underdogs are built into the site's chances.</p>
    <div class="tablewrap"><table class="bt"><thead>${row(["Situation", ...ed.periods.flatMap(p => [p + " fights", "Won", "Line said", "Per bet"]), "Verdict"], true)}</thead><tbody>${
    ed.rows.filter(r => r.verdict !== "too few fights").sort((a, b) => (a.verdict > b.verdict ? 1 : -1))
      .map(r => row([esc(r.situation), ...ed.periods.flatMap(p => [r["n " + p], pct1(r["won " + p]), pct1(r["line said " + p]), sg(r["roi " + p])]), esc(r.verdict)])).join("")}</tbody></table></div>`;
  const roi = b.roi.map(r => row([pts(r.edge), r.bets, r["win_%"] == null ? "–" : r["win_%"].toFixed(1) + "%", (r.units > 0 ? "+" : "") + r.units.toFixed(1), r["roi_%"] == null ? "–" : r["roi_%"].toFixed(1) + "%"])).join("");
  const step = (n, t, d) => `<div class="hw-step"><span class="hw-n">${n}</span><b>${t}</b><p>${d}</p></div>`;
  return `<h1>How it works</h1>
    <p class="lede">Every fight gets a chance for each fighter. Where that chance beats the betting line on the right kind of fight, it becomes one of our picks, and every pick is graded and kept.</p>
    <div class="hw">
      ${step(1, "Rate every fighter", "Every UFC fight since 2010 feeds a rating that rises and falls with results, weighted by how each fight ended and how strong the opponent was.")}
      ${step(2, "Predict the fight", "Ratings, recent form, experience, age, reach and finishing history give the model its own chance for each fighter, learned only from earlier fights.")}
      ${step(3, "Blend with the line", "The betting line knows a lot (injuries, camps, news), so the model's chance is blended with it. Long layoffs and long-shot underdogs get extra adjustments the line tends to miss.")}
      ${step(4, "Find the value", "When our chance beats the line's by 3+ points on a favorite or a 70%+ fighter, or the experts agree in a close fight, it's one of our picks, sized by price.")}
    </div>
    ${S ? `<div class="hw-stats">
      <div><b>${S.our_pct}%</b><span>of our picks won since ${mr.from || 2020}</span></div>
      <div><b class="${S.our_units >= 0 ? "won" : "lost"}">${units(S.our_units)}</b><span>flat 1-unit bets, ${S.our_roi_pct > 0 ? "+" : ""}${S.our_roi_pct}% per bet</span></div>
      <div><b>${S.pct}%</b><span>of all fights' winners picked</span></div>
      <div><b>${S.our_bets}</b><span>picks graded at the average sportsbook's price</span></div></div>` : ""}
    <p class="note">These are backtest numbers: each past fight predicted only from fights before it. The <a href="#/record">locked live record</a> starts with the Oct 31, 2026 card and is never recalculated.</p>
    <details class="tech"><summary>Technical detail: model tests, betting by edge, and situational edges</summary>
    <p class="note">Each test year is predicted by a model trained only on earlier fights, then scored against the closing line on the same fights. Log loss and Brier measure how good the chances are (lower is better). Last run ${esc(b.run_at)}.</p>
    <h2>The model alone</h2><div class="tablewrap"><table class="bt"><thead>${row(["Probability", "Log loss", "Brier", "Winners"], true)}</thead><tbody>${s1}</tbody></table></div>
    <h2>Blended with the line, ${esc(b.years)}</h2><div class="tablewrap"><table class="bt"><thead>${row(["Probability", "Log loss", "Brier", "Winners"], true)}</thead><tbody>${s2}</tbody></table></div>
    <h2>Flat 1-unit bets by edge</h2><div class="tablewrap"><table class="bt"><thead>${row(["Edge needed", "Bets", "Won", "Units", "Per bet"], true)}</thead><tbody>${roi}</tbody></table></div>
    ${b.early ? `<h2>Betting at the opening line</h2>
      <p class="note">"Line moved toward" is how often the line then moved to the pick's side before the fight: above 50% means the model spots value the market later agrees with.</p>
      <div class="tablewrap"><table class="bt"><thead>${row(["Edge needed", "Bets", "Won", "Per bet, opening odds", "Per bet, closing odds", "Line moved toward"], true)}</thead><tbody>${
      b.early.map(r => row([pts(r.edge), r.bets_open, r["win_%_open"] == null ? "–" : r["win_%_open"].toFixed(1) + "%", r["roi_%_open"] == null ? "–" : r["roi_%_open"].toFixed(1) + "%",
        r["roi_close_%"] == null ? "–" : r["roi_close_%"].toFixed(1) + "%", r["moved_toward_%"].toFixed(1) + "%"])).join("")}</tbody></table></div>`
      : `<h2>Betting at the opening line</h2><p class="note">Appears once the history backfill has collected opening lines.</p>`}
    ${edges}
    </details>
    <p class="note">UFC betting lines are sharp, and past results don't guarantee future ones. Judge the picks by the locked live record as it builds.</p>`;
}

// ---------------- router ----------------
const SKEL = `<div class="skel" aria-label="Loading"><i class="s-h"></i><i class="s-b"></i><i class="s-b"></i><i class="s-b short"></i></div>`;
async function route() {
  const [p, qs] = (location.hash.slice(1) || "/").split("?");
  const q = new URLSearchParams(qs || ""), parts = p.split("/").filter(Boolean);
  const page = parts[0] || "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === ({event: "events", fighter: "fighters"}[page] || page)));
  const views = {home: viewHome, card: viewCard, events: () => viewEvents(q), event: () => viewEvent(parts[1]),
    fighters: () => viewFighters(q), fighter: () => viewFighter(parts[1]), experts: viewExperts,
    rankings: () => viewRankings(q), record: viewRecord, how: viewHow};
  const skel = setTimeout(() => { $("#view").innerHTML = SKEL; }, 150);   // placeholder if the data is slow
  const html = await (views[page] || viewHome)();
  clearTimeout(skel);
  const keepFocus = document.activeElement && document.activeElement.id === "fsearch";
  $("#view").innerHTML = html;
  if (keepFocus) { const b = $("#fsearch"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  else if (!qs) window.scrollTo(0, 0);
  liveBar();
}
window.addEventListener("hashchange", () => { const m = document.querySelector(".tabbar .more"); if (m) m.open = false; route(); });
route();

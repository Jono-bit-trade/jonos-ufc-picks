// Jono's UFC Picks: a small single-page site. Each view reads JSON files from docs/data/.
const $ = s => document.querySelector(s);
const pct = p => p == null ? "–" : Math.round(p * 100) + "%";
const odds = o => o == null ? "–" : (o > 0 ? "+" : "") + Math.round(o);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const cache = {};
const get = (f, fresh) => {
  if (!fresh && cache[f]) return cache[f];
  return cache[f] = fetch("data/" + f + (fresh ? "?t=" + Date.now() : "")).then(r => r.ok ? r.json() : null).catch(() => null);
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
  `Model ${r.right}/${r.picks} (${Math.round(r.right / r.picks * 100)}%) · <span class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</span>`;
const fighterLink = (name, s) => `<a class="fl" href="#/fighter/${esc(s || slug(name))}">${esc(name)}</a>`;

// ---------------- the current card ----------------
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

function expertBar(e, a, b) {
  if (!e || !(e.picks_a + e.picks_b)) return "";
  const n = e.picks_a + e.picks_b, sa = e.picks_a / n;
  return `<div class="experts">
    <div class="exl"><span>Experts: ${e.picks_a} on ${esc(a.split(" ").at(-1))}</span><span>${e.picks_b} on ${esc(b.split(" ").at(-1))}</span></div>
    <div class="exbar" role="img" aria-label="${e.picks_a} of ${n} analysts picked ${esc(a)}"><i style="width:${sa * 100}%"></i></div>
    <div class="exl small"><span>Winning analysts: ${e.win_a ?? 0}</span><a href="${esc(e.url)}" target="_blank" rel="noopener">Data from SplitPicks</a><span>Winning analysts: ${e.win_b ?? 0}</span></div>
  </div>`;
}

function bout(f, i, edge) {
  const pa = f.p_a, line = f.market_p_a, m = f.method || {};
  const tag = (debut, rating, rec) => (debut ? "UFC debut" : "Rating " + rating) + (rec ? ` · ${esc(rec)}` : "");
  let pickHtml;
  if (f.our_pick) pickHtml = `<span class="pick ours">Our pick: ${esc(f.our_pick)} ${odds(f.our_pick === f.a ? f.odds_a : f.odds_b)}</span>`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else if (f.pick) pickHtml = `<span class="pick">Value pick: ${esc(f.pick)} ${odds(f.pick === f.a ? f.odds_a : f.odds_b)}</span>`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else pickHtml = `<div class="nopick">${line == null ? "No betting line yet." : "No bet: the model and the line are within " + Math.round(edge * 100) + " points."}</div>`;
  const moved = f.open_a != null && f.odds_a != null && (f.open_a !== f.odds_a)
    ? `Opened ${odds(f.open_a)} / ${odds(f.open_b)}, now ${odds(f.odds_a)} / ${odds(f.odds_b)}`
    : f.odds_a != null ? `Line ${odds(f.odds_a)} / ${odds(f.odds_b)}` : "";
  const books = f.books ? `${f.books} book${f.books > 1 ? "s" : ""}, best ${odds(f.best_a)} / ${odds(f.best_b)}` : "";
  const pa100 = Math.round(pa * 100);
  return `<article class="bout${i === 0 ? " main" : ""}${f.state === "post" ? " done" : ""}">
    ${status(f)}
    <div class="corners">
      <div class="a">${photo(f.a_id, f.a)}<div><div class="name">${fighterLink(f.a, f.a_slug)}</div><div class="meta">${tag(f.debut_a, f.rating_a, f.record_a)}</div></div></div>
      <div class="class">${esc(f.weight_class)}${f.rounds === 5 ? "<br>5 rounds" : ""}</div>
      <div class="b"><div><div class="name">${fighterLink(f.b, f.b_slug)}</div><div class="meta">${tag(f.debut_b, f.rating_b, f.record_b)}</div></div>${photo(f.b_id, f.b)}</div>
    </div>
    <div class="pct"><span class="pa">${pa100}%</span><span class="lbl">Model</span><span class="pb">${100 - pa100}%</span></div>
    <div class="bar" role="img" aria-label="Model ${pct(pa)} for ${esc(f.a)}${line != null ? ", line " + pct(line) : ""}">
      <div class="fill" style="width:${pa * 100}%"></div>
      ${line != null ? `<div class="line" style="left:${line * 100}%"></div>` : ""}
    </div>
    <div class="legend"><span>Fair ${odds(f.fair_odds_a)}</span><span class="hide-sm">Line ${line != null ? pct(line) + " / " + pct(1 - line) : "not posted"}</span><span>Fair ${odds(f.fair_odds_b)}</span></div>
    ${expertBar(f.experts, f.a, f.b)}
    ${pickHtml}
    <div class="moves">${spark(f.line_history || [])}<span>${moved}</span><span>${books}</span></div>
    <div class="method">If it ends: KO ${pct(m.KO || 0)}, submission ${pct(m.SUB || 0)}, decision ${pct(m.DEC || 0)}</div>
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
  const A = a || {}, B = b || {}, sa = A.style || {}, sb = B.style || {};
  const n = v => v == null || v !== v ? null : +v;
  // better: 1 = higher is better, -1 = lower is better, 0 = no judgement
  const row = (label, va, vb, fmt = x => x, better = 0) => {
    if ((va == null || va === "") && (vb == null || vb === "")) return "";   // nothing to compare yet
    const x = n(va), y = n(vb);
    const ea = better && x != null && y != null && x !== y && ((x > y) === (better > 0));
    const eb = better && x != null && y != null && x !== y && !ea;
    const show = v => v == null || v === "" ? "–" : fmt(v);
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
    ${row("Sig. strikes landed / min", sa.sig_strikes_landed_per_min, sb.sig_strikes_landed_per_min, d2, 1)}
    ${row("Sig. strikes absorbed / min", sa.sig_strikes_absorbed_per_min, sb.sig_strikes_absorbed_per_min, d2, -1)}
    ${row("Striking accuracy", sa.sig_strike_accuracy, sb.sig_strike_accuracy, p0, 1)}
    ${row("Knockdowns / 15 min", sa.knockdowns_per_15, sb.knockdowns_per_15, d2, 1)}
    ${row("Takedowns / 15 min", sa.takedowns_per_15, sb.takedowns_per_15, d2, 1)}
    ${row("Takedown accuracy", sa.takedown_accuracy, sb.takedown_accuracy, p0, 1)}
    ${row("Takedown defense", sa.takedown_defense, sb.takedown_defense, p0, 1)}
    ${row("Control time share", sa.control_time_share, sb.control_time_share, p0, 1)}
    ${row("Submission attempts / 15", sa.submission_attempts_per_15, sb.submission_attempts_per_15, d2, 1)}
  </tbody></table>
  ${!A.style && !B.style ? `<p class="note">Strike and takedown stats appear as the history backfill collects them.</p>` : ""}
  ${lines.length ? `<h3>Against this kind of opponent</h3><ul class="vslist">${lines.join("")}</ul>
    <p class="note">Styles come from fight stats where we have them (takedowns and control time make a wrestler, submission attempts a grappler, striking volume or KO wins a striker), otherwise from how the fighter wins. Small samples: a 2-1 record says little.</p>` : ""}`;
}

async function viewCard() {
  const p = await get("predictions.json", true);
  if (!p) return `<div class="empty">No predictions yet: the first scheduled run fills this in.</div>`;
  clearTimeout(window.refresh);
  if (p.fights.some(f => f.state === "in")) window.refresh = setTimeout(route, 120000);   // fight night: refresh every 2 minutes
  $("#updated").textContent = `Updated ${new Date(p.updated).toLocaleString()} from ${p.card_source}. For fun and research, not betting advice.`;
  if (!p.fights.length) return `<h1>Next card</h1><div class="empty">${esc(p.message || "No bouts listed yet.")}</div>`;
  const mr = await get("model_record.json"), yr = mr && mr.years[0], all = mr && mr.since_2018;
  const track = !mr ? "" : `<div class="track"><b>Model track record</b>
    <span><b class="inl">Our picks</b> ${esc(yr.year)}: ${yr.our_won}/${yr.our_bets} <span class="${yr.our_units >= 0 ? "won" : "lost"}">${units(yr.our_units)}</span> · since 2018: ${all.our_won}/${all.our_bets} <span class="${all.our_units >= 0 ? "won" : "lost"}">${units(all.our_units)}</span></span>
    <span>${esc(yr.year)}: ${yr.pct}% of winners picked (${yr.right}/${yr.picks}), <span class="${yr.units >= 0 ? "won" : "lost"}">${units(yr.units)}</span> betting every winner, value picks ${yr.value_won}/${yr.value_bets} <span class="${yr.value_units >= 0 ? "won" : "lost"}">${units(yr.value_units)}</span></span>
    <span>Since 2018: ${all.pct}% (${all.right}/${all.picks}), <span class="${all.units >= 0 ? "won" : "lost"}">${units(all.units)}</span>; value picks ${all.value_won}/${all.value_bets} <span class="${all.value_units >= 0 ? "won" : "lost"}">${units(all.value_units)}</span> · <a href="#/record">by year</a></span></div>`;
  return `<h1>${esc(p.event)}</h1>
    <p class="where">${dateLong(p.date)}${p.location ? ", " + esc(p.location) : ""}</p>${track}
    <p class="note">The bar is the model's chance for each fighter. The black tick is the betting line with the bookmaker's cut removed. The thinner bar shows how the analysts tracked by SplitPicks are picking. "Our pick" is the selective, high-confidence pick: the model beats the line by 3+ points, gives the fighter a 70%+ chance, and the price isn't a long underdog. "Value pick" means it beats the line but doesn't meet the confidence bar.</p>
    ${p.fights.map((f, i) => bout(f, i, p.edge_threshold)).join("")}`;
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
        <a href="#/fighter/${esc(m.a_slug)}">${photo(m.a_id, m.a, "xl")}<span class="n">${esc(m.a)}</span><span class="pc a">${pct(m.p_a)}</span></a>
        <span class="vs">VS</span>
        <a href="#/fighter/${esc(m.b_slug)}">${photo(m.b_id, m.b, "xl")}<span class="n">${esc(m.b)}</span><span class="pc b">${pct(1 - m.p_a)}</span></a>
      </div>
      <a class="btn" href="#/card">See all ${p.fights.length} bouts, picks and expert splits</a>
    </section>`;
  }
  const past = (ev || []).slice(0, 6).map(e => `<li><a href="#/event/${esc(e.slug)}"><span class="d">${esc(e.date)}</span>${esc(e.name)}</a>
    <span class="small">${recLine(e.record)}</span></li>`).join("");
  const top = ex ? ex.analysts.slice(0, 3).map((a, i) => `<li><span class="rk">${i + 1}</span>${esc(a.analyst)}<span class="small">${a.win_pct}% · ${a.won}-${a.bets - a.won} · ${a.roi_pct > 0 ? "+" : ""}${a.roi_pct}% per bet</span></li>`).join("") : "";
  const mr = await get("model_record.json");
  const yr = mr && mr.years[0], box = (label, r) => !r ? "" : `<div class="stat key"><b>${r.our_won}/${r.our_bets} <span class="${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)}</span></b><span>${label}: our picks</span></div>
    <div class="stat"><b>${r.pct}%</b><span>${label}: winners picked (${r.right}/${r.picks})</span></div>
    <div class="stat"><b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b><span>${label}: betting every model winner</span></div>
    <div class="stat"><b class="${r.value_units >= 0 ? "won" : "lost"}">${units(r.value_units)}</b><span>${label}: value picks (${r.value_won}/${r.value_bets})</span></div>`;
  const record = mr ? `<h2>Model track record</h2><div class="stats">${box(yr.year, yr)}${box("Since 2018", mr.since_2018)}</div>
    <p class="note">Every past fight predicted by a model trained only on earlier fights. Flat 1-unit bets at the closing moneyline. <a href="#/record">Full record by year</a></p>` : "";
  return `${hero}${record}
    <div class="cols">
      <section><h2>Past cards</h2><ul class="list">${past}</ul><a href="#/events">All events</a></section>
      <section><h2>Top analysts</h2>${top ? `<ul class="list">${top}</ul><a href="#/experts">Expert leaderboard and what it's worth</a>` : `<p class="note">Appears once expert picks are collected.</p>`}</section>
    </div>`;
}

// ---------------- events ----------------
async function viewEvents(q) {
  const [ev, up, mr] = await Promise.all([get("events/index.json"), get("upcoming.json"), get("model_record.json")]);
  const year = q.get("year") || "";
  const years = [...new Set((ev || []).map(e => e.date.slice(0, 4)))];
  const list = (ev || []).filter(e => !year || e.date.startsWith(year));
  const upcoming = (up || []).map((u, i) => `<li>${i === 0 ? `<a href="#/card">` : "<span>"}<span class="d">${esc(u.date)}</span>${esc(u.name)}${i === 0 ? "</a>" : "</span>"}</li>`).join("");
  return `<h1>Events</h1>
    ${upcoming ? `<h2>Upcoming</h2><ul class="list">${upcoming}</ul>` : ""}
    <h2>Past cards</h2>
    ${eventsSummary(mr, year)}
    <div class="filters">${["", ...years].map(y => `<a href="#/events${y ? "?year=" + y : ""}" class="${y === year ? "on" : ""}">${y || "All"}</a>`).join("")}</div>
    <ul class="list">${list.map(e => `<li><a href="#/event/${esc(e.slug)}"><span class="d">${esc(e.date)}</span>${esc(e.name)}<span class="small"> · ${esc(e.main)}</span></a>
      ${cardBadge(e.record)}</li>`).join("")}</ul>`;
}

function cardBadge(r) {
  if (!r || !r.picks) return "";
  return `<span class="cbadge"><b>${r.right}/${r.picks}</b> correct · <b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b>${
    r.our_bets ? ` · our picks ${r.our_won}/${r.our_bets} <b class="${r.our_units >= 0 ? "won" : "lost"}">${units(r.our_units)}</b>` : ""}</span>`;
}

function eventsSummary(mr, year) {
  if (!mr) return "";
  const r = year ? mr.years.find(y => y.year === year) : mr.all;
  if (!r) return "";
  const label = year || "All years";
  return `<div class="stats">
    <div class="stat key"><b>${r.our_bets ? `${r.our_won}/${r.our_bets}` : "–"}</b><span>${label}: our picks won${r.our_pct ? ` (${r.our_pct}%)` : ""}</span></div>
    <div class="stat key"><b class="${r.our_units >= 0 ? "won" : "lost"}">${r.our_bets ? units(r.our_units) : "–"}</b><span>${label}: our picks units${r.our_bets ? ` (${r.our_roi_pct > 0 ? "+" : ""}${r.our_roi_pct}% per bet)` : ""}</span></div>
    <div class="stat"><b>${r.right}/${r.picks}</b><span>${label}: fights picked correctly</span></div>
    <div class="stat"><b>${r.pct}%</b><span>${label}: correct</span></div>
    <div class="stat"><b class="${r.units >= 0 ? "won" : "lost"}">${units(r.units)}</b><span>${label}: betting every model winner (${r.roi_pct > 0 ? "+" : ""}${r.roi_pct}% per bet)</span></div>
    <div class="stat"><b>${r.value_bets ? `${r.value_won}/${r.value_bets}` : "–"}</b><span>${label}: value picks won</span></div>
    <div class="stat"><b class="${r.value_units >= 0 ? "won" : "lost"}">${r.value_bets ? units(r.value_units) : "–"}</b><span>${label}: betting value picks${r.value_bets ? ` (${r.value_roi_pct > 0 ? "+" : ""}${r.value_roi_pct}% per bet)` : ""}</span></div>
  </div>
  <p class="note">Each fight predicted by a model trained only on earlier fights. Units are flat 1-unit bets at the closing moneyline.</p>`;
}

async function viewEvent(s) {
  const e = await get(`events/${s}.json`);
  if (!e) return `<div class="empty">That card isn't in the history.</div>`;
  const rows = e.bouts.map((b, i) => {
    const won = b.winner === "a" ? b.a : b.winner === "b" ? b.b : null;
    const mp = b.model_pick, vp = b.value_pick;
    const call = !mp ? "" : `<span class="tick ${mp.right ? "won" : "lost"}">Model ${mp.right ? "✓" : "✗"} ${mp.units != null ? units(mp.units) : ""}</span>`;
    const op = b.our_pick;
    const val = op ? `<span class="vpick ours ${op.right ? "won" : "lost"}">Our pick: ${esc(op.side === "a" ? b.a : b.b)} ${odds(op.odds)} ${op.right ? "✓" : "✗"} ${units(op.units)}</span>`
      : !vp ? "" : `<span class="vpick ${vp.right ? "won" : "lost"}">Value pick: ${esc(vp.side === "a" ? b.a : b.b)} ${odds(vp.odds)} ${vp.right ? "✓" : "✗"} ${units(vp.units)}</span>`;
    const upset = won && b.line_p_a != null && ((b.winner === "a") !== (b.line_p_a > .5)) ? `<span class="news">Upset</span>` : "";
    const side = (n, sl, id, o, mp, w) => `<div class="side ${w ? "w" : ""}">${photo(id, n, "sm")}<div>${fighterLink(n, sl)}${w ? ` <b class="win">Winner</b>` : ""}
      <div class="meta">${odds(o)}${mp != null ? ` · model ${pct(mp)}` : ""}</div></div></div>`;
    return `<article class="bout slim${i === 0 ? " main" : ""}">
      <div class="status"><span class="final">${esc(b.weight_class)}</span>${b.finish ? `${esc(b.finish)}${b.round ? `, round ${b.round}` : ""}` : b.winner === "draw" ? "Draw" : b.winner === "nc" ? "No contest" : ""} ${call} ${val} ${upset}</div>
      <div class="pair">${side(b.a, b.a_slug, b.a_id, b.odds_a, b.model_p_a, b.winner === "a")}<span class="vs sm">VS</span>${side(b.b, b.b_slug, b.b_id, b.odds_b, b.model_p_a == null ? null : 1 - b.model_p_a, b.winner === "b")}</div>
      ${expertBar(b.experts, b.a, b.b)}
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
    <p class="note">"Model" is its chance before the fight, from a model trained only on earlier fights. Winners picked use our final chance (model blended with the line). Units are flat 1-unit bets at the closing moneyline. Value picks beat the line by 3+ points; our picks also need a 70%+ chance and no long underdog: the same rules as the live card.</p>${rows}`;
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
  const f = await get(`fighters/${s}.json`);
  if (!f) return `<div class="empty">No UFC fights found for that fighter.</div>`;
  const by = (o, total) => ["KO", "SUB", "DEC"].map(k => `<div class="byrow"><span>${{KO: "KO/TKO", SUB: "Submission", DEC: "Decision"}[k]}</span>
    <i style="width:${total ? o[k] / total * 100 : 0}%"></i><b>${o[k]}</b></div>`).join("");
  const w = f.wins_by.KO + f.wins_by.SUB + f.wins_by.DEC, l = f.losses_by.KO + f.losses_by.SUB + f.losses_by.DEC;
  const st = f.style;
  const stat = (label, v, fmt) => `<div class="stat"><b>${v == null ? "–" : fmt(v)}</b><span>${label}</span></div>`;
  const p2 = v => (v * 100).toFixed(0) + "%", n2 = v => v.toFixed(2);
  return `<p><a href="#/fighters">← Fighters</a></p>
    <section class="profile">${photo(f.espn_id, f.name, "xl")}<div>
      <h1>${esc(f.name)}</h1>
      <p class="where">${esc(f.weight_class)}${f.stance ? " · " + esc(f.stance) : ""}${f.age ? ` · age ${f.age}` : ""}</p>
      <div class="stats">
        ${stat("UFC record", f.ufc_record, x => x)}${stat("Pro record", f.pro_record, x => x)}
        ${stat("Rating", f.rating, x => x + ` ±${f.rd}`)}${stat("Peak rating", f.peak_rating, x => x)}
        ${stat("Height", f.height_cm, cm)}${stat("Reach", f.reach_cm, inch)}
        ${stat("Streak", f.streak, x => x > 0 ? `W${x}` : x < 0 ? `L${-x}` : "–")}${stat("Finish rate", f.finish_rate, p2)}
        ${stat("Title fights", f.title_fights, x => x)}${stat("UFC since", f.first_fight, x => x.slice(0, 4))}
      </div></div></section>
    <div class="cols">
      <section><h2>How they win (${w})</h2>${by(f.wins_by, w)}</section>
      <section><h2>How they lose (${l})</h2>${by(f.losses_by, l)}</section>
    </div>
    <h2>Fight stats</h2>
    ${st ? `<div class="stats">
      ${stat("Sig. strikes landed / min", st.sig_strikes_landed_per_min, n2)}${stat("Sig. strikes absorbed / min", st.sig_strikes_absorbed_per_min, n2)}
      ${stat("Striking accuracy", st.sig_strike_accuracy, p2)}${stat("Knockdowns / 15 min", st.knockdowns_per_15, n2)}
      ${stat("Takedowns / 15 min", st.takedowns_per_15, n2)}${stat("Takedown accuracy", st.takedown_accuracy, p2)}
      ${stat("Takedown defense", st.takedown_defense, p2)}${stat("Submission attempts / 15", st.submission_attempts_per_15, n2)}
      ${stat("Control time share", st.control_time_share, p2)}${stat("Minutes in the cage", st.minutes, x => Math.round(x))}</div>`
      : `<p class="note">Strike, takedown and control-time stats appear once the history backfill has collected them.</p>`}
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
    <div class="tablewrap"><table><thead><tr><th class="n">#</th><th>Analyst</th><th class="n">Record</th><th class="n">Win %</th><th class="n">Per bet</th><th class="n hide-sm">Underdogs won</th><th class="n hide-sm">High confidence</th></tr></thead><tbody>
    ${e.analysts.map((a, i) => `<tr><td class="n">${i + 1}</td><td>${esc(a.analyst)}</td><td class="n">${a.won}-${a.bets - a.won}</td><td class="n">${a.win_pct}%</td>
      <td class="n ${a.roi_pct > 0 ? "won" : "lost"}">${r(a)}</td><td class="n hide-sm">${a.underdogs_won}/${a.underdog_picks}</td>
      <td class="n hide-sm">${a.high_confidence.bets ? `${a.high_confidence.won}-${a.high_confidence.bets - a.high_confidence.won}, ${r(a.high_confidence)}` : "–"}</td></tr>`).join("")}</tbody></table></div>
    <p class="note">A few hundred picks is a small sample: a leaderboard this short-term is mostly luck. Watch whether the leaders hold up.</p>`;
}

// ---------------- rankings, record, how it works ----------------
async function viewRankings() {
  const r = await get("ratings.json", true);
  if (!r) return `<div class="empty">Rankings appear after the first run.</div>`;
  return `<h1>Rankings</h1><p class="note">Glicko-2 ratings from every UFC fight since 2010, active fighters only. The ± shows how sure the rating is: it shrinks with each fight and grows during layoffs.</p>
    <div class="tablewrap"><table><thead><tr><th class="n">#</th><th>Fighter</th><th class="n">Rating</th><th class="n hide-sm">±</th><th class="n hide-sm">Last fight</th></tr></thead><tbody>
    ${r.fighters.map((f, i) => `<tr><td class="n">${i + 1}</td><td>${fighterLink(f.fighter)}</td><td class="n">${f.rating}</td><td class="n hide-sm">${f.rd}</td><td class="n hide-sm">${esc(f.last_fight)}</td></tr>`).join("")}</tbody></table></div>`;
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
    <p class="note">Every past fight, predicted by a model trained only on earlier fights, graded at the closing moneyline with flat 1-unit bets. Value and our picks start in 2018, when the line blend can first be tested. The "our picks" rule was chosen on 2018-2023 and checked on 2024 onward: ${mr.rule_chosen_on.our_won}/${mr.rule_chosen_on.our_bets} ${units(mr.rule_chosen_on.our_units)} then ${mr.rule_checked_on.our_won}/${mr.rule_checked_on.our_bets} ${units(mr.rule_checked_on.our_units)}.</p>
    <div class="tablewrap"><table><thead><tr><th>Year</th><th class="n">Winners</th><th class="n">Correct</th><th class="n">Units</th><th class="n hide-sm">Per bet</th>
      <th class="n">Value picks</th><th class="n">Value units</th><th class="n hide-sm">Per bet</th><th class="n">Our picks</th><th class="n">Our units</th></tr></thead><tbody>
      ${mr.years.map(row).join("")}${row({...mr.all, year: "All years"})}</tbody></table></div>`;
}

async function viewRecord() {
  const [rec, mr] = await Promise.all([get("results.json", true), get("model_record.json")]);
  if (!rec || !rec.bets) return `<h1>Record</h1><h2>Live picks</h2><div class="empty">No graded live picks yet. Results appear here as each card finishes.</div>${yearTable(mr)}`;
  const ou = rec.ours || {};
  return `<h1>Record</h1><h2>Our picks, live</h2>${ou.bets ? `<div class="record"><div><b>${ou.wins}-${ou.bets - ou.wins}</b><span>our picks won and lost</span></div>
      <div><b>${ou.units > 0 ? "+" : ""}${ou.units}</b><span>units</span></div><div><b>${ou.roi_pct}%</b><span>return per unit bet</span></div></div>` : `<div class="empty">No graded live "our picks" yet.</div>`}
    <h2>All value picks, live</h2><div class="record"><div><b>${rec.wins}-${rec.bets - rec.wins}</b><span>picks won and lost</span></div>
      <div><b>${rec.units > 0 ? "+" : ""}${rec.units}</b><span>units, 1 unit per pick</span></div>
      <div><b>${rec.roi_pct}%</b><span>return per unit bet</span></div>
      ${rec.moved_toward_pct != null ? `<div><b>${rec.moved_toward_pct}%</b><span>of picks the line moved toward</span></div>` : ""}</div>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Fight</th><th>Pick</th><th class="n">Odds</th><th class="n">Result</th></tr></thead><tbody>${
      rec.recent.map(g => `<tr><td>${esc(g.date)}</td><td>${esc(g.fight)}</td><td>${esc(g.pick)}</td><td class="n">${odds(g.odds)}</td><td class="n ${g.won ? "won" : "lost"}">${g.won ? "Won" : "Lost"} ${g.units > 0 ? "+" : ""}${g.units}</td></tr>`).join("")}</tbody></table></div>
    ${yearTable(mr)}`;
}

async function viewHow() {
  const b = await get("backtest.json", true);
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
  return `<h1>How it works</h1>
    <p class="note">Each test year is predicted by a model trained only on earlier fights, then scored against the closing line on the same fights. Lower log loss and Brier are better. Last run ${esc(b.run_at)}.</p>
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
    <p class="note">UFC closing lines are sharp. Treat picks as paper trades until the live record beats the line over a full year.</p>`;
}

// ---------------- router ----------------
async function route() {
  const [p, qs] = (location.hash.slice(1) || "/").split("?");
  const q = new URLSearchParams(qs || ""), parts = p.split("/").filter(Boolean);
  const page = parts[0] || "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === ({event: "events", fighter: "fighters"}[page] || page)));
  const views = {home: viewHome, card: viewCard, events: () => viewEvents(q), event: () => viewEvent(parts[1]),
    fighters: () => viewFighters(q), fighter: () => viewFighter(parts[1]), experts: viewExperts,
    rankings: viewRankings, record: viewRecord, how: viewHow};
  const html = await (views[page] || viewHome)();
  const keepFocus = document.activeElement && document.activeElement.id === "fsearch";
  $("#view").innerHTML = html;
  if (keepFocus) { const b = $("#fsearch"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  else if (!qs) window.scrollTo(0, 0);
  if (!$("#updated").textContent) $("#updated").textContent = "For fun and research, not betting advice.";
}
window.addEventListener("hashchange", route);
route();

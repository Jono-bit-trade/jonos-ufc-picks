const $ = s => document.querySelector(s);
const pct = p => Math.round(p * 100) + "%";
const odds = o => o == null ? "–" : (o > 0 ? "+" : "") + Math.round(o);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const get = f => fetch("data/" + f + "?t=" + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
const fair = (a, b) => {
  const imp = o => o < 0 ? -o / (-o + 100) : 100 / (o + 100);
  return a == null || b == null ? null : imp(a) / (imp(a) + imp(b));
};

document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach(x => x.setAttribute("aria-selected", x === b));
  ["card", "ratings", "record", "how"].forEach(id => $("#" + id).hidden = id !== b.dataset.tab);
}));

// small chart of fighter A's fair chance over the line snapshots
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
    return `<div class="status"><span class="final">${who}</span>${esc(r.detail.replace(/^Final\s*-?\s*/i, ""))} ${mark}</div>`;
  }
  return f.start ? `<div class="status">${new Date(f.start).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}${f.segment ? ", " + esc(f.segment) : ""}</div>` : "";
}

function bout(f, i) {
  const pa = f.p_a, line = f.market_p_a, m = f.method || {};
  const tag = (debut, rating) => debut ? "UFC debut" : "Rating " + rating;
  let pickHtml;
  if (f.pick) pickHtml = `<span class="pick">Pick: ${esc(f.pick)} ${odds(f.pick === f.a ? f.odds_a : f.odds_b)}</span>`
    + (f.check_news ? `<span class="news">Big gap: check the news</span>` : "");
  else pickHtml = `<div class="nopick">${line == null ? "No betting line yet." : "No bet: the model and the line are within " + Math.round(window.EDGE * 100) + " points."}</div>`;
  const moved = f.open_a != null && f.odds_a != null && (f.open_a !== f.odds_a)
    ? `Opened ${odds(f.open_a)} / ${odds(f.open_b)}, now ${odds(f.odds_a)} / ${odds(f.odds_b)}`
    : f.odds_a != null ? `Line ${odds(f.odds_a)} / ${odds(f.odds_b)}` : "";
  const books = f.books ? `${f.books} book${f.books > 1 ? "s" : ""}, best ${odds(f.best_a)} / ${odds(f.best_b)}` : "";
  const pa100 = Math.round(pa * 100);
  return `<article class="bout${i === 0 ? " main" : ""}${f.state === "post" ? " done" : ""}" tabindex="0">
    ${status(f)}
    <div class="corners">
      <div class="a"><div class="name">${esc(f.a)}</div><div class="meta">${tag(f.debut_a, f.rating_a)}</div></div>
      <div class="class">${esc(f.weight_class)}${f.rounds === 5 ? ", 5 rounds" : ""}</div>
      <div class="b"><div class="name">${esc(f.b)}</div><div class="meta">${tag(f.debut_b, f.rating_b)}</div></div>
    </div>
    <div class="pct"><span class="pa">${pa100}%</span><span class="pb">${100 - pa100}%</span></div>
    <div class="bar" role="img" aria-label="Model ${pct(pa)} for ${esc(f.a)}${line != null ? ", line " + pct(line) : ""}">
      <div class="fill" style="width:${pa * 100}%"></div>
      ${line != null ? `<div class="line" style="left:${line * 100}%"></div>` : ""}
    </div>
    <div class="legend">
      <span>Fair ${odds(f.fair_odds_a)}</span>
      <span class="hide-sm">Line ${line != null ? pct(line) + " / " + pct(1 - line) : "not posted"}</span>
      <span>Fair ${odds(f.fair_odds_b)}</span>
    </div>
    ${pickHtml}
    <div class="moves">${spark(f.line_history || [])}<span>${moved}</span><span>${books}</span></div>
    <div class="method">If it ends: KO ${pct(m.KO || 0)}, submission ${pct(m.SUB || 0)}, decision ${pct(m.DEC || 0)}</div>
  </article>`;
}

function backtest(b) {
  if (!b) return `<div class="empty">The backtest summary appears after the first full run.</div>`;
  const row = (cells, head) => `<tr>${cells.map((c, i) => `<${head ? "th" : "td"}${i ? ' class="n"' : ""}>${c}</${head ? "th" : "td"}>`).join("")}</tr>`;
  const f3 = x => x == null ? "–" : Number(x).toFixed(3);
  const label = r => r.learner === "market" ? "Closing line, cut removed"
    : ({glicko_only: "Rating alone", core: "Core", "core+form": "Core + form", "core+form+context": "Core + form + context", all: "All groups"}[r.features] || r.features)
      + ({logistic: "", boost: ", boosted trees", blend: ", blended learners"}[r.learner] ?? ", " + r.learner);
  const s1 = b.stage1.map(r => row([esc(label(r)), f3(r.log_loss), f3(r.brier), pct(r.accuracy)])).join("");
  const s2 = b.stage2.map(r => row([esc(r.probability), f3(r.log_loss), f3(r.brier), pct(r.accuracy)])).join("");
  const roi = b.roi.map(r => row([Math.round(r.edge * 100) + (Math.round(r.edge * 100) === 1 ? " point" : " points"), r.bets, r["win_%"] == null ? "–" : r["win_%"].toFixed(1) + "%", (r.units > 0 ? "+" : "") + r.units.toFixed(1), r["roi_%"] == null ? "–" : r["roi_%"].toFixed(1) + "%"])).join("");
  return `<p class="note">Each test year is predicted by a model trained only on earlier fights, then scored against the closing line on the same fights. Lower log loss and Brier are better. Last run ${esc(b.run_at)}.</p>
    <h2>The model alone</h2><table class="bt"><thead>${row(["Probability", "Log loss", "Brier", "Winners"], true)}</thead><tbody>${s1}</tbody></table>
    <h2>Blended with the line, ${esc(b.years)}</h2><table class="bt"><thead>${row(["Probability", "Log loss", "Brier", "Winners"], true)}</thead><tbody>${s2}</tbody></table>
    <h2>Flat 1-unit bets by edge</h2><table class="bt"><thead>${row(["Edge needed", "Bets", "Won", "Units", "Per bet"], true)}</thead><tbody>${roi}</tbody></table>
    ${b.early ? `<h2>Betting at the opening line</h2>
      <p class="note">The same blend fitted against the opening line, with bets at opening odds. "Line moved toward" is how often the line then moved to the pick's side before the fight: above 50% means the model spots value the market later agrees with.</p>
      <table class="bt"><thead>${row(["Edge needed", "Bets", "Won", "Per bet, opening odds", "Per bet, closing odds", "Line moved toward"], true)}</thead><tbody>${
      b.early.map(r => row([Math.round(r.edge * 100) + (Math.round(r.edge * 100) === 1 ? " point" : " points"), r.bets_open,
        r["win_%_open"] == null ? "–" : r["win_%_open"].toFixed(1) + "%", r["roi_%_open"] == null ? "–" : r["roi_%_open"].toFixed(1) + "%",
        r["roi_close_%"] == null ? "–" : r["roi_close_%"].toFixed(1) + "%", r["moved_toward_%"].toFixed(1) + "%"])).join("")}</tbody></table>`
      : `<h2>Betting at the opening line</h2><p class="note">Appears once the history backfill has collected opening lines.</p>`}
    <p class="note" style="margin-top:16px">UFC closing lines are sharp. Treat picks as paper trades until the live record beats the line over a full year.</p>`;
}

async function load() {
  const [p, r, rec, bt] = await Promise.all([get("predictions.json"), get("ratings.json"), get("results.json"), get("backtest.json")]);
  if (!p) {
    $("#where").textContent = "No predictions yet: the first scheduled run fills this in.";
  } else {
    window.EDGE = p.edge_threshold;
    $("#event").textContent = p.event;
    const d = new Date(p.date + "T12:00:00");
    $("#where").textContent = !p.fights.length ? "" : d.toLocaleDateString(undefined, {weekday: "long", month: "long", day: "numeric"}) + (p.location ? ", " + p.location : "");
    $("#bouts").innerHTML = p.fights.length ? p.fights.map(bout).join("") : `<div class="empty">${esc(p.message || "No bouts listed for this card yet.")}</div>`;
    $("#updated").textContent = `Updated ${new Date(p.updated).toLocaleString()} from ${p.card_source}. For fun and research, not betting advice.`;
    clearTimeout(window.refresh);
    if (p.fights.some(f => f.state === "in")) window.refresh = setTimeout(load, 120000);   // fight night: refresh every 2 minutes
  }
  if (r) $("#rt").innerHTML = r.fighters.map((f, i) =>
    `<tr><td class="n">${i + 1}</td><td>${esc(f.fighter)}</td><td class="n">${f.rating}</td><td class="n hide-sm">${f.rd}</td><td class="n hide-sm">${esc(f.last_fight)}</td></tr>`).join("");
  if (rec && rec.bets) {
    $("#totals").innerHTML = `<div><b>${rec.wins}-${rec.bets - rec.wins}</b><span>picks won and lost</span></div>
      <div><b>${rec.units > 0 ? "+" : ""}${rec.units}</b><span>units, 1 unit per pick</span></div>
      <div><b>${rec.roi_pct}%</b><span>return per unit bet</span></div>
      ${rec.moved_toward_pct != null ? `<div><b>${rec.moved_toward_pct}%</b><span>of picks the line moved toward</span></div>` : ""}`;
    $("#history").innerHTML = `<table><thead><tr><th>Date</th><th>Fight</th><th>Pick</th><th class="n">Odds</th><th class="n">Result</th></tr></thead><tbody>${
      rec.recent.map(g => `<tr><td>${esc(g.date)}</td><td>${esc(g.fight)}</td><td>${esc(g.pick)}</td><td class="n">${odds(g.odds)}</td><td class="n ${g.won ? "won" : "lost"}">${g.won ? "Won" : "Lost"} ${g.units > 0 ? "+" : ""}${g.units}</td></tr>`).join("")}</tbody></table>`;
  } else {
    $("#history").innerHTML = `<div class="empty">No graded picks yet. Results appear here as each card finishes.</div>`;
  }
  $("#backtest").innerHTML = backtest(bt);
}
load();

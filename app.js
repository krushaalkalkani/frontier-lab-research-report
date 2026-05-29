const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

const fmtContext = (n) => (n >= 1e6 ? `${n / 1e6}M` : `${(n / 1e3).toFixed(0)}K`);
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const COLS = [
  { key: "name", label: "Model", type: "text" },
  { key: "context", label: "Context", better: "high", fmt: (v) => fmtContext(v) },
  { key: "inPrice", label: "Input $/M", better: "low", fmt: (v) => `$${v}` },
  { key: "outPrice", label: "Output $/M", better: "low", fmt: (v) => `$${v}`, delta: true, unit: "$" },
  { key: "swe", label: "SWE-bench", better: "high", fmt: (v) => `${v}%`, delta: true, unit: "%" },
  { key: "reasoning", label: "Reasoning", better: "high", fmt: (v) => `${v}%`, delta: true, unit: "%" },
  { key: "speed", label: "Speed", better: "high", fmt: (v) => `${v} t/s`, delta: true, unit: " t/s" },
];

const state = {
  data: null,
  newsType: "all",
  vendors: new Set(),
  sortKey: null,
  sortDir: -1,
  metric: "swe",
  showDelta: false,
  expanded: new Set(),
};

/* ---------- theme ---------- */
function initTheme() {
  const saved = localStorage.getItem("cp-theme");
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("cp-theme", next);
  });
}

/* ---------- tooltip ---------- */
const tip = () => $("#tooltip");
function showTip(html, e) { const t = tip(); t.innerHTML = html; t.classList.add("show"); moveTip(e); }
function moveTip(e) { const t = tip(); const x = Math.min(e.clientX + 14, innerWidth - t.offsetWidth - 12); t.style.left = x + "px"; t.style.top = e.clientY + 16 + "px"; }
function hideTip() { tip().classList.remove("show"); }

/* ---------- load ---------- */
async function load() {
  initTheme();
  let data;
  try { data = await (await fetch(`data/updates.json?t=${Date.now()}`)).json(); }
  catch { $("#heroName").textContent = "Could not load data"; $("#heroHeadline").textContent = "Run from a local server (see README)."; return; }
  state.data = data;
  data.models.forEach((m) => state.vendors.add(m.vendor));
  state.metric = data.benchmarks.metrics[0].key;

  $("#lastUpdated").textContent = `Updated ${fmtDate(data.meta.lastUpdated)}`;
  renderHero(data.latest);
  renderStats(data);
  renderNewsFilter();
  renderTimeline();
  renderUpcoming(data.upcoming);
  renderVendorFilter();
  renderHead();
  renderTable();
  renderSentiment(data.sentiment);
  renderChartTabs(data.benchmarks);
  $("#deltaToggle").addEventListener("change", (e) => { state.showDelta = e.target.checked; drawChart(); });
  drawChart();
  renderSources(data.meta.sources);
}

function renderHero(l) {
  $("#heroName").textContent = l.name;
  $("#heroHeadline").textContent = l.headline;
  $("#heroMeta").innerHTML = `
    <span class="chip">Released <strong>${fmtDate(l.released)}</strong></span>
    <span class="chip">Context <strong>${fmtContext(l.context)}</strong></span>
    <span class="chip">Input <strong>$${l.pricing.input}/M</strong></span>
    <span class="chip">Output <strong>$${l.pricing.output}/M</strong></span>`;
  $("#heroHighlights").innerHTML = l.highlights.map((h) => `<li>${h}</li>`).join("");
  $("#heroLink").href = l.url;
}

function renderStats(d) {
  const claude = d.models.find((m) => m.highlight) || d.models[0];
  const cheapest = [...d.models].sort((a, b) => a.outPrice - b.outPrice)[0];
  const tiles = [
    { num: d.models.length, lbl: "frontier models tracked" },
    { num: `#${[...d.models].sort((a, b) => b.swe - a.swe).findIndex((m) => m.highlight) + 1}`, lbl: "Claude rank on SWE-bench" },
    { num: `${claude.swe}%`, lbl: "Claude SWE-bench Pro" },
    { num: `$${cheapest.outPrice}`, lbl: `cheapest output (${cheapest.vendor})` },
  ];
  $("#statStrip").innerHTML = tiles.map((t) => `<div class="stat"><div class="num">${t.num}</div><div class="lbl">${t.lbl}</div></div>`).join("");
}

/* ---------- what's new ---------- */
function renderNewsFilter() {
  const opts = [["all", "All"], ["model", "Models"], ["feature", "Features"]];
  $("#newsFilter").innerHTML = opts.map(([v, l]) => `<button class="fbtn ${state.newsType === v ? "active" : ""}" data-v="${v}">${l}</button>`).join("");
  $("#newsFilter").onclick = (e) => { const b = e.target.closest(".fbtn"); if (!b) return; state.newsType = b.dataset.v; renderNewsFilter(); renderTimeline(); };
}
function renderTimeline() {
  const items = state.data.timeline.filter((i) => state.newsType === "all" || i.type === state.newsType);
  $("#timeline").innerHTML = items.map((it) => `
    <div class="tl-item ${it.type}">
      <div class="tl-head">
        <span class="tl-date">${fmtDate(it.date)}</span>
        <span class="tl-type ${it.type}">${it.type}</span>
      </div>
      <div class="tl-card">
        <h3>${it.url ? `<a href="${it.url}" target="_blank" rel="noopener">${it.title}</a>` : it.title}</h3>
        <p>${it.summary}</p>
        <div class="tags">${(it.tags || []).map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      </div>
    </div>`).join("") || `<p style="color:var(--ink-soft)">No ${state.newsType} updates yet.</p>`;
}

function renderUpcoming(items) {
  const conf = { high: 85, medium: 55, low: 28 };
  $("#upcoming-cards").innerHTML = items.map((u) => `
    <div class="u-card">
      <div class="u-top"><h3>${u.title}</h3><span class="status ${u.status}">${u.status}</span></div>
      <p>${u.summary}</p>
      <span class="eta">ETA · ${u.eta}</span>
      <div class="conf" title="confidence: ${u.confidence}"><span style="width:${conf[u.confidence] || 30}%"></span></div>
    </div>`).join("");
}

/* ---------- comparison table ---------- */
function visibleModels() { return state.data.models.filter((m) => state.vendors.has(m.vendor)); }
function claudeModel() { return state.data.models.find((m) => m.highlight) || state.data.models[0]; }

function renderVendorFilter() {
  const vendors = [...new Set(state.data.models.map((m) => m.vendor))];
  $("#vendorFilter").innerHTML = vendors.map((v) => `<button class="fbtn ${state.vendors.has(v) ? "active" : ""}" data-v="${v}">${v}</button>`).join("");
  $("#vendorFilter").onclick = (e) => {
    const b = e.target.closest(".fbtn"); if (!b) return;
    const v = b.dataset.v;
    if (state.vendors.has(v)) { if (state.vendors.size > 1) state.vendors.delete(v); } else state.vendors.add(v);
    renderVendorFilter(); renderTable(); drawChart();
  };
}

function renderHead() {
  $("#compareHead").innerHTML = COLS.map((c) => {
    const sorted = state.sortKey === c.key;
    const arrow = c.type === "text" ? "" : `<span class="arrow">${sorted ? (state.sortDir === -1 ? "▼" : "▲") : "▽"}</span>`;
    return `<th data-key="${c.key}" class="${sorted ? "sorted" : ""}">${c.label}${arrow}</th>`;
  }).join("") + `<th></th>`;
  $("#compareHead").onclick = (e) => {
    const th = e.target.closest("th"); if (!th || !th.dataset.key) return;
    const k = th.dataset.key; if (k === "name") { state.sortKey = state.sortKey === "name" ? null : "name"; }
    else { if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = -1; } }
    renderHead(); renderTable();
  };
}

function bestValue(key, better) {
  const vals = visibleModels().map((m) => m[key]);
  return better === "low" ? Math.min(...vals) : Math.max(...vals);
}

function renderTable() {
  let rows = visibleModels();
  if (state.sortKey) {
    const k = state.sortKey;
    rows = [...rows].sort((a, b) => k === "name" ? a.name.localeCompare(b.name) * (state.sortDir) : (a[k] - b[k]) * state.sortDir);
  }
  const claude = claudeModel();
  const best = {};
  COLS.forEach((c) => { if (c.type !== "text") best[c.key] = bestValue(c.key, c.better); });
  const maxBy = {};
  COLS.forEach((c) => { if (c.type !== "text") maxBy[c.key] = Math.max(...visibleModels().map((m) => m[c.key])); });

  const body = $("#compareBody");
  body.innerHTML = "";
  rows.forEach((m) => {
    const tr = el("tr", m.highlight ? "highlight" : "");
    tr.dataset.name = m.name;
    COLS.forEach((c) => {
      const td = el("td");
      if (c.type === "text") { td.innerHTML = `${m.name}<span class="vendor">${m.vendor}</span>`; }
      else {
        const isBest = m[c.key] === best[c.key];
        let inner = `<span class="cell-val"><span class="${isBest ? "best" : ""}">${c.fmt(m[c.key])}</span></span>`;
        if (c.delta && !m.highlight) {
          const diff = m[c.key] - claude[c.key];
          const better = c.better === "low" ? diff < 0 : diff > 0;
          const sign = diff > 0 ? "+" : "";
          inner += `<span class="delta ${better ? "pos" : "neg"}">${sign}${diff.toFixed(c.unit === "%" ? 1 : 1).replace(/\.0$/, "")}${c.unit.trim()}</span>`;
        } else if (c.delta && m.highlight) { inner += `<span class="delta">ref</span>`; }
        td.innerHTML = inner;
      }
      tr.appendChild(td);
    });
    const expTd = el("td", "", `<button class="expand-btn" aria-label="details">⌄</button>`);
    tr.appendChild(expTd);
    // tooltip on row
    tr.addEventListener("mouseenter", (e) => showTip(`<strong>${m.name}</strong><br>${m.note}`, e));
    tr.addEventListener("mousemove", moveTip);
    tr.addEventListener("mouseleave", hideTip);
    body.appendChild(tr);

    const dr = el("tr", "detail-row" + (state.expanded.has(m.name) ? " open" : ""));
    const dtd = el("td"); dtd.colSpan = COLS.length + 1;
    dtd.innerHTML = `<div class="detail-inner"><p>${m.note}</p>
      <div class="meta-line">
        <span><strong>Released</strong> ${fmtDate(m.released)}</span>
        <span><strong>Context</strong> ${fmtContext(m.context)}</span>
        <span><strong>Pricing</strong> $${m.inPrice} in / $${m.outPrice} out per M</span>
      </div></div>`;
    dr.appendChild(dtd);
    body.appendChild(dr);

    expTd.querySelector(".expand-btn").addEventListener("click", () => {
      if (state.expanded.has(m.name)) state.expanded.delete(m.name); else state.expanded.add(m.name);
      dr.classList.toggle("open");
    });
  });
}

/* ---------- sentiment ---------- */
function renderSentiment(s) {
  if (!s) return;
  const total = s.positive + s.negative + s.neutral;
  $("#sentSub").textContent = `What people are saying about ${s.subject} on X — ${s.window}, N=${s.sampleSize.toLocaleString()}.`;
  const badge = $("#sentMode");
  badge.className = `mode-badge ${s.mode}`;
  badge.textContent = s.mode === "live" ? "● Live" : "Illustrative sample";

  $("#sentPos").textContent = s.positive.toLocaleString();
  $("#sentNeg").textContent = s.negative.toLocaleString();
  $("#sentNeu").textContent = s.neutral.toLocaleString();

  const pct = (n) => ((n / total) * 100).toFixed(1);
  $("#sentBar").innerHTML = `
    <i class="sb-pos" style="width:${pct(s.positive)}%" title="Positive ${pct(s.positive)}%"></i>
    <i class="sb-neu" style="width:${pct(s.neutral)}%" title="Neutral ${pct(s.neutral)}%"></i>
    <i class="sb-neg" style="width:${pct(s.negative)}%" title="Negative ${pct(s.negative)}%"></i>`;
  $("#sentRatio").innerHTML = `<strong>${pct(s.positive)}% positive</strong> vs ${pct(s.negative)}% negative · net sentiment <strong>${(pct(s.positive) - pct(s.negative)).toFixed(1)}</strong>`;

  $("#proofList").innerHTML = [
    ["Source", s.source],
    ["Search query", `<code>${s.query}</code>`],
    ["Time window", s.window],
    ["Sample size", `${s.sampleSize.toLocaleString()} tweets`],
    ["Classifier", s.classifier],
    ["Last fetched", fmtDate(s.lastFetched)],
    ["Mode", s.mode === "live" ? "Live data" : "Illustrative sample (connect an X API token to go live)"],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

  $("#sentSamples").innerHTML = (s.samples || []).map((t) =>
    `<div class="sample"><span class="slabel ${t.label}">${t.label}</span><span>“${t.text}”</span></div>`).join("");

  const lex = s.lexicon || { positive: [], negative: [] };
  $("#sentLexicon").innerHTML =
    `<div><strong style="color:var(--good)">Positive words:</strong> ${lex.positive.map((w) => `<span class="lex-word p">${w}</span>`).join("")}</div>` +
    `<div style="margin-top:8px"><strong style="color:#c2675a">Negative words:</strong> ${lex.negative.map((w) => `<span class="lex-word n">${w}</span>`).join("")}</div>`;
}

/* ---------- charts ---------- */
function renderChartTabs(bench) {
  $("#benchNote").textContent = bench.note;
  $("#chartTabs").innerHTML = bench.metrics.map((m) => `<button class="chart-tab ${m.key === state.metric ? "active" : ""}" data-key="${m.key}">${m.label}</button>`).join("");
  $("#chartTabs").onclick = (e) => {
    const b = e.target.closest(".chart-tab"); if (!b) return;
    state.metric = b.dataset.key;
    document.querySelectorAll(".chart-tab").forEach((x) => x.classList.toggle("active", x === b));
    drawChart();
  };
}

function metricMeta() { return state.data.benchmarks.metrics.find((m) => m.key === state.metric); }

function drawChart() {
  const meta = metricMeta();
  $("#metricDesc").textContent = meta.desc + (meta.better === "low" ? "  (lower is better)" : "");
  const claude = claudeModel();
  let models = visibleModels().map((m) => ({ ...m, val: m[meta.key], delta: m[meta.key] - claude[meta.key] }));

  if (state.showDelta) {
    models = models.filter((m) => !m.highlight);
    models.sort((a, b) => (meta.better === "low" ? a.delta - b.delta : b.delta - a.delta));
    const max = Math.max(1, ...models.map((m) => Math.abs(m.delta)));
    $("#chart").innerHTML = models.map((m) => {
      const better = meta.better === "low" ? m.delta < 0 : m.delta > 0;
      const sign = m.delta > 0 ? "+" : "";
      return barRow(m, Math.abs(m.delta) / max * 100, better ? "" : "neg",
        `${sign}${(+m.delta.toFixed(1))}${meta.unit}`, `<span class="d ${better ? "pos" : "neg"}">${better ? "better" : "worse"}</span>`);
    }).join("") || `<p style="color:var(--ink-soft)">Enable a vendor to compare.</p>`;
  } else {
    models.sort((a, b) => (meta.better === "low" ? a.val - b.val : b.val - a.val));
    const max = Math.max(...models.map((m) => m.val));
    $("#chart").innerHTML = models.map((m) =>
      barRow(m, m.val / max * 100, m.highlight ? "" : "alt", `${m.val}${meta.unit}`, "")
    ).join("");
  }
  requestAnimationFrame(() => {
    document.querySelectorAll("#chart .bar-row").forEach((row) => { row.querySelector(".bar-fill").style.width = row.dataset.w + "%"; });
  });
  bindChartTips();
}

function barRow(m, widthPct, fillClass, valText, sub) {
  return `<div class="bar-row" data-w="${widthPct.toFixed(1)}" data-name="${m.name}">
    <div class="lbl">${m.name}<small>${m.vendor}</small></div>
    <div class="bar-track"><div class="bar-fill ${fillClass}"></div></div>
    <div class="bar-val">${valText}${sub}</div>
  </div>`;
}

function bindChartTips() {
  const meta = metricMeta();
  document.querySelectorAll("#chart .bar-row").forEach((row) => {
    const m = state.data.models.find((x) => x.name === row.dataset.name);
    row.addEventListener("mouseenter", (e) => showTip(`<strong>${m.name}</strong> · ${m.vendor}<br>${meta.label}: ${m[meta.key]}${meta.unit}<br>${m.note}`, e));
    row.addEventListener("mousemove", moveTip);
    row.addEventListener("mouseleave", hideTip);
  });
}

function renderSources(sources) {
  $("#sources").innerHTML = `<strong style="font-size:14px;color:var(--ink)">Sources</strong>` +
    sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label} ↗</a>`).join("");
}

load();

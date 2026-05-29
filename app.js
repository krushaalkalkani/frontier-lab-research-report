const $ = (s) => document.querySelector(s);

const fmtContext = (n) => (n >= 1e6 ? `${n / 1e6}M` : `${(n / 1e3).toFixed(0)}K`);
const fmtDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

async function load() {
  let data;
  try {
    const res = await fetch(`data/updates.json?t=${Date.now()}`);
    data = await res.json();
  } catch (e) {
    $("#heroName").textContent = "Could not load data";
    $("#heroHeadline").textContent = "Run this from a local server (see README) so the browser can fetch data/updates.json.";
    return;
  }
  renderUpdated(data.meta);
  renderHero(data.latest);
  renderTimeline(data.timeline);
  renderUpcoming(data.upcoming);
  renderTable(data.models);
  renderCharts(data.models, data.benchmarks);
  renderSources(data.meta.sources);
}

function renderUpdated(meta) {
  $("#lastUpdated").textContent = `Updated ${fmtDate(meta.lastUpdated)}`;
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

function renderTimeline(items) {
  $("#timeline").innerHTML = items
    .map(
      (it) => `
    <div class="tl-item ${it.type}">
      <span class="tl-date">${fmtDate(it.date)}</span>
      <div class="tl-card">
        <h3>${it.url ? `<a href="${it.url}" target="_blank" rel="noopener">${it.title}</a>` : it.title}</h3>
        <p>${it.summary}</p>
        <div class="tags">${(it.tags || []).map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      </div>
    </div>`
    )
    .join("");
}

function renderUpcoming(items) {
  const conf = { high: 85, medium: 55, low: 28 };
  $("#upcoming-cards").innerHTML = items
    .map(
      (u) => `
    <div class="u-card">
      <div class="u-top">
        <h3>${u.title}</h3>
        <span class="status ${u.status}">${u.status}</span>
      </div>
      <p>${u.summary}</p>
      <span class="eta">ETA · ${u.eta}</span>
      <div class="conf" title="confidence: ${u.confidence}"><span style="width:${conf[u.confidence] || 30}%"></span></div>
    </div>`
    )
    .join("");
}

function renderTable(models) {
  const max = { swe: Math.max(...models.map((m) => m.swe)), reasoning: Math.max(...models.map((m) => m.reasoning)) };
  $("#compareBody").innerHTML = models
    .map(
      (m) => `
    <tr class="${m.highlight ? "highlight" : ""}">
      <td>${m.name}<span class="vendor">${m.vendor}</span></td>
      <td>${fmtContext(m.context)}</td>
      <td>$${m.inPrice}</td>
      <td>$${m.outPrice}</td>
      <td><span class="bar" style="width:${(m.swe / max.swe) * 60}px"></span>${m.swe}%</td>
      <td><span class="bar" style="width:${(m.reasoning / max.reasoning) * 60}px"></span>${m.reasoning}%</td>
      <td>${m.speed} t/s</td>
    </tr>`
    )
    .join("");
}

let chartState = { models: [], metrics: [], active: "swe" };
function renderCharts(models, bench) {
  $("#benchNote").textContent = bench.note;
  chartState.models = models;
  chartState.metrics = bench.metrics;
  $("#chartTabs").innerHTML = bench.metrics
    .map((m, i) => `<button class="chart-tab ${i === 0 ? "active" : ""}" data-key="${m.key}">${m.label}</button>`)
    .join("");
  $("#chartTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".chart-tab");
    if (!btn) return;
    document.querySelectorAll(".chart-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    chartState.active = btn.dataset.key;
    drawChart();
  });
  drawChart();
}

function drawChart() {
  const { models, active } = chartState;
  const sorted = [...models].sort((a, b) => b[active] - a[active]);
  const max = Math.max(...sorted.map((m) => m[active]));
  const unit = active === "speed" ? " t/s" : "%";
  $("#chart").innerHTML = sorted
    .map(
      (m) => `
    <div class="bar-row">
      <div class="lbl">${m.name}<small>${m.vendor}</small></div>
      <div class="bar-track"><div class="bar-fill ${m.highlight ? "" : "alt"}"></div></div>
      <div class="bar-val">${m[active]}${unit}</div>
    </div>`
    )
    .join("");
  requestAnimationFrame(() => {
    document.querySelectorAll("#chart .bar-row").forEach((row, i) => {
      row.querySelector(".bar-fill").style.width = `${(sorted[i][active] / max) * 100}%`;
    });
  });
}

function renderSources(sources) {
  $("#sources").innerHTML =
    `<strong style="font-size:14px;color:var(--ink)">Sources</strong>` +
    sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label} ↗</a>`).join("");
}

load();

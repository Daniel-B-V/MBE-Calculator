/* ═══════════════════════════════════════════════════════════════════
   MBE Calculator – Frontend Logic
   Communicates with Flask backend at /api/*
════════════════════════════════════════════════════════════════════ */

"use strict";

// ─── STATE ─────────────────────────────────────────────────────────
const state = {
  equations:   {},   // fetched from /api/equations
  parameters:  [],   // fetched from /api/parameters
  currentEq:   null, // name of active equation
  chart:       null, // Chart.js instance
};

// ─── CONSTANTS ─────────────────────────────────────────────────────
const API = {
  equations:  "/api/equations",
  parameters: "/api/parameters",
  calculate:  "/api/calculate",
  regression: "/api/regression",
};

// ─── BOOT ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  enhanceBootstrapBindings();
  initTheme();
  fetchEquations();
  fetchParameters();
  initGraphingTab();
});

// THEME: light/dark toggle with persistence
function initTheme() {
  const chk = document.getElementById('theme-toggle');
  if (!chk) return;

  const saved = localStorage.getItem('mbe_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(initial);

  // sync checkbox
  chk.checked = initial === 'light';

  chk.addEventListener('change', () => {
    const next = chk.checked ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('mbe_theme', next);
  });
}

function applyTheme(name) {
  if (name === 'light') {
    document.documentElement.classList.add('light-theme');
    document.documentElement.setAttribute('data-theme', 'light');
    const btn = document.getElementById('theme-toggle'); if (btn) btn.textContent = '☀️';
  } else {
    document.documentElement.classList.remove('light-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    const btn = document.getElementById('theme-toggle'); if (btn) btn.textContent = '🌙';
  }
}

// Apply Bootstrap helper classes to existing elements for a quicker visual upgrade
function enhanceBootstrapBindings() {
  // Buttons: ensure Bootstrap's base `btn` class is present
  document.querySelectorAll('.btn-primary, .btn-secondary, .btn-sm, .btn').forEach(el => {
    if (!el.classList.contains('btn')) el.classList.add('btn');
  });

  // Make primary buttons larger for better touch targets
  document.querySelectorAll('.btn-primary').forEach(el => {
    if (!el.classList.contains('btn-primary')) el.classList.add('btn-primary');
  });

  // Inputs: add form-control where appropriate
  document.querySelectorAll('.cell-input, .txt-input, input[type="text"]').forEach(el => {
    if (!el.classList.contains('form-control')) el.classList.add('form-control');
  });

  // Selects
  document.querySelectorAll('.solve-select, select').forEach(el => {
    if (!el.classList.contains('form-select')) el.classList.add('form-select');
  });

  // Small utilities: make the header content constrained
  document.querySelectorAll('.header-inner').forEach(el => el.classList.add('container-lg'));
}

// ════════════════════════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════════════════════════
function initTabs() {
  const btns   = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      btns.forEach(b   => b.classList.toggle("active",   b === btn));
      panels.forEach(p => p.classList.toggle("active",   p.id === `tab-${target}`));
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// CALCULATOR TAB
// ════════════════════════════════════════════════════════════════════

async function fetchEquations() {
  try {
    const res  = await fetch(API.equations);
    state.equations = await res.json();
    renderEqCards();
  } catch (err) {
    console.error("Failed to load equations:", err);
  }
}

function renderEqList() {
  const list = document.getElementById("eq-list");
  list.innerHTML = "";
  Object.keys(state.equations).forEach(name => {
    const btn = document.createElement("button");
    btn.className = "eq-btn";
    btn.textContent = name;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".eq-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadEquation(name);
    });
    list.appendChild(btn);
  });
}

// Render a grid of equation cards in the main calculator panel
function renderEqCards() {
  const main = document.getElementById("calc-main");
  // If an equation is currently loaded, don't show the card grid
  if (state.currentEq) return;
  // Clear any existing content and build grid
  main.innerHTML = "";
  const grid = el("div", { className: "cards-grid" });

  Object.entries(state.equations).forEach(([name, eq]) => {
    const sym = eq.solve_for || (eq.vars && eq.vars[0]) || "?";
    const param = getParam(sym);
    const desc = param ? param.description : "";
    // detect parenthetical symbol in the original name (e.g. "... (N)")
    const parenMatch = String(name).match(/\(([^)]+)\)\s*$/);

    const card = el("button", { className: "eq-card" });
    // inner container for 3D flip
    const inner = el('div', { className: 'card-inner' });

    // front face
    const front = el('div', { className: 'card-front' });
    const middle = el("div", { className: "card-center" });
    middle.appendChild(el("div", { className: "card-symbol", textContent: sym }));
    middle.appendChild(el("div", { className: "card-name", textContent: stripNumberPrefix(name) }));
    if (desc) middle.appendChild(el("div", { className: "card-desc", textContent: desc }));
    front.appendChild(middle);

    // back face (formula)
    const back = el('div', { className: 'card-back' });
    back.appendChild(renderFormula(eq.formula_display || '', true));

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);

    // Info icon (top-right) to flip the card and show formula
    const infoBtn = el('button', { className: 'card-info', innerHTML: '<i class="fa fa-info-circle" aria-hidden="true"></i>' });
    infoBtn.addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('flipped'); });
    card.appendChild(infoBtn);

    card.addEventListener("click", () => {
      loadEquation(name);
    });

    grid.appendChild(card);
  });

  main.appendChild(grid);
}

function stripNumberPrefix(name) {
  // Remove patterns like "1.", "2a.", "3b.", etc. at the start of the string
  return String(name).replace(/^\s*\d+[A-Za-z]*\.\s*/, '');
}

function renderFormula(formula, isPreview = false) {
  const wrapper = el('div', { className: isPreview ? 'formula-preview math-formula math-formula-preview' : 'formula-text math-formula' });
  const text = String(formula || '').trim();
  if (!text) {
    wrapper.textContent = '';
    return wrapper;
  }

  const parts = text.split('=');
  if (parts.length < 2) {
    wrapper.textContent = text;
    return wrapper;
  }

  const lhs = parts.shift().trim();
  const rhs = parts.join('=').trim();
  wrapper.appendChild(el('span', { className: 'math-lhs', textContent: lhs }));
  wrapper.appendChild(el('span', { className: 'math-equals', textContent: '=' }));

  const bracketFrac = rhs.match(/^\[(.*)\]\s*\/\s*\[(.*)\]$/);
  const slashIndex = rhs.indexOf('/');
  const numerator = bracketFrac ? bracketFrac[1].trim() : (slashIndex > -1 ? rhs.slice(0, slashIndex).trim() : null);
  const denominator = bracketFrac ? bracketFrac[2].trim() : (slashIndex > -1 ? rhs.slice(slashIndex + 1).trim() : null);

  if (numerator !== null && denominator !== null) {
    const frac = el('span', { className: 'math-frac' });
    frac.appendChild(el('span', { className: 'math-num', textContent: numerator }));
    frac.appendChild(el('span', { className: 'math-bar' }));
    frac.appendChild(el('span', { className: 'math-den', textContent: denominator }));
    wrapper.appendChild(frac);
    return wrapper;
  }

  wrapper.appendChild(el('span', { className: 'math-rhs', textContent: rhs }));
  return wrapper;
}

function loadEquation(name) {
  state.currentEq = name;
  const eq   = state.equations[name];
  const main = document.getElementById("calc-main");
  main.innerHTML = "";
  // Back button to return to the card grid
  const backWrap = el("div", { className: "back-wrap" });
  const backBtn = el("button", { className: "btn-secondary back-btn", textContent: "← Back to equations" });
  backBtn.addEventListener("click", () => { state.currentEq = null; renderEqCards(); });
  backWrap.appendChild(backBtn);
  main.appendChild(backWrap);

  // Screen area for equation name and formula
  const screen = el("div", { className: "calc-screen fade-up" });
  const title = el("h2", { className: "eq-title" }, stripNumberPrefix(name));
  const fc = el("div", { className: "formula-card calc-formula" });
  fc.appendChild(renderFormula(eq.formula_display));
  screen.appendChild(title);
  screen.appendChild(fc);
  main.appendChild(screen);

  // Solve-for row
  const sr = el("div", { className: "solve-row calc-strip fade-up" });
  sr.appendChild(el("label", { textContent: "Solve for:" }));
  const sel = el("select", { className: "solve-select", id: "solve-select" });
  eq.vars.forEach(v => {
    const opt = el("option", { value: v, textContent: v });
    if (v === eq.solve_for) opt.selected = true;
    sel.appendChild(opt);
  });
  sr.appendChild(sel);
  main.appendChild(sr);

  // Input grid
  const grid = el("div", { className: "input-grid calc-keypad fade-up", id: "input-grid" });
  eq.vars.forEach(v => grid.appendChild(makeInputCell(v)));
  main.appendChild(grid);

  // Result card
  const rc = el("div", { className: "result-card calc-result fade-up" });
  rc.appendChild(el("div", { className: "result-text", id: "result-text", textContent: "Result will appear here" }));
  main.appendChild(rc);

  // Actions
  const actions = el("div", { className: "calc-actions calc-actions-row fade-up" });
  const calcBtn = el("button", { className: "btn-primary", textContent: "Calculate  ▶" });
  calcBtn.addEventListener("click", () => runCalculation(name, eq));
  const resetBtn = el("button", { className: "btn-secondary", textContent: "Reset" });
  resetBtn.addEventListener("click", () => resetInputs(eq));
  actions.appendChild(calcBtn);
  actions.appendChild(resetBtn);
  main.appendChild(actions);
}

function makeInputCell(vname) {
  const param = getParam(vname);
  const cell  = el("div", { className: "input-cell" });
  cell.appendChild(el("div", { className: "cell-symbol", textContent: vname }));
  if (param?.unit) {
    cell.appendChild(el("div", { className: "cell-unit", textContent: `[${param.unit}]` }));
  }
  const input = el("input", {
    type: "text", className: "cell-input placeholder-val",
    value: vname, id: `inp-${vname}`,
  });
  // Placeholder behaviour
  input.addEventListener("focus", () => {
    if (input.value === vname) { input.value = ""; input.classList.remove("placeholder-val"); }
  });
  input.addEventListener("blur", () => {
    if (input.value.trim() === "") { input.value = vname; input.classList.add("placeholder-val"); }
  });
  // Tooltip
  if (param?.description) attachTooltip(input, param.description);
  cell.appendChild(input);
  return cell;
}

function resetInputs(eq) {
  eq.vars.forEach(v => {
    const inp = document.getElementById(`inp-${v}`);
    if (inp) { inp.value = v; inp.classList.add("placeholder-val"); }
  });
  const rt = document.getElementById("result-text");
  if (rt) { rt.textContent = "Result will appear here"; rt.className = "result-text"; }
}

async function runCalculation(name, eq) {
  const solveFor = document.getElementById("solve-select")?.value;
  const rt       = document.getElementById("result-text");
  if (!rt) return;

  // Collect values
  const values = {};
  let missing = [];
  eq.vars.forEach(v => {
    if (v === solveFor) return;
    const inp = document.getElementById(`inp-${v}`);
    const val = inp ? inp.value.trim() : "";
    if (val === "" || val === v) {
      missing.push(v);
    } else {
      values[v] = val;
    }
  });

  if (missing.length) {
    rt.textContent = `⚠ Missing: ${missing.join(", ")}`;
    rt.className = "result-text error";
    return;
  }

  rt.innerHTML = `<span class="spinner"></span> Calculating…`;
  rt.className = "result-text";

  try {
    const res  = await fetch(API.calculate, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ equation: name, solve_for: solveFor, values }),
    });
    const data = await res.json();
    if (data.error) {
      rt.textContent = `⚠ ${data.error}`;
      rt.className = "result-text error";
    } else {
      const formatted = formatNumber(data.result);
      rt.textContent = `${data.variable}  =  ${formatted}  ${data.unit}`;
      rt.className = "result-text";
    }
  } catch (err) {
    rt.textContent = `Network error: ${err.message}`;
    rt.className = "result-text error";
  }
}

// ════════════════════════════════════════════════════════════════════
// PARAMETERS TAB
// ════════════════════════════════════════════════════════════════════

async function fetchParameters() {
  try {
    const res = await fetch(API.parameters);
    state.parameters = await res.json();
    renderParamTable(state.parameters);
    initParamSearch();
  } catch (err) {
    console.error("Failed to load parameters:", err);
  }
}

function renderParamTable(data) {
  const tbody = document.getElementById("param-tbody");
  tbody.innerHTML = "";
  data.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escHtml(p.symbol)}</td><td>${escHtml(p.description)}</td><td>${escHtml(p.unit)}</td>`;
    tbody.appendChild(tr);
  });
}

function initParamSearch() {
  const inp = document.getElementById("param-search");
  if (!inp) return;
  inp.addEventListener("input", () => {
    const q = inp.value.toLowerCase();
    const filtered = state.parameters.filter(p =>
      p.symbol.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q)
    );
    renderParamTable(filtered);
  });
}

// ════════════════════════════════════════════════════════════════════
// GRAPHING TAB
// ════════════════════════════════════════════════════════════════════

const INITIAL_DATA = [[0,8.5],[1,9.25],[2,10],[3,10.75],[4,11.5],[5,12.25],[6,13]];

function initGraphingTab() {
  // Seed initial rows
  INITIAL_DATA.forEach(([x, y]) => addGraphRow(x, y));

  document.getElementById("btn-add-row").addEventListener("click", () => addGraphRow());
  document.getElementById("btn-remove-row").addEventListener("click", removeLastRow);
  document.getElementById("btn-plot").addEventListener("click", plotGraph);

  initChart();
}

function addGraphRow(xv = "", yv = "") {
  const container = document.getElementById("graph-rows");
  const row = el("div", { className: "graph-row" });
  const xe  = el("input", { type: "text", className: "cell-input", value: String(xv), placeholder: "x" });
  const ye  = el("input", { type: "text", className: "cell-input", value: String(yv), placeholder: "y" });
  row.appendChild(xe);
  row.appendChild(ye);
  container.appendChild(row);
}

function removeLastRow() {
  const container = document.getElementById("graph-rows");
  const rows = container.querySelectorAll(".graph-row");
  if (rows.length > 0) rows[rows.length - 1].remove();
}

function getGraphData() {
  const rows = document.querySelectorAll("#graph-rows .graph-row");
  const xs = [], ys = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll("input");
    const xv = inputs[0]?.value.trim();
    const yv = inputs[1]?.value.trim();
    if (xv && yv && !isNaN(+xv) && !isNaN(+yv)) {
      xs.push(+xv);
      ys.push(+yv);
    }
  });
  return { xs, ys };
}

function initChart() {
  const ctx = document.getElementById("mbe-chart").getContext("2d");
  state.chart = new Chart(ctx, {
    type: "scatter",
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 400 },
      plugins: {
        legend: { display: true, labels: { color: "#8892b0", font: { family: "Space Mono", size: 11 } } },
        tooltip: { backgroundColor: "#1e2338", titleColor: "#4f8ef7", bodyColor: "#e8eaf6" },
      },
      scales: {
        x: {
          ticks:  { color: "#8892b0", font: { family: "Space Mono", size: 10 } },
          grid:   { color: "#252a42" },
          title:  { display: true, color: "#e8eaf6", font: { family: "Syne", size: 12, weight: "700" } },
        },
        y: {
          ticks:  { color: "#8892b0", font: { family: "Space Mono", size: 10 } },
          grid:   { color: "#252a42" },
          title:  { display: true, color: "#e8eaf6", font: { family: "Syne", size: 12, weight: "700" } },
        },
      },
    },
  });
}

async function plotGraph() {
  const { xs, ys } = getGraphData();
  if (xs.length < 2) {
    alert("Enter at least 2 valid (x, y) pairs.");
    return;
  }

  const xLabel   = document.getElementById("g-xlabel").value || "x";
  const yLabel   = document.getElementById("g-ylabel").value || "y";
  const slopeSym = document.getElementById("g-slope-sym").value || "m";
  const title    = document.getElementById("g-title").value || "";

  try {
    const res  = await fetch(API.regression, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: xs, y: ys }),
    });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }

    // Update chart title
    state.chart.options.plugins.title = {
      display: true, text: title,
      color: "#e8eaf6", font: { family: "Syne", size: 13, weight: "700" },
    };
    state.chart.options.scales.x.title.text = xLabel;
    state.chart.options.scales.y.title.text = yLabel;

    // Build annotation points for labels
    const pointData = xs.map((x, i) => ({ x, y: ys[i] }));

    state.chart.data.datasets = [
      {
        label: "Data Points",
        type: "scatter",
        data: pointData,
        backgroundColor: "#4f8ef7",
        pointRadius: 6,
        pointHoverRadius: 8,
        borderColor: "#4f8ef7",
      },
      {
        label: `Best-fit line (slope = ${formatNumber(data.slope)})`,
        type: "line",
        data: data.line_x.map((x, i) => ({ x, y: data.line_y[i] })),
        borderColor: "#7c5cbf",
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
      },
    ];

    state.chart.update();

    // Slope display
    const sd = document.getElementById("slope-display");
    const s12 = data.slope_pts12 !== null ? formatNumber(data.slope_pts12) : "N/A";
    sd.style.display = "block";
    sd.textContent   = `${slopeSym} (pts 1–2)  =  ${s12}\n${slopeSym} (best-fit) =  ${formatNumber(data.slope)}\nintercept        =  ${formatNumber(data.intercept)}`;

  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════
// TOOLTIP
// ════════════════════════════════════════════════════════════════════
const tooltip = (() => {
  const div = document.createElement("div");
  div.className = "tippy";
  document.body.appendChild(div);

  function show(text, x, y) {
    div.textContent = text;
    div.style.left  = `${x + 12}px`;
    div.style.top   = `${y + 8}px`;
    div.classList.add("visible");
  }
  function hide() { div.classList.remove("visible"); }
  return { show, hide };
})();

function attachTooltip(el, text) {
  el.addEventListener("mouseenter", e => tooltip.show(text, e.clientX, e.clientY));
  el.addEventListener("mousemove",  e => { div_pos(e); });
  el.addEventListener("mouseleave", () => tooltip.hide());
}

function div_pos(e) {
  const div = document.querySelector(".tippy");
  if (div) { div.style.left = `${e.clientX + 12}px`; div.style.top = `${e.clientY + 8}px`; }
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "textContent") e.textContent = v;
    else if (k === "innerHTML") e.innerHTML = v;
    else e[k] = v;
  });
  children.forEach(c => { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return e;
}

function getParam(symbol) {
  return state.parameters.find(p => p.symbol === symbol);
}

function formatNumber(n) {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs >= 1e-3 && abs < 1e9) return n.toLocaleString(undefined, { maximumSignificantDigits: 7 });
  return n.toExponential(4);
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
}
// ─────────────────────────────────────────────
// STATE & STORAGE
// ─────────────────────────────────────────────
const SK = 'cashflow_pwa_v1';
let S = null, dirty = false;
let MONTHS = [];

function load() {
  try {
    const r = localStorage.getItem(SK);
    if (r) {
      S = JSON.parse(r);
      if (!S.savings) S.savings = deep(DEFAULTS.savings);
      if (!S.settings) S.settings = deep(DEFAULTS.settings);
      if (!S.settings.exchangeRates) S.settings.exchangeRates = {};
      if (!S.transactions) S.transactions = [];
      return;
    }
  } catch (e) {}
  S = deep(DEFAULTS);
}

function save() {
  try { localStorage.setItem(SK, JSON.stringify(S)); dirty = false; badge(); } catch (e) {}
}

function deep(x) { return JSON.parse(JSON.stringify(x)); }

function markDirty() {
  dirty = true;
  badge();
  clearTimeout(window._st);
  window._st = setTimeout(save, 700);
}

function badge() {
  const d = document.getElementById('sdot'), t = document.getElementById('stxt');
  d.className = dirty ? 'dot dirty' : 'dot';
  t.textContent = dirty ? 'Saving…' : 'Saved';
}

function doReset() {
  if (!confirm('This will remove all items and reset balances to zero. Continue?')) return;
  S = deep(DEFAULTS);
  S.startingBalance = 0;
  S.income = [];
  S.outgoings = [];
  S.transactions = [];
  S.savings.startValue = 0;
  S.settings.exchangeRates = {};
  S.settings.ratesLastUpdated = null;
  save();
  populateCfg();
  rebuildMonths();
  renderAll();
}

function rebuildMonths() {
  MONTHS = buildMonths(S.startMonth, S.forecastYears);
}

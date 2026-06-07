// ─────────────────────────────────────────────
// COMPUTE
// ─────────────────────────────────────────────

// Raw amount in the item's own currency
function amtRaw(item, m) {
  return (item.overrides && item.overrides[m] !== undefined) ? item.overrides[m] : (item.base || 0);
}

// Exchange rate: 1 unit of `code` = ? units of base currency
function xrate(code) {
  const base = (S && S.settings && S.settings.currency) || 'GBP';
  if (!code || code === base) return 1;
  const rates = (S && S.settings && S.settings.exchangeRates) || {};
  return rates[code] || 1;
}

// Amount converted to the base (display) currency
function amt(item, m) {
  return amtRaw(item, m) * xrate(item.currency);
}

// Format a value in a specific currency (for showing native amounts)
function fmtAs(v, code) {
  if (v === 0) return '—';
  const cur = CURRENCIES[code] || getCurrency();
  const s = Math.abs(v).toLocaleString(cur.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (v < 0 ? '-' + cur.symbol : cur.symbol) + s;
}

function compute() {
  const inc = MONTHS.map(m => S.income.reduce((s, i) => s + amt(i, m), 0));
  const out = MONTHS.map(m => S.outgoings.reduce((s, i) => s + amt(i, m), 0));
  const net = MONTHS.map((_, i) => inc[i] - out[i]);
  let bal = S.startingBalance;
  const bals = MONTHS.map((_, i) => { bal += net[i]; return bal; });
  return { inc, out, net, bals };
}

function computeSavings() {
  const savItems = S.outgoings.filter(i => i.category === 'Savings');
  const monthlyRate = (S.savings.growthPct / 100) / 12;
  let bal = S.savings.startValue;
  const contribs = [], growth = [], bals = [];
  for (const m of MONTHS) {
    const c = savItems.reduce((s, i) => s + amt(i, m), 0);
    const g = bal * monthlyRate;
    bal = bal + c + g;
    contribs.push(c); growth.push(g); bals.push(bal);
  }
  return { contribs, growth, bals, items: savItems };
}

// ─────────────────────────────────────────────
// EXCHANGE RATE FETCHING (frankfurter.app — free, no key)
// ─────────────────────────────────────────────
async function fetchExchangeRates() {
  const base = (S && S.settings && S.settings.currency) || 'GBP';
  // Collect all foreign currencies used by items
  const used = new Set();
  [...S.income, ...S.outgoings].forEach(item => {
    if (item.currency && item.currency !== base) used.add(item.currency);
  });
  if (used.size === 0) return { rates: {}, base };

  // frankfurter uses ECB data — it gives rates FROM a base TO targets
  // We want: 1 foreign = ? base. So we query from each foreign to base.
  // More efficient: query from base to all foreign, then invert.
  const targets = [...used].join(',');
  try {
    const resp = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${targets}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // data.rates = { EUR: 1.18, ... } meaning 1 GBP = 1.18 EUR
    // We need the inverse: 1 EUR = 1/1.18 GBP
    const converted = {};
    for (const [code, rate] of Object.entries(data.rates)) {
      converted[code] = +(1 / rate).toFixed(6);
    }
    return { rates: converted, base, raw: data.rates, date: data.date };
  } catch (err) {
    console.warn('Exchange rate fetch failed:', err);
    return { rates: {}, base, error: err.message };
  }
}

function getCurrency() {
  const code = (S && S.settings && S.settings.currency) || 'GBP';
  return CURRENCIES[code] || CURRENCIES.GBP;
}

function fmt(v, z = true) {
  if (!z && v === 0) return '—';
  const cur = getCurrency();
  const s = Math.abs(v).toLocaleString(cur.locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (v < 0 ? '-' + cur.symbol : cur.symbol) + s;
}

function currencySymbol() {
  return getCurrency().symbol;
}

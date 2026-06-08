// ─────────────────────────────────────────────
// COMPUTE
// ─────────────────────────────────────────────

// Raw amount in the item's own currency for a given month
function amtRaw(item, m) {
  // Overrides always win
  if (item.overrides && item.overrides[m] !== undefined) return item.overrides[m];

  const freq = item.frequency || 'monthly';
  const base = item.base || 0;

  switch (freq) {
    case 'monthly':
      return base;
    case 'weekly':
      return +(base * (52 / 12)).toFixed(2);
    case 'fortnightly':
      return +(base * (26 / 12)).toFixed(2);
    case 'quarterly': {
      const mo = parseInt(m.split('-')[1]);
      const anchor = item.frequencyMonth || 1;
      return ((mo - anchor + 12) % 3 === 0) ? base : 0;
    }
    case 'annual': {
      const mo = parseInt(m.split('-')[1]);
      return mo === (item.frequencyMonth || 1) ? base : 0;
    }
    case 'one-off':
      return 0; // Only via overrides
    default:
      return base;
  }
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

// ─────────────────────────────────────────────
// SHARE PRICE FETCHING — tries multiple CORS proxies
// ─────────────────────────────────────────────
function cacheSharePrice(pf, date, price) {
  if (!pf) return;
  if (!pf.priceHistory) pf.priceHistory = [];
  const existing = pf.priceHistory.find(p => p.date === date);
  if (existing) {
    existing.price = price;
  } else {
    pf.priceHistory.push({ date, price });
    pf.priceHistory.sort((a, b) => a.date.localeCompare(b.date));
  }
}

// Try fetching — local proxy first (same-origin, no CORS), then external proxies as fallback
async function fetchViaProxy(targetUrl) {
  // Extract ticker/range/interval from Yahoo URL for local proxy
  const yahooMatch = targetUrl.match(/chart\/([^?]+)\?(.+)/);
  if (yahooMatch) {
    const ticker = decodeURIComponent(yahooMatch[1]);
    const params = new URLSearchParams(yahooMatch[2]);
    const localUrl = `/api/yahoo-chart?ticker=${encodeURIComponent(ticker)}&range=${params.get('range') || 'max'}&interval=${params.get('interval') || '1d'}`;
    try {
      const resp = await fetch(localUrl, { signal: AbortSignal.timeout(15000) });
      if (resp.ok) return await resp.json();
    } catch (e) { /* fall through to external proxies */ }
  }

  // Fallback: external CORS proxies
  const proxies = [
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const makeProxy of proxies) {
    try {
      const resp = await fetch(makeProxy(targetUrl), { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      return await resp.json();
    } catch (e) {
      continue;
    }
  }
  throw new Error('Could not fetch share data — ensure the server is running (node server.js)');
}

function parseYahooChart(data) {
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No data returned for this ticker');
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const history = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      const d = new Date(timestamps[i] * 1000);
      history.push({ date: d.toISOString().slice(0, 10), price: +closes[i].toFixed(2) });
    }
  }
  const meta = result.meta;
  return {
    history,
    currentPrice: meta?.regularMarketPrice,
    currency: meta?.currency || 'USD',
    name: meta?.shortName || ''
  };
}

async function fetchShareHistory(ticker, range = 'max') {
  if (!ticker) return { error: 'No ticker set', history: [] };

  try {
    // Fetch daily (20y) + weekly (full history) and merge for best coverage
    const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=20y&interval=1d`;
    const weeklyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=max&interval=1wk`;

    const [dailyData, weeklyData] = await Promise.all([
      fetchViaProxy(dailyUrl).catch(() => null),
      fetchViaProxy(weeklyUrl).catch(() => null)
    ]);

    const merged = new Map();
    let meta = null;

    // Weekly first (older data, lower resolution)
    if (weeklyData) {
      const parsed = parseYahooChart(weeklyData);
      parsed.history.forEach(h => merged.set(h.date, h));
      meta = { currentPrice: parsed.currentPrice, currency: parsed.currency, name: parsed.name };
    }

    // Daily overwrites weekly for overlapping dates (higher resolution)
    if (dailyData) {
      const parsed = parseYahooChart(dailyData);
      parsed.history.forEach(h => merged.set(h.date, h));
      if (!meta) meta = {};
      meta.currentPrice = parsed.currentPrice;
      meta.currency = parsed.currency;
      meta.name = parsed.name;
    }

    if (merged.size === 0) throw new Error('No data returned');

    const history = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
    return {
      history,
      currentPrice: meta?.currentPrice,
      currency: meta?.currency || 'USD',
      name: meta?.name || ticker
    };
  } catch (err) {
    console.warn('Share history fetch failed:', err);
    return { error: err.message, history: [] };
  }
}

function pfNeedsFetch(pf) {
  if (!pf || !pf.ticker) return false;
  const history = pf.priceHistory || [];
  if (history.length === 0) return true;
  const latest = history[history.length - 1];
  const age = Date.now() - new Date(latest.date + 'T23:59:59').getTime();
  return age > 24 * 60 * 60 * 1000;
}

function sharesNeedsFetch() {
  return (S.portfolios || []).some(pf => pfNeedsFetch(pf));
}

// ─────────────────────────────────────────────
// FRENCH TAX CALCULATION (PFU — Prélèvement Forfaitaire Unique)
// As of 2026: 12.8% income tax + 18.6% social charges = 31.4%
// Applied only on positive capital gains (gain = sale price - grant price)
// ─────────────────────────────────────────────
function getShareTaxRates(pf) {
  const p = pf || {};
  const tb = p.taxBreakdown || { incomeTax: 12.8, socialCharges: 18.6 };
  return {
    incomeTax: tb.incomeTax / 100,
    socialCharges: tb.socialCharges / 100,
    total: (tb.incomeTax + tb.socialCharges) / 100,
    incomeTaxPct: tb.incomeTax,
    socialChargesPct: tb.socialCharges,
    totalPct: tb.incomeTax + tb.socialCharges
  };
}

function computeTaxOnGain(gain) {
  if (gain <= 0) return { incomeTax: 0, socialCharges: 0, total: 0 };
  const r = getShareTaxRates();
  return {
    incomeTax: gain * r.incomeTax,
    socialCharges: gain * r.socialCharges,
    total: gain * r.total
  };
}

function computePortfolioHistory(pf) {
  const lots = (pf.lots || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const history = (pf.priceHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const taxRates = getShareTaxRates(pf);
  if (history.length === 0 || lots.length === 0) return { dates: [], values: [], costs: [], gains: [], nets: [] };

  const dates = [], values = [], costs = [], gains = [], nets = [];
  for (const hp of history) {
    const vestedLots = lots.filter(l => l.date <= hp.date);
    const totalShares = vestedLots.reduce((s, l) => s + (l.shares || 0), 0);
    const totalCost = vestedLots.reduce((s, l) => s + (l.shares || 0) * (l.grantPrice || 0), 0);
    const marketVal = totalShares * hp.price;
    const gain = marketVal - totalCost;
    const tax = gain > 0 ? gain * taxRates.total : 0;
    const net = marketVal - tax;
    dates.push(hp.date);
    values.push(marketVal);
    costs.push(totalCost);
    gains.push(gain);
    nets.push(net);
  }
  return { dates, values, costs, gains, nets };
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

// ─────────────────────────────────────────────
// TRANSACTIONS — actual logged entries
// ─────────────────────────────────────────────
function todayYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Compute actual balance from transactions up to a given month
function computeActuals() {
  const txs = (S.transactions || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  // Group by YYYY-MM
  const byMonth = {};
  for (const tx of txs) {
    const m = tx.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { inc: 0, out: 0 };
    if (tx.type === 'income') byMonth[m].inc += (tx.amount || 0);
    else byMonth[m].out += (tx.amount || 0);
  }
  // Build running balance across MONTHS
  let bal = S.startingBalance;
  const inc = [], out = [], net = [], bals = [];
  for (const m of MONTHS) {
    const d = byMonth[m] || { inc: 0, out: 0 };
    inc.push(d.inc);
    out.push(d.out);
    net.push(d.inc - d.out);
    bal += d.inc - d.out;
    bals.push(bal);
  }
  return { inc, out, net, bals, txCount: txs.length };
}

// Current month's actual totals
function currentMonthActuals() {
  const cm = todayYYYYMM();
  const txs = (S.transactions || []).filter(tx => tx.date.startsWith(cm));
  const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const out = txs.filter(t => t.type === 'outgoing').reduce((s, t) => s + (t.amount || 0), 0);
  return { inc, out, net: inc - out, count: txs.length, month: cm };
}

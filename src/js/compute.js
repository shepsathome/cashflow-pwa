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
    case 'bi-annual': {
      const mo = parseInt(m.split('-')[1]);
      const anchor = item.frequencyMonth || 1;
      const second = ((anchor - 1 + 6) % 12) + 1;
      return (mo === anchor || mo === second) ? base : 0;
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
  const s = Math.abs(v).toLocaleString(cur.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
// EMERGENCY FUND — 3–6 months of essential expenses
// ─────────────────────────────────────────────

// 12 calendar months starting from the current month (for a representative annual view)
function ef12Months() {
  const d = new Date();
  let y = d.getFullYear(), mo = d.getMonth() + 1;
  const arr = [];
  for (let i = 0; i < 12; i++) {
    arr.push(`${y}-${String(mo).padStart(2, '0')}`);
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  return arr;
}

// Monthly-equivalent cost of a recurring outgoing in base currency —
// averages the real amount (incl. frequency + overrides + FX) across a rolling 12 months.
function itemMonthlyEquiv(item) {
  const ms = ef12Months();
  return ms.reduce((s, m) => s + amt(item, m), 0) / 12;
}

function efIsSavingsCat(cat) {
  const c = (cat || '').toLowerCase();
  return c.includes('saving') || c.includes('investment');
}

function efConfig() {
  if (!S.emergencyFund) S.emergencyFund = deep(DEFAULTS.emergencyFund);
  return S.emergencyFund;
}

// The recurring outgoings that count towards "essential monthly expenses"
function efEssentialItems() {
  const ef = efConfig();
  if (ef.expenseMode === 'items') {
    const ids = new Set(ef.essentialItemIds || []);
    return (S.outgoings || []).filter(i => ids.has(i.id));
  }
  // 'auto' — everything except savings/investment contributions
  return (S.outgoings || []).filter(i => !efIsSavingsCat(i.category));
}

function efMonthlyExpense() {
  const ef = efConfig();
  if (ef.expenseMode === 'manual') return ef.manualMonthlyExpense || 0;
  return efEssentialItems().reduce((s, i) => s + itemMonthlyEquiv(i), 0);
}

function efCurrentAmount() {
  const ef = efConfig();
  return ef.fundSource === 'savings' ? (S.savings.startValue || 0) : (ef.currentAmount || 0);
}

// Milestone status from the number of months currently covered
function efStatus(monthsCovered, targetMonths) {
  if (monthsCovered >= targetMonths) return { key: 'funded', label: 'Fully funded', color: 'var(--green)' };
  if (monthsCovered >= 6) return { key: 'strong', label: 'Strong security (6+ months)', color: 'var(--green)' };
  if (monthsCovered >= 3) return { key: 'basic', label: 'Basic security (3+ months)', color: 'var(--gold)' };
  if (monthsCovered >= 1) return { key: 'starter', label: 'Starter buffer (1+ month)', color: 'var(--amber)' };
  return { key: 'building', label: 'Getting started', color: 'var(--red)' };
}

function computeEmergencyFund() {
  const ef = efConfig();
  const targetMonths = ef.targetMonths || 6;
  const monthly = efMonthlyExpense();
  const target = monthly * targetMonths;
  const current = efCurrentAmount();
  const monthsCovered = monthly > 0 ? current / monthly : 0;
  const pct = target > 0 ? Math.min(current / target, 1) : 0;
  const gap = Math.max(0, target - current);
  const surplus = Math.max(0, current - target);
  return { targetMonths, monthly, target, current, monthsCovered, pct, gap, surplus,
    status: efStatus(monthsCovered, targetMonths) };
}

// ─────────────────────────────────────────────
// DRAWDOWN / FIRE PLANNER — live off an ETF portfolio drawdown
// Full Monte Carlo, pure JS. Works in REAL (today's-money) terms:
// realReturn ~ Normal(expReturn − inflation, volatility); expenses held constant in real terms.
// ─────────────────────────────────────────────

function ddConfig() {
  if (!S.drawdown) S.drawdown = deep(DEFAULTS.drawdown);
  return S.drawdown;
}

// Current net-of-CGT market value of all share portfolios, in base currency
function sharesNetBaseNow() {
  let net = 0;
  for (const pf of (S.portfolios || [])) {
    const price = pf.currentPrice || 0;
    const rate = xrate(pf.currency);
    const tr = getShareTaxRates(pf);
    for (const lot of (pf.lots || [])) {
      const market = (lot.shares || 0) * price;
      const cost = (lot.shares || 0) * (lot.grantPrice || 0);
      const gain = market - cost;
      const tax = gain > 0 ? gain * tr.total : 0;
      net += (market - tax) * rate;
    }
  }
  return net;
}

// Current cash balance = starting balance + net of all logged transactions
function cashBalanceNow() {
  const txs = S.transactions || [];
  return S.startingBalance + txs.reduce((s, t) => s + (t.type === 'income' ? txAmt(t) : -txAmt(t)), 0);
}

// Starting investable pot for the drawdown model
function drawdownPot() {
  const dd = ddConfig();
  if (dd.potSource === 'manual') return dd.manualPot || 0;
  let pot = (S.savings ? S.savings.startValue : 0) + sharesNetBaseNow();
  if (dd.includeCash) pot += cashBalanceNow();
  return pot;
}

// Annual living expenses in retirement (net needed), base currency
function drawdownAnnualExpense() {
  const dd = ddConfig();
  if (dd.expenseSource === 'manual') return dd.manualAnnualExpense || 0;
  // All recurring outgoings except savings/investment contributions (you stop those in drawdown)
  const items = (S.outgoings || []).filter(i => !efIsSavingsCat(i.category));
  return items.reduce((s, i) => s + itemMonthlyEquiv(i), 0) * 12;
}

// Effective tax on the gain portion of taxable withdrawals + annual allowance, per jurisdiction
function drawdownTaxProfile() {
  const dd = ddConfig();
  const loc = dd.location;
  const w = dd.wrappers[loc] || {};
  const t = dd.taxRates[loc] || {};
  if (loc === 'France') {
    const tot = (w.pea + w.av + w.cto) || 1;
    const effRate = (w.pea * t.peaRate + w.av * t.avRate + w.cto * t.ctoRate) / tot / 100;
    return {
      location: loc, effRate, allowance: t.allowance || 0,
      breakdown: [
        { key: 'PEA', pct: w.pea, rate: t.peaRate, note: '17.2% social charges only after 5 years (PEA-eligible ETFs)' },
        { key: 'Assurance Vie', pct: w.av, rate: t.avRate, note: '≈24.7% after 8 years, with a €' + (t.allowance || 0).toLocaleString() + ' annual gains allowance' },
        { key: 'CTO', pct: w.cto, rate: t.ctoRate, note: 'PFU flat tax 31.4% (12.8% income + 18.6% social, 2025+)' }
      ]
    };
  }
  const tot = (w.isa + w.sipp + w.gia) || 1;
  const effRate = (w.isa * t.isaRate + w.sipp * t.sippRate + w.gia * t.giaRate) / tot / 100;
  return {
    location: loc, effRate, allowance: t.allowance || 0,
    breakdown: [
      { key: 'ISA', pct: w.isa, rate: t.isaRate, note: 'Fully tax-free — no CGT or dividend tax' },
      { key: 'SIPP', pct: w.sipp, rate: t.sippRate, note: '25% tax-free, remainder taxed as income (modelled as an effective rate)' },
      { key: 'GIA', pct: w.gia, rate: t.giaRate, note: 'Taxable — CGT above the £' + (t.allowance || 0).toLocaleString() + ' allowance' }
    ]
  };
}

// Gross withdrawal needed to net `net` after tax on the gain portion (iterative — allowance makes it non-linear)
function grossForNet(net, gainFraction, effRate, allowance) {
  if (net <= 0) return 0;
  let gross = net;
  for (let i = 0; i < 6; i++) {
    const taxableGain = Math.max(0, gross * gainFraction - allowance);
    const tax = taxableGain * effRate;
    gross = net + tax;
  }
  return gross;
}

// Standard normal via Box–Muller
function gaussian(mean, sd) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * sd;
}

// Net (after-tax) guaranteed pension income at a given age, in REAL (today's-money) terms
function pensionNetIncomeAt(age, dd) {
  let inc = 0;
  for (const p of (dd.pensions || [])) {
    if (age < p.startAge) continue;
    let amt = p.annualAmount || 0;
    // Non-index-linked pensions lose real value over time (deflate from today)
    if (!p.inflationLinked) amt = amt / Math.pow(1 + (dd.inflationPct || 0) / 100, Math.max(0, age - dd.currentAge));
    inc += amt * (1 - (p.taxRatePct || 0) / 100);
  }
  return inc;
}

// Net value a DC pension pot releases into the liquid pot when it unlocks
function pensionPotNetValue(pp, bal) {
  const taxFree = bal * (pp.taxFreePct || 0) / 100;
  const taxable = bal - taxFree;
  return taxFree + taxable * (1 - (pp.incomeTaxPct || 0) / 100);
}

function computeDrawdown() {
  const dd = ddConfig();
  const pot0 = drawdownPot();
  const annualExpense = drawdownAnnualExpense();
  const realReturn = (dd.expReturnPct - dd.inflationPct) / 100;
  const vol = dd.volatilityPct / 100;
  const { effRate, allowance } = drawdownTaxProfile();
  const gf = (dd.gainFraction || 0) / 100;
  const startAge = dd.currentAge, retire = dd.retireAge, end = dd.horizonAge;
  const contrib = dd.annualContribution || 0;
  const runs = Math.max(50, Math.min(dd.simRuns || 500, 5000));
  const years = Math.max(1, end - startAge);
  const nCols = years + 1;

  // FIRE number (25× at 4%) and deterministic years-to-FIRE in real terms
  const fireNumber = annualExpense * (100 / (dd.withdrawalRate || 4));
  let yearsToFire = null;
  {
    let pot = pot0;
    for (let y = 0; y < 100; y++) {
      if (pot >= fireNumber) { yearsToFire = y; break; }
      pot = (pot + contrib) * (1 + realReturn);
    }
  }

  // Monte Carlo
  const paths = [];
  let successes = 0;
  const depletionAges = [];
  const endValues = [];
  for (let r = 0; r < runs; r++) {
    let pot = pot0;
    // Per-run DC pension pot balances (grow with the same market draws until they unlock)
    const pots = (dd.pensionPots || []).map(pp => ({ cfg: pp, bal: pp.currentValue || 0, unlocked: false }));
    const path = [pot];
    let depleted = false, depAge = null;
    for (let y = 0; y < years; y++) {
      const age = startAge + y;

      // Unlock any DC pension pots reaching their access age → net value folds into the liquid pot
      for (const pp of pots) {
        if (!pp.unlocked && age >= pp.cfg.accessAge) {
          pot += pensionPotNetValue(pp.cfg, pp.bal);
          pp.bal = 0; pp.unlocked = true;
        }
      }

      // Cashflow
      if (age < retire) {
        pot += contrib;
        for (const pp of pots) if (!pp.unlocked) pp.bal += (pp.cfg.annualContribution || 0);
      } else {
        const net = Math.max(0, annualExpense - pensionNetIncomeAt(age, dd));
        pot -= grossForNet(net, gf, effRate, allowance);
      }
      if (pot <= 0) { pot = 0; if (!depleted) { depleted = true; depAge = age; } }

      // Growth (same real return draw applied to liquid pot and still-locked pension pots)
      const ret = gaussian(realReturn, vol);
      pot = pot * (1 + ret);
      if (pot < 0) pot = 0;
      for (const pp of pots) if (!pp.unlocked) pp.bal = Math.max(0, pp.bal * (1 + ret));
      path.push(pot);
    }
    if (!depleted) successes++; else depletionAges.push(depAge);
    endValues.push(path[path.length - 1]);
    paths.push(path);
  }

  // Percentile fan per year
  const p10 = [], p50 = [], p90 = [];
  for (let c = 0; c < nCols; c++) {
    const col = paths.map(p => p[c]).sort((a, b) => a - b);
    p10.push(col[Math.floor(runs * 0.10)]);
    p50.push(col[Math.floor(runs * 0.50)]);
    p90.push(col[Math.floor(runs * 0.90)]);
  }

  const successRate = successes / runs;
  const medianDepletionAge = depletionAges.length
    ? depletionAges.slice().sort((a, b) => a - b)[Math.floor(depletionAges.length / 2)]
    : null;
  const medianEnd = endValues.slice().sort((a, b) => a - b)[Math.floor(runs / 2)];

  // Sustainable spend at the chosen SWR given the current pot (net, today's money)
  const sustainableGross = pot0 * (dd.withdrawalRate || 4) / 100;
  const taxOnSustainable = Math.max(0, sustainableGross * gf - allowance) * effRate;
  const sustainableNet = sustainableGross - taxOnSustainable;

  let status;
  if (successRate >= 0.90) status = { label: 'On track', color: 'var(--green)', key: 'ok' };
  else if (successRate >= 0.75) status = { label: 'Borderline', color: 'var(--gold)', key: 'warn' };
  else if (successRate >= 0.5) status = { label: 'At risk', color: 'var(--amber)', key: 'risk' };
  else status = { label: 'Unlikely to last', color: 'var(--red)', key: 'fail' };

  // Pension summary (at retirement age and at horizon) for display
  const pensionIncomeAtRetire = pensionNetIncomeAt(retire, dd);
  const pensionIncomeAtHorizon = pensionNetIncomeAt(end, dd);
  const totalPensionPots = (dd.pensionPots || []).reduce((s, pp) => s + (pp.currentValue || 0), 0);
  const nextPensionAge = (() => {
    const ages = [
      ...(dd.pensions || []).filter(p => p.startAge > retire).map(p => p.startAge),
      ...(dd.pensionPots || []).filter(pp => pp.accessAge > retire).map(pp => pp.accessAge)
    ].sort((a, b) => a - b);
    return ages.length ? ages[0] : null;
  })();

  return {
    pot0, annualExpense, realReturn, effRate, allowance, fireNumber, yearsToFire,
    startAge, retire, end, years, runs,
    successRate, medianDepletionAge, medianEnd,
    sustainableNet, sustainableGross,
    pensionIncomeAtRetire, pensionIncomeAtHorizon, totalPensionPots, nextPensionAge,
    fireProgress: fireNumber > 0 ? Math.min(pot0 / fireNumber, 1) : 0,
    p10, p50, p90, status
  };
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
  throw new Error('Price fetch failed — load history from a PC running the Cashflow server, then sync');
}

function parseYahooChart(data) {
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('No data returned for this ticker');
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const meta = result.meta;
  const currency = meta?.currency || 'USD';

  // Yahoo returns LSE prices in GBp (pence) — convert to GBP (pounds)
  const isPence = currency === 'GBp' || currency === 'GBX';
  const divisor = isPence ? 100 : 1;

  const history = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      const d = new Date(timestamps[i] * 1000);
      history.push({ date: d.toISOString().slice(0, 10), price: +(closes[i] / divisor).toFixed(4) });
    }
  }
  return {
    history,
    currentPrice: meta?.regularMarketPrice ? +(meta.regularMarketPrice / divisor).toFixed(4) : undefined,
    currency: isPence ? 'GBP' : currency,
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
  // Gate on the last successful NETWORK fetch, not the newest history date.
  // autoCacheSharePrice() stamps today's date with the cached currentPrice; keying
  // freshness off history dates let that stale stamp masquerade as fresh market data,
  // which froze prices forever. Refresh if never fetched or >6h since last fetch.
  const last = pf.pricesFetchedAt ? new Date(pf.pricesFetchedAt).getTime() : 0;
  if (!last) return true;
  return (Date.now() - last) > 6 * 60 * 60 * 1000;
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
  const s = Math.abs(v).toLocaleString(cur.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' + cur.symbol : cur.symbol) + s;
}

function currencySymbol() {
  return getCurrency().symbol;
}

// ─────────────────────────────────────────────
// TRANSACTIONS — actual logged entries
// ─────────────────────────────────────────────

// Transaction amount converted to base currency
function txAmt(tx) {
  return (tx.amount || 0) * xrate(tx.currency);
}

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
  const byMonth = {};
  for (const tx of txs) {
    const m = tx.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { inc: 0, out: 0 };
    if (tx.type === 'income') byMonth[m].inc += txAmt(tx);
    else byMonth[m].out += txAmt(tx);
  }
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
  const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + txAmt(t), 0);
  const out = txs.filter(t => t.type === 'outgoing').reduce((s, t) => s + txAmt(t), 0);
  return { inc, out, net: inc - out, count: txs.length, month: cm };
}

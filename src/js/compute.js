// ─────────────────────────────────────────────
// COMPUTE
// ─────────────────────────────────────────────
function amt(item, m) {
  return (item.overrides && item.overrides[m] !== undefined) ? item.overrides[m] : (item.base || 0);
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

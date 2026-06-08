// ─────────────────────────────────────────────
// UI — Tabs, Dashboard, Forecast, Items, Savings, Modal
// ─────────────────────────────────────────────

// CONFIG — all managed from Settings page now
function populateCfg() {
  document.getElementById('sav-start').value = S.savings.startValue;
  document.getElementById('sav-growth').value = S.savings.growthPct;
  updateCurrencyLabels();
}

function applySavingsCfg() {
  S.savings.startValue = parseFloat(document.getElementById('sav-start').value) || 0;
  S.savings.growthPct = parseFloat(document.getElementById('sav-growth').value) || 0;
  markDirty(); renderSavings();
}

// TABS
function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('on'));
  document.getElementById('tab-' + name).classList.add('on');
  el.classList.add('on');
  if (name === 'dashboard') renderDash();
  if (name === 'log') renderLog();
  if (name === 'forecast') renderForecast();
  if (name === 'savings') renderSavings();
  if (name === 'recurring') renderItems();
  if (name === 'shares') renderShares();
  if (name === 'settings') renderSettings();
}

// DASHBOARD
function renderDash() {
  if (!MONTHS.length) return;
  const d = compute();
  const minBal = Math.min(...d.bals), minI = d.bals.indexOf(minBal);
  const endBal = d.bals[d.bals.length - 1];
  const avgNet = d.net.reduce((a, b) => a + b, 0) / d.net.length;
  const endM = MONTHS[MONTHS.length - 1];

  // Actuals
  const act = computeActuals();
  const cm = currentMonthActuals();
  const txs = S.transactions || [];
  // Actual balance = starting balance + all transaction net
  const actualBal = S.startingBalance + txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);

  document.getElementById('chart-title').textContent = `Running Balance — ${mLabel(S.startMonth)} → ${mLabel(endM)}`;

  // Current balance (from transactions)
  const svAct = document.getElementById('sv-actual');
  svAct.textContent = fmt(Math.round(actualBal));
  svAct.className = 'sv ' + (actualBal < 0 ? 'neg' : 'pos');
  document.getElementById('ss-actual').textContent = txs.length > 0
    ? `From ${txs.length} transaction${txs.length === 1 ? '' : 's'}`
    : 'No transactions logged yet';

  // Balance (Start of Month) — starting balance + transactions before this month
  const curMonth = todayYYYYMM();
  const priorTxNet = txs.filter(t => t.date.slice(0, 7) < curMonth)
    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  const startOfMonthBal = S.startingBalance + priorTxNet;
  const svSoM = document.getElementById('sv-start-month');
  svSoM.textContent = fmt(Math.round(startOfMonthBal));
  svSoM.className = 'sv ' + (startOfMonthBal < 0 ? 'neg' : 'gld');
  document.getElementById('ss-start-month').textContent = mLabel(curMonth);

  // Balance (Start of Year) — starting balance + transactions before this year
  const curYear = new Date().getFullYear().toString();
  const priorYearTxNet = txs.filter(t => t.date.slice(0, 4) < curYear)
    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  const startOfYearBal = S.startingBalance + priorYearTxNet;
  const svSoY = document.getElementById('sv-start-year');
  svSoY.textContent = fmt(Math.round(startOfYearBal));
  svSoY.className = 'sv ' + (startOfYearBal < 0 ? 'neg' : 'gld');
  document.getElementById('ss-start-year').textContent = `Jan ${curYear}`;

  // This month
  const svMo = document.getElementById('sv-month');
  svMo.textContent = fmt(Math.round(cm.net));
  svMo.className = 'sv ' + (cm.net < 0 ? 'neg' : cm.net > 0 ? 'pos' : '');
  document.getElementById('ss-month').textContent = cm.count > 0
    ? `${mLabel(cm.month)} · ${cm.count} entries`
    : `${mLabel(cm.month)} · no entries yet`;

  // Forecast end
  const se = document.getElementById('sv-end');
  se.textContent = fmt(endBal); se.className = 'sv ' + (endBal < 0 ? 'neg' : 'pos');
  const negM = d.bals.filter(b => b < 0).length;
  document.getElementById('ss-end').textContent = mLabel(endM) + (negM ? ` · ${negM}mo deficit` : '');

  // Forecast min
  const sm = document.getElementById('sv-min');
  sm.textContent = fmt(minBal); sm.className = 'sv ' + (minBal < 0 ? 'neg' : 'pos');
  document.getElementById('ss-min').textContent = MONTHS[minI] ? mLabel(MONTHS[minI]) : '—';

  // Avg net
  const sa = document.getElementById('sv-avg');
  sa.textContent = fmt(Math.round(avgNet)); sa.className = 'sv ' + (avgNet < 0 ? 'neg' : 'pos');

  // Counts
  document.getElementById('sv-txcount').textContent = txs.length;
  document.getElementById('ss-txcount').textContent = txs.length > 0
    ? `Latest: ${txs.sort((a, b) => b.date.localeCompare(a.date))[0].date}`
    : 'None yet';
  document.getElementById('sv-budgetcount').textContent = S.income.length + S.outgoings.length;

  // Net Worth = Cash + Savings + Shares (net after CGT)
  const cashBal = actualBal;
  const savData = computeSavings();
  const savBal = savData.bals.length > 0 ? savData.bals[savData.bals.length - 1] : S.savings.startValue;
  // Shares: compute total net post-CGT in base currency across all portfolios
  let shNetBase = 0;
  let latestMarketDate = '';
  for (const pf of (S.portfolios || [])) {
    const price = pf.currentPrice || 0;
    const rate = xrate(pf.currency);
    const taxRates = getShareTaxRates(pf);
    for (const lot of (pf.lots || [])) {
      const market = (lot.shares || 0) * price;
      const cost = (lot.shares || 0) * (lot.grantPrice || 0);
      const gain = market - cost;
      const tax = gain > 0 ? gain * taxRates.total : 0;
      shNetBase += (market - tax) * rate;
    }
    const hist = pf.priceHistory || [];
    if (hist.length > 0) {
      const d = hist[hist.length - 1].date;
      if (d > latestMarketDate) latestMarketDate = d;
    }
  }
  const netWorth = cashBal + savBal + shNetBase;

  document.getElementById('nw-total').textContent = fmt(Math.round(netWorth));
  document.getElementById('nw-cash').textContent = fmt(Math.round(cashBal));
  document.getElementById('nw-savings').textContent = fmt(Math.round(savBal));
  document.getElementById('nw-shares').textContent = fmt(Math.round(shNetBase));

  // Last-updated timestamp
  const updatedEl = document.getElementById('nw-updated');
  if (latestMarketDate) {
    updatedEl.textContent = `Market: ${latestMarketDate}`;
  } else if ((S.portfolios || []).some(p => p.ticker)) {
    updatedEl.textContent = 'No market data';
  } else {
    updatedEl.textContent = '';
  }

  drawChart(d);
  renderAnnual(d);
}

async function refreshMarketData() {
  const portfolios = (S.portfolios || []).filter(pf => pf.ticker);
  if (portfolios.length === 0) return;
  const btn = document.getElementById('nw-refresh-btn');
  const updatedEl = document.getElementById('nw-updated');
  btn.classList.add('spinning');
  updatedEl.textContent = 'Updating…';

  const results = await Promise.all(portfolios.map(pf => fetchShareHistory(pf.ticker, '1y').then(r => ({ pf, r }))));
  btn.classList.remove('spinning');

  let updated = 0;
  for (const { pf, r } of results) {
    if (r.error || r.history.length === 0) continue;
    if (!pf.priceHistory) pf.priceHistory = [];
    const existing = new Map(pf.priceHistory.map(p => [p.date, p]));
    for (const h of r.history) existing.set(h.date, h);
    pf.priceHistory = [...existing.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (r.currentPrice) pf.currentPrice = r.currentPrice;
    updated++;
  }
  if (updated > 0) markDirty();
  renderDash();
}

function renderAnnual(d) {
  const yrs = [...new Set(MONTHS.map(m => +m.split('-')[0]))];
  let h = `<thead><tr><th></th>${yrs.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>`;
  const yInc = yrs.map(y => MONTHS.filter(m => m.startsWith(y + '')).reduce((s, m) => s + d.inc[MONTHS.indexOf(m)], 0));
  const yOut = yrs.map(y => MONTHS.filter(m => m.startsWith(y + '')).reduce((s, m) => s + d.out[MONTHS.indexOf(m)], 0));
  const yNet = yrs.map((_, i) => yInc[i] - yOut[i]);
  const yEnd = yrs.map(y => { const ms = MONTHS.filter(m => m.startsWith(y + '')); const i = MONTHS.indexOf(ms[ms.length - 1]); return d.bals[i] || 0; });
  h += `<tr><td>Total Income</td>${yInc.map(v => `<td class="cp">${fmt(Math.round(v))}</td>`).join('')}</tr>`;
  h += `<tr><td>Total Outgoings</td>${yOut.map(v => `<td class="cn">${fmt(Math.round(v))}</td>`).join('')}</tr>`;
  h += `<tr><td>Net</td>${yNet.map(v => `<td style="color:${v < 0 ? 'var(--red)' : 'var(--green)'}">${fmt(Math.round(v))}</td>`).join('')}</tr>`;
  h += `<tr><td>Year-End Balance</td>${yEnd.map(v => `<td style="color:${v < 0 ? 'var(--red)' : 'var(--gold)'};">${fmt(Math.round(v))}</td>`).join('')}</tr>`;
  h += '</tbody>';
  document.getElementById('at').innerHTML = h;
}

// SAVINGS
function renderSavings() {
  if (!MONTHS.length) return;
  const d = computeSavings();
  const endM = MONTHS[MONTHS.length - 1];
  const totalContrib = d.contribs.reduce((a, b) => a + b, 0);
  const totalGrowth = d.growth.reduce((a, b) => a + b, 0);
  const finalBal = d.bals[d.bals.length - 1];

  document.getElementById('sav-sv-open').textContent = fmt(S.savings.startValue);
  document.getElementById('sav-ss-open').textContent = mLabel(S.startMonth);
  document.getElementById('sav-sv-contrib').textContent = fmt(Math.round(totalContrib));
  document.getElementById('sav-sv-growth').textContent = fmt(Math.round(totalGrowth));
  document.getElementById('sav-ss-growth').textContent = S.savings.growthPct + '% p.a.';
  document.getElementById('sav-sv-end').textContent = fmt(Math.round(finalBal));
  document.getElementById('sav-ss-end').textContent = mLabel(endM);
  document.getElementById('sav-chart-title').textContent = `Savings Growth — ${mLabel(S.startMonth)} → ${mLabel(endM)}`;

  drawSavingsChart(d);
  renderSavingsAnnual(d);
  renderSavingsMonthly(d);
  renderSavingsItems(d.items);
}

function renderSavingsAnnual(d) {
  const yrs = [...new Set(MONTHS.map(m => +m.split('-')[0]))];
  let h = '<thead><tr><th>Year</th><th>Opening</th><th>Contributions</th><th>Growth Earned</th><th>Closing Balance</th></tr></thead><tbody>';
  let runBal = S.savings.startValue;
  yrs.forEach(yr => {
    const ms = MONTHS.map((m, i) => ({ m, i })).filter(x => +x.m.split('-')[0] === yr);
    const contrib = ms.reduce((s, x) => s + d.contribs[x.i], 0);
    const grw = ms.reduce((s, x) => s + d.growth[x.i], 0);
    const opening = runBal;
    runBal += contrib + grw;
    h += `<tr><td>${yr}</td><td>${fmt(Math.round(opening))}</td><td class="cp">+${fmt(Math.round(contrib))}</td><td class="cg">+${fmt(Math.round(grw))}</td><td style="color:var(--gold);font-weight:600">${fmt(Math.round(runBal))}</td></tr>`;
  });
  const totalC = d.contribs.reduce((a, b) => a + b, 0);
  const totalG = d.growth.reduce((a, b) => a + b, 0);
  h += `<tr><td>Total</td><td>${fmt(Math.round(S.savings.startValue))}</td><td class="cp">+${fmt(Math.round(totalC))}</td><td class="cg">+${fmt(Math.round(totalG))}</td><td>${fmt(Math.round(d.bals[d.bals.length - 1]))}</td></tr>`;
  h += '</tbody>';
  document.getElementById('sat').innerHTML = h;
}

function renderSavingsMonthly(d) {
  const itemNames = d.items.map(i => i.name);
  let h = '<thead><tr><th>Month</th>';
  itemNames.forEach(n => h += `<th>${n}</th>`);
  h += '<th>Total In</th><th>Growth</th><th>Balance</th></tr></thead><tbody>';
  MONTHS.forEach((m, i) => {
    h += `<tr><td>${mLabel(m)}</td>`;
    d.items.forEach(item => h += `<td class="cp">${amt(item, m) > 0 ? fmt(amt(item, m)) : '—'}</td>`);
    h += `<td class="cp" style="font-weight:600">${d.contribs[i] > 0 ? fmt(Math.round(d.contribs[i])) : '—'}</td>`;
    h += `<td class="cg">${d.growth[i] > 0.01 ? '+' + fmt(Math.round(d.growth[i])) : '—'}</td>`;
    h += `<td style="color:var(--gold);font-weight:600">${fmt(Math.round(d.bals[i]))}</td>`;
    h += '</tr>';
  });
  h += '</tbody>';
  document.getElementById('smt').innerHTML = h;
}

function renderSavingsItems(items) {
  const el = document.getElementById('sav-items-body');
  if (!items.length) {
    el.innerHTML = '<div class="sav-empty">No items with category <strong>Savings</strong> found. Go to Items tab and set an outgoing\'s category to "Savings".</div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const totalInPeriod = MONTHS.reduce((s, m) => s + amt(item, m), 0);
    const ovrCount = Object.keys(item.overrides || {}).length;
    return `<div class="sav-item-row"><div class="sav-item-name">${item.name}</div><div class="sav-item-base">${item.base > 0 ? fmt(item.base) + '/mo' : 'variable'}</div><div class="sav-item-note">${ovrCount} override${ovrCount === 1 ? '' : 's'} · Total in period: ${fmt(Math.round(totalInPeriod))}</div></div>`;
  }).join('');
}

// FORECAST
function renderForecast() {
  if (!MONTHS.length) return;
  const d = compute();
  const yrs = [...new Set(MONTHS.map(m => +m.split('-')[0]))];
  const iCats = [...new Set(S.income.map(i => i.category))];
  const oCats = [...new Set(S.outgoings.map(i => i.category))];

  let h = '<thead>';
  h += `<tr><th class="yh fh">Item</th>`;
  yrs.forEach(y => { const c = MONTHS.filter(m => m.startsWith(y + '')).length; h += `<th class="yh" colspan="${c}">${y}</th>`; });
  h += '</tr>';
  h += `<tr><th class="fh">Category / Name</th>`;
  MONTHS.forEach(m => { h += `<th>${MN[+m.split('-')[1] - 1]}</th>`; });
  h += '</tr></thead><tbody>';

  h += `<tr class="grp"><td colspan="${MONTHS.length + 1}">INCOME</td></tr>`;
  iCats.forEach(cat => {
    h += `<tr class="subgrp"><td colspan="${MONTHS.length + 1}">${cat}</td></tr>`;
    S.income.filter(i => i.category === cat).forEach(item => {
      h += `<tr><td>${item.name}</td>`;
      MONTHS.forEach(m => {
        const v = amt(item, m), io = item.overrides && item.overrides[m] !== undefined;
        h += `<td class="${[io ? 'co' : '', v === 0 ? 'cz' : 'cp'].filter(Boolean).join(' ')}" onclick="editCell(this,'income','${item.id}','${m}')">${v === 0 ? '—' : fmt(v)}</td>`;
      });
      h += '</tr>';
    });
  });
  h += `<tr class="tot-row"><td>Total Income</td>`;
  d.inc.forEach(v => h += `<td class="cp">${fmt(Math.round(v), false)}</td>`);
  h += '</tr>';

  h += `<tr class="grp"><td colspan="${MONTHS.length + 1}">OUTGOINGS</td></tr>`;
  oCats.forEach(cat => {
    h += `<tr class="subgrp"><td colspan="${MONTHS.length + 1}">${cat}</td></tr>`;
    S.outgoings.filter(i => i.category === cat).forEach(item => {
      h += `<tr><td>${item.name}</td>`;
      MONTHS.forEach(m => {
        const v = amt(item, m), io = item.overrides && item.overrides[m] !== undefined;
        h += `<td class="${[io ? 'co' : '', v === 0 ? 'cz' : 'cn'].filter(Boolean).join(' ')}" onclick="editCell(this,'outgoings','${item.id}','${m}')">${v === 0 ? '—' : fmt(v)}</td>`;
      });
      h += '</tr>';
    });
  });
  h += `<tr class="tot-row"><td>Total Outgoings</td>`;
  d.out.forEach(v => h += `<td class="cn">${fmt(Math.round(v), false)}</td>`);
  h += '</tr>';
  h += `<tr class="tot-row"><td>Monthly Net</td>`;
  d.net.forEach(v => h += `<td style="color:${v < 0 ? 'var(--red)' : 'var(--green)'}">${fmt(Math.round(v), false)}</td>`);
  h += '</tr>';
  h += `<tr class="bal-row"><td style="color:var(--gold);font-weight:700">Running Balance</td>`;
  d.bals.forEach(v => h += `<td style="color:${v < 0 ? 'var(--red)' : 'var(--gold)'}">${fmt(Math.round(v))}</td>`);
  h += '</tr></tbody>';
  document.getElementById('ft').innerHTML = h;
}

// INLINE CELL EDIT
let _ac = null, _acd = null;

function editCell(td, type, id, month) {
  if (_ac) cancelEdit();
  const items = type === 'income' ? S.income : S.outgoings;
  const item = items.find(i => i.id === id); if (!item) return;
  const cur = amt(item, month);
  _ac = td; _acd = { type, id, month };
  const inp = document.createElement('input');
  inp.type = 'number'; inp.className = 'cell-inp'; inp.value = cur; inp.step = '0.01';
  inp.onkeydown = e => { if (e.key === 'Enter') confirmEdit(inp.value); if (e.key === 'Escape') cancelEdit(); if (e.key === 'Tab') { e.preventDefault(); confirmEdit(inp.value); } };
  inp.onblur = () => setTimeout(() => { if (_ac === td) confirmEdit(inp.value); }, 180);
  td.textContent = ''; td.appendChild(inp); inp.focus(); inp.select();
}

function confirmEdit(raw) {
  if (!_ac || !_acd) return;
  const { type, id, month } = _acd;
  const v = parseFloat(raw);
  if (!isNaN(v)) {
    const items = type === 'income' ? S.income : S.outgoings;
    const item = items.find(i => i.id === id);
    if (item) { if (!item.overrides) item.overrides = {}; item.overrides[month] = v; markDirty(); }
  }
  _ac = null; _acd = null; renderForecast();
}

function cancelEdit() { if (!_ac) return; _ac = null; _acd = null; renderForecast(); }

// ITEMS
function renderItems() { renderList('income'); renderList('outgoings'); }

function renderList(type) {
  const items = type === 'income' ? S.income : S.outgoings;
  const base = (S.settings && S.settings.currency) || 'GBP';
  const el = document.getElementById(type === 'income' ? 'inc-list' : 'out-list');
  const FREQ_LABELS = { monthly: 'Monthly', weekly: 'Weekly', fortnightly: 'Fortnightly', quarterly: 'Quarterly', annual: 'Annual', 'one-off': 'One-off' };
  el.innerHTML = items.map(item => {
    const oc = Object.keys(item.overrides || {}).length;
    const isForeign = item.currency && item.currency !== base;
    const freq = item.frequency || 'monthly';
    const freqLabel = FREQ_LABELS[freq] || freq;
    const nativeAmt = (item.base || 0) > 0 ? fmtAs(item.base, item.currency || base) : '—';
    const perLabel = freq === 'weekly' ? '/wk' : freq === 'fortnightly' ? '/2wk' : freq === 'quarterly' ? '/qtr' : freq === 'annual' ? '/yr' : freq === 'one-off' ? '' : '/mo';
    const convertedAmt = isForeign && (item.base || 0) > 0
      ? ` → ${fmt(item.base * xrate(item.currency))}`
      : '';
    return `<div class="ir">
      <div class="icat">${item.category}</div>
      ${freq !== 'monthly' ? `<div class="ifreq">${freqLabel}</div>` : ''}
      ${isForeign ? `<div class="icur">${item.currency}</div>` : ''}
      <div class="iname">${item.name}</div>
      <div class="ibase">${nativeAmt}${perLabel}${convertedAmt ? `<span style="font-size:10px;color:var(--dim);font-weight:400"> ${convertedAmt}</span>` : ''}</div>
      <div class="iovr">${oc ? oc + ' override' + (oc === 1 ? '' : 's') : ''}</div>
      <div class="iact">
        <button class="btn btn-sm" onclick="openEdit('${type}','${item.id}')">Edit</button>
        <button class="btn btn-sm btn-del" onclick="delItem('${type}','${item.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// MODAL
let _mOvr = {};

function openAdd(type) {
  const cats = [...new Set((type === 'income' ? S.income : S.outgoings).map(i => i.category))];
  document.getElementById('cat-list').innerHTML = cats.map(c => `<option>${c}</option>`).join('');
  document.getElementById('mod-title').textContent = 'Add Recurring ' + (type === 'income' ? 'Income' : 'Outgoing');
  document.getElementById('mod-type').value = type; document.getElementById('mod-id').value = '';
  document.getElementById('mod-name').value = ''; document.getElementById('mod-cat').value = '';
  document.getElementById('mod-base').value = '0';
  document.getElementById('mod-freq').value = 'monthly';
  populateFreqMonth(null);
  updateFreqUI();
  populateModalCurrency(null);
  _mOvr = {}; buildOvrList(); buildMonthSel({});
  document.getElementById('imod').classList.add('open');
}

function openEdit(type, id) {
  const items = type === 'income' ? S.income : S.outgoings;
  const item = items.find(i => i.id === id); if (!item) return;
  const cats = [...new Set(items.map(i => i.category))];
  document.getElementById('cat-list').innerHTML = cats.map(c => `<option>${c}</option>`).join('');
  document.getElementById('mod-title').textContent = 'Edit Recurring Item';
  document.getElementById('mod-type').value = type; document.getElementById('mod-id').value = id;
  document.getElementById('mod-name').value = item.name; document.getElementById('mod-cat').value = item.category;
  document.getElementById('mod-base').value = item.base || 0;
  document.getElementById('mod-freq').value = item.frequency || 'monthly';
  populateFreqMonth(item.frequencyMonth || null);
  updateFreqUI();
  populateModalCurrency(item.currency || null);
  _mOvr = Object.assign({}, item.overrides || {});
  buildOvrList(); buildMonthSel(_mOvr);
  document.getElementById('imod').classList.add('open');
}

function populateFreqMonth(selected) {
  const sel = document.getElementById('mod-freq-month');
  sel.innerHTML = MN.map((n, i) => `<option value="${i + 1}" ${(i + 1) === selected ? 'selected' : ''}>${n}</option>`).join('');
}

function updateFreqUI() {
  const freq = document.getElementById('mod-freq').value;
  const monthSel = document.getElementById('mod-freq-month');
  const hint = document.getElementById('mod-freq-hint');
  const label = document.getElementById('mod-base-label');

  const needsMonth = (freq === 'quarterly' || freq === 'annual');
  monthSel.style.display = needsMonth ? '' : 'none';

  const labels = {
    monthly: 'Amount Per Month', weekly: 'Amount Per Week', fortnightly: 'Amount Per Fortnight',
    quarterly: 'Amount Per Quarter', annual: 'Amount Per Year', 'one-off': 'One-off Amount'
  };
  label.textContent = labels[freq] || 'Amount';

  const hints = {
    weekly: 'Converted to ~4.33× per month in forecast',
    fortnightly: 'Converted to ~2.17× per month in forecast',
    quarterly: 'Applied every 3 months starting from selected month',
    annual: 'Applied once per year in selected month',
    'one-off': 'Use overrides to set the specific month'
  };
  hint.textContent = hints[freq] || '';
}

function populateModalCurrency(itemCurrency) {
  const sel = document.getElementById('mod-currency');
  const base = (S.settings && S.settings.currency) || 'GBP';
  const selected = itemCurrency || base;
  sel.innerHTML = Object.entries(CURRENCIES)
    .map(([code, c]) => `<option value="${code}" ${code === selected ? 'selected' : ''}>${code} — ${c.name}</option>`)
    .join('');
  updateModalCurrencyHint();
}

function updateModalCurrencyHint() {
  const code = document.getElementById('mod-currency').value;
  const base = (S.settings && S.settings.currency) || 'GBP';
  const hint = document.getElementById('mod-fx-hint');
  const sym = document.querySelector('.mod-cur-sym');
  if (sym) sym.textContent = (CURRENCIES[code] || {}).symbol || code;
  if (code === base) {
    hint.textContent = '(base currency)';
  } else {
    const rate = xrate(code);
    if (rate === 1) {
      hint.textContent = '⚠ No rate set — go to Settings → Exchange Rates';
      hint.style.color = 'var(--amber)';
    } else {
      hint.textContent = `1 ${code} = ${rate} ${base}`;
      hint.style.color = 'var(--dim)';
    }
  }
}

function buildOvrList() {
  const el = document.getElementById('ovr-list');
  const keys = Object.keys(_mOvr).sort();
  if (!keys.length) { el.innerHTML = '<div class="ovr-note">No monthly overrides. Use the Forecast table to edit individual cells, or add overrides below.</div>'; return; }
  el.innerHTML = keys.map(m => `<div class="oi"><span class="om">${mLabel(m)}</span><input type="number" class="ov" data-m="${m}" value="${_mOvr[m]}" step="0.01" onchange="_mOvr[this.dataset.m]=parseFloat(this.value)||0"><button class="orb" onclick="removeOvr('${m}')">✕</button></div>`).join('');
}

function buildMonthSel(existing) {
  const sel = document.getElementById('ovr-mon');
  const allM = buildMonths(S.startMonth, 10);
  const used = new Set(Object.keys(existing));
  sel.innerHTML = allM.filter(m => !used.has(m)).map(m => `<option value="${m}">${mLabel(m)}</option>`).join('');
}

function removeOvr(m) { delete _mOvr[m]; buildOvrList(); buildMonthSel(_mOvr); }

function addOverride() {
  const sel = document.getElementById('ovr-mon'); const m = sel.value; if (!m) return;
  _mOvr[m] = parseFloat(document.getElementById('mod-base').value) || 0;
  buildOvrList(); buildMonthSel(_mOvr);
}

function saveItem() {
  const type = document.getElementById('mod-type').value;
  const id = document.getElementById('mod-id').value;
  const name = document.getElementById('mod-name').value.trim();
  const cat = document.getElementById('mod-cat').value.trim();
  const base = parseFloat(document.getElementById('mod-base').value) || 0;
  const itemCur = document.getElementById('mod-currency').value;
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const freq = document.getElementById('mod-freq').value;
  const freqMonth = (freq === 'quarterly' || freq === 'annual') ? +document.getElementById('mod-freq-month').value : undefined;
  if (!name) return alert('Please enter a name.');
  document.querySelectorAll('#ovr-list .ov').forEach(inp => { const v = parseFloat(inp.value); if (!isNaN(v)) _mOvr[inp.dataset.m] = v; });
  const items = type === 'income' ? S.income : S.outgoings;
  const curVal = (itemCur && itemCur !== baseCur) ? itemCur : undefined;
  const freqVal = freq !== 'monthly' ? freq : undefined;
  if (id) {
    const item = items.find(i => i.id === id);
    if (item) { item.name = name; item.category = cat; item.base = base; item.overrides = Object.assign({}, _mOvr); item.currency = curVal; item.frequency = freqVal; item.frequencyMonth = freqMonth; }
  } else {
    items.push({ id: name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now(), name, category: cat, base, overrides: Object.assign({}, _mOvr), currency: curVal, frequency: freqVal, frequencyMonth: freqMonth });
  }
  markDirty(); closeModal(); renderItems();
  if (document.getElementById('tab-forecast').classList.contains('on')) renderForecast();
  if (document.getElementById('tab-dashboard').classList.contains('on')) renderDash();
}

function delItem(type, id) {
  if (!confirm('Delete this item?')) return;
  if (type === 'income') S.income = S.income.filter(i => i.id !== id);
  else S.outgoings = S.outgoings.filter(i => i.id !== id);
  markDirty(); renderItems();
}

function closeModal() { document.getElementById('imod').classList.remove('open'); }

function renderAll() {
  if (document.getElementById('tab-dashboard').classList.contains('on')) renderDash();
  if (document.getElementById('tab-log').classList.contains('on')) renderLog();
  if (document.getElementById('tab-forecast').classList.contains('on')) renderForecast();
  if (document.getElementById('tab-savings').classList.contains('on')) renderSavings();
  if (document.getElementById('tab-recurring').classList.contains('on')) renderItems();
  if (document.getElementById('tab-shares').classList.contains('on')) renderShares();
  if (document.getElementById('tab-settings').classList.contains('on')) renderSettings();
}

// ─────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────
function updateCurrencyLabels() {
  const sym = currencySymbol();
  document.querySelectorAll('.cur-sym').forEach(el => el.textContent = sym);
  const setLabel = document.getElementById('set-cur-label');
  if (setLabel) setLabel.textContent = sym;
}

function renderSettings() {
  // Currency dropdown
  const sel = document.getElementById('set-currency');
  const curCode = (S.settings && S.settings.currency) || 'GBP';
  sel.innerHTML = Object.entries(CURRENCIES)
    .map(([code, c]) => `<option value="${code}" ${code === curCode ? 'selected' : ''}>${c.name}</option>`)
    .join('');

  // Forecast settings mirror
  const [sy, sm] = S.startMonth.split('-').map(Number);
  const setMon = document.getElementById('set-mon');
  setMon.innerHTML = MN.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  setMon.value = sm;
  const setYr = document.getElementById('set-yr');
  setYr.innerHTML = '';
  for (let y = 2020; y <= 2035; y++) setYr.innerHTML += `<option value="${y}">${y}</option>`;
  setYr.value = sy;
  document.getElementById('set-bal').value = S.startingBalance;
  document.getElementById('set-fy').value = S.forecastYears;

  updateCurrencyLabels();
  renderExchangeRates();
  populateSharesSettings();
}

function applySettings() {
  const newCur = document.getElementById('set-currency').value;
  if (!S.settings) S.settings = {};
  S.settings.currency = newCur;
  markDirty();
  updateCurrencyLabels();
  renderSettings();
}

function applySettingsForecast() {
  const mon = +document.getElementById('set-mon').value;
  const yr = +document.getElementById('set-yr').value;
  const bal = parseFloat(document.getElementById('set-bal').value) || 0;
  const fy = +document.getElementById('set-fy').value;
  S.startMonth = `${yr}-${String(mon).padStart(2, '0')}`;
  S.startingBalance = bal;
  S.forecastYears = fy;
  markDirty();
  rebuildMonths();
  populateCfg();
}

function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cashflow-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.income || !data.outgoings) throw new Error('Invalid format');
      S = data;
      if (!S.savings) S.savings = deep(DEFAULTS.savings);
      if (!S.settings) S.settings = deep(DEFAULTS.settings);
      save();
      populateCfg();
      rebuildMonths();
      renderAll();
      alert('Data imported successfully.');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ─────────────────────────────────────────────
// EXCHANGE RATES UI
// ─────────────────────────────────────────────
function getForeignCurrenciesInUse() {
  const base = (S.settings && S.settings.currency) || 'GBP';
  const used = new Set();
  [...S.income, ...S.outgoings].forEach(item => {
    if (item.currency && item.currency !== base) used.add(item.currency);
  });
  return [...used].sort();
}

function renderExchangeRates() {
  const base = (S.settings && S.settings.currency) || 'GBP';
  const foreign = getForeignCurrenciesInUse();
  const list = document.getElementById('fx-rates-list');
  const noFx = document.getElementById('fx-no-foreign');
  const rates = (S.settings && S.settings.exchangeRates) || {};

  if (foreign.length === 0) {
    list.innerHTML = '';
    noFx.style.display = '';
    return;
  }
  noFx.style.display = 'none';

  // Count items per foreign currency
  const itemCounts = {};
  [...S.income, ...S.outgoings].forEach(item => {
    if (item.currency && item.currency !== base) {
      itemCounts[item.currency] = (itemCounts[item.currency] || 0) + 1;
    }
  });

  list.innerHTML = foreign.map(code => {
    const rate = rates[code] || '';
    const cur = CURRENCIES[code] || {};
    const count = itemCounts[code] || 0;
    return `<div class="fx-row">
      <div class="fx-label">${code}</div>
      <div class="fx-eq">1 ${code} =</div>
      <input type="number" class="fx-input" data-code="${code}" value="${rate}" step="0.0001" min="0"
        placeholder="0.0000" onchange="applyManualRate('${code}', this.value)">
      <div class="fx-base">${base}</div>
      <div class="fx-item-tag">${count} item${count === 1 ? '' : 's'}</div>
    </div>`;
  }).join('');

  // Show last-updated timestamp
  const status = document.getElementById('fx-status');
  if (S.settings.ratesLastUpdated) {
    const d = new Date(S.settings.ratesLastUpdated);
    status.textContent = `Last fetched: ${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    status.textContent = foreign.length > 0 ? 'Rates not yet fetched' : '';
  }
}

function applyManualRate(code, val) {
  const rate = parseFloat(val);
  if (!S.settings.exchangeRates) S.settings.exchangeRates = {};
  if (!isNaN(rate) && rate > 0) {
    S.settings.exchangeRates[code] = +rate.toFixed(6);
  } else {
    delete S.settings.exchangeRates[code];
  }
  markDirty();
}

async function doFetchRates() {
  const btn = document.getElementById('fx-fetch-btn');
  const status = document.getElementById('fx-status');
  btn.disabled = true;
  btn.textContent = '⟳ Fetching…';
  status.textContent = 'Contacting frankfurter.app…';
  status.style.color = 'var(--dim)';

  const result = await fetchExchangeRates();

  if (result.error) {
    status.textContent = '⚠ ' + result.error;
    status.style.color = 'var(--red)';
  } else if (Object.keys(result.rates).length === 0) {
    status.textContent = 'No foreign currencies to fetch rates for.';
    status.style.color = 'var(--dim)';
  } else {
    // Merge fetched rates into settings (preserves manual overrides for currencies not fetched)
    if (!S.settings.exchangeRates) S.settings.exchangeRates = {};
    for (const [code, rate] of Object.entries(result.rates)) {
      S.settings.exchangeRates[code] = rate;
    }
    S.settings.ratesLastUpdated = new Date().toISOString();
    markDirty();
    status.textContent = `✓ Updated ${Object.keys(result.rates).length} rate(s) — ECB data from ${result.date}`;
    status.style.color = 'var(--green)';
    renderExchangeRates();
  }

  btn.disabled = false;
  btn.textContent = '⟳ Fetch Live Rates';
}

// ─────────────────────────────────────────────
// SHARES TAB
// ─────────────────────────────────────────────
let _selectedPfId = 'all';
let _sharesChartRange = '1y';
let _pendingImportLots = [];
let _pendingImportMeta = null;
let _importTargetPfId = null;
let _openShareLotPfId = null;

function escHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPortfolioById(id) {
  return (S.portfolios || []).find(pf => pf.id === id) || null;
}

function calcPortfolioTax(pf, gain) {
  if (gain <= 0) return { incomeTax: 0, socialCharges: 0, total: 0 };
  const rates = getShareTaxRates(pf);
  return {
    incomeTax: gain * rates.incomeTax,
    socialCharges: gain * rates.socialCharges,
    total: gain * rates.total
  };
}

function formatChartMoney(v, code, digits = 0) {
  const cur = CURRENCIES[code] || CURRENCIES[(S.settings && S.settings.currency) || 'GBP'] || CURRENCIES.GBP;
  try {
    return new Intl.NumberFormat(cur.locale || 'en-GB', {
      style: 'currency',
      currency: code || ((S.settings && S.settings.currency) || 'GBP'),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(v);
  } catch {
    return `${cur.symbol || ''}${Number(v || 0).toFixed(digits)}`;
  }
}

function computePortfolioSummary(pf) {
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const lots = (pf.lots || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const price = pf.currentPrice || 0;
  const rate = xrate(pf.currency || baseCur);
  const rows = [];
  let totalShares = 0, totalMarket = 0, totalCost = 0, totalGain = 0;
  let totalIncomeTax = 0, totalSocialCharges = 0, totalTax = 0, totalNet = 0;

  for (const lot of lots) {
    const shares = lot.shares || 0;
    const grantPrice = lot.grantPrice || 0;
    const market = shares * price;
    const cost = shares * grantPrice;
    const gain = market - cost;
    const tax = calcPortfolioTax(pf, gain);
    const net = market - tax.total;

    totalShares += shares;
    totalMarket += market;
    totalCost += cost;
    totalGain += gain;
    totalIncomeTax += tax.incomeTax;
    totalSocialCharges += tax.socialCharges;
    totalTax += tax.total;
    totalNet += net;

    rows.push({
      pf,
      lot,
      shares,
      grantPrice,
      market,
      cost,
      gain,
      tax,
      net,
      marketBase: market * rate,
      gainBase: gain * rate,
      netBase: net * rate
    });
  }

  return {
    pf,
    rows,
    lots,
    totalShares,
    totalMarket,
    totalCost,
    totalGain,
    totalIncomeTax,
    totalSocialCharges,
    totalTax,
    totalNet,
    totalMarketBase: totalMarket * rate,
    totalGainBase: totalGain * rate,
    totalNetBase: totalNet * rate,
    rate
  };
}

function computeCombinedPortfolioSummary(portfolios) {
  const summaries = portfolios.map(pf => computePortfolioSummary(pf));
  const rows = summaries
    .flatMap(summary => summary.rows)
    .sort((a, b) => {
      const d = (a.lot.date || '').localeCompare(b.lot.date || '');
      return d !== 0 ? d : (a.pf.label || '').localeCompare(b.pf.label || '');
    });

  return {
    summaries,
    rows,
    totalPortfolios: portfolios.length,
    totalLots: rows.length,
    totalShares: summaries.reduce((sum, summary) => sum + summary.totalShares, 0),
    totalMarketBase: summaries.reduce((sum, summary) => sum + summary.totalMarketBase, 0),
    totalGainBase: summaries.reduce((sum, summary) => sum + summary.totalGainBase, 0),
    totalNetBase: summaries.reduce((sum, summary) => sum + summary.totalNetBase, 0)
  };
}

function portfolioHeaderSubtext(pf) {
  const history = (pf.priceHistory || []);
  if (!pf.ticker) return 'Add a ticker in Settings to enable price history.';
  if (window._shFetching && pfNeedsFetch(pf)) return 'Refreshing price history…';
  if (history.length === 0) return 'No cached history yet.';
  const latest = history[history.length - 1];
  return `${history.length} cached prices · latest ${latest.date}`;
}

function setSelectedSharePortfolio(id) {
  _selectedPfId = id || 'all';
  renderShares();
}

function setSharesChartRange(range) {
  _sharesChartRange = range || '1y';
  renderShares();
}

function renderSharesHeader(portfolios) {
  const options = [
    `<option value="all" ${_selectedPfId === 'all' ? 'selected' : ''}>All Portfolios</option>`,
    ...portfolios.map(pf => `<option value="${pf.id}" ${pf.id === _selectedPfId ? 'selected' : ''}>${escHtml(pf.label || 'Portfolio')}</option>`)
  ].join('');

  const ranges = [
    ['3m', '3M'],
    ['6m', '6M'],
    ['1y', '1Y'],
    ['3y', '3Y'],
    ['5y', '5Y'],
    ['max', 'Max']
  ].map(([value, label]) => `<option value="${value}" ${value === _sharesChartRange ? 'selected' : ''}>${label}</option>`).join('');

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Shares</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
        <div style="flex:1;min-width:240px">
          <div style="font-size:11px;color:var(--dim);margin-bottom:6px">Portfolio</div>
          <select class="si" style="width:100%" onchange="setSelectedSharePortfolio(this.value)">${options}</select>
        </div>
        <div style="min-width:160px">
          <div style="font-size:11px;color:var(--dim);margin-bottom:6px">Chart Range</div>
          <select class="si" style="width:100%" onchange="setSharesChartRange(this.value)">${ranges}</select>
        </div>
      </div>
    </div>
  `;
}

function renderSharesEmptyState() {
  return `
    <div class="card">
      <div class="card-title">No portfolios yet</div>
      <div style="color:var(--dim)">Go to Settings and add a share portfolio to track lots, prices, and gains.</div>
    </div>
  `;
}

function renderCombinedStats(summary) {
  return `
    <div class="stats" style="margin-bottom:16px">
      <div class="sc"><div class="sl">Total Shares</div><div class="sv">${summary.totalShares.toLocaleString()}</div><div class="ss">${summary.totalLots} lot${summary.totalLots === 1 ? '' : 's'} across ${summary.totalPortfolios} portfolio${summary.totalPortfolios === 1 ? '' : 's'}</div></div>
      <div class="sc"><div class="sl">Market Value</div><div class="sv cp">${fmt(Math.round(summary.totalMarketBase))}</div><div class="ss">Combined in base currency</div></div>
      <div class="sc"><div class="sl">Gain</div><div class="sv ${summary.totalGainBase < 0 ? 'cn' : 'cp'}">${fmt(Math.round(summary.totalGainBase))}</div><div class="ss">Unrealised across all lots</div></div>
      <div class="sc"><div class="sl">Net After CGT</div><div class="sv ${summary.totalNetBase < 0 ? 'cn' : 'cp'}">${fmt(Math.round(summary.totalNetBase))}</div><div class="ss">After each portfolio’s tax settings</div></div>
    </div>
  `;
}

function renderPortfolioStats(summary) {
  const { pf, totalShares, totalMarket, totalGain, totalNet, totalCost, rate, lots } = summary;
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const rates = getShareTaxRates(pf);
  const showBase = (pf.currency || baseCur) !== baseCur && rate !== 1;
  const priceText = pf.currentPrice > 0 ? formatChartMoney(pf.currentPrice, pf.currency || baseCur, 2) : '—';
  const returnPct = totalCost > 0 ? `${(totalGain / totalCost * 100).toFixed(1)}% return` : '—';

  return `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <div class="card-title" style="margin-bottom:4px">${escHtml(pf.label || 'Portfolio')}</div>
          <div style="font-size:12px;color:var(--dim)">${escHtml(pf.companyName || 'No company set')}${pf.ticker ? ` · ${escHtml(pf.ticker)}` : ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'DM Mono',monospace;font-weight:700;color:var(--gold)">${priceText}</div>
          <div style="font-size:11px;color:var(--dim)">${portfolioHeaderSubtext(pf)}</div>
        </div>
      </div>
      <div class="stats">
        <div class="sc"><div class="sl">Shares</div><div class="sv">${totalShares.toLocaleString()}</div><div class="ss">${lots.length} lot${lots.length === 1 ? '' : 's'}</div></div>
        <div class="sc"><div class="sl">Market Value</div><div class="sv cp">${fmtAs(Math.round(totalMarket), pf.currency || baseCur)}</div><div class="ss">${showBase ? `≈ ${fmt(Math.round(totalMarket * rate))}` : `@ ${priceText}/share`}</div></div>
        <div class="sc"><div class="sl">Gain</div><div class="sv ${totalGain < 0 ? 'cn' : 'cp'}">${fmtAs(Math.round(totalGain), pf.currency || baseCur)}</div><div class="ss">${returnPct}</div></div>
        <div class="sc"><div class="sl">Net After CGT</div><div class="sv ${totalNet < 0 ? 'cn' : 'cp'}">${fmtAs(Math.round(totalNet), pf.currency || baseCur)}</div><div class="ss">${rates.totalPct}% tax (${rates.incomeTaxPct}% + ${rates.socialChargesPct}%)</div></div>
      </div>
    </div>
  `;
}

function renderPortfolioChartShell(summary) {
  const pf = summary.pf;
  const filteredPriceHistory = filterShareHistoryByRange(pf.priceHistory || [], _sharesChartRange);
  const filteredValueHistory = filterPortfolioHistoryByRange(computePortfolioHistory(pf), _sharesChartRange);

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-title">Price History</div>
        ${filteredPriceHistory.length >= 2
          ? '<canvas id="sh-price-chart"></canvas>'
          : `<div style="color:var(--dim)">${pf.ticker ? 'Waiting for enough cached price history to draw the chart.' : 'Add a ticker in Settings to enable price history.'}</div>`}
      </div>
      <div class="card">
        <div class="card-title">Portfolio Value & Gains</div>
        ${filteredValueHistory.dates.length >= 2
          ? '<canvas id="sh-value-chart"></canvas>'
          : '<div style="color:var(--dim)">Add at least one lot and fetch price history to plot value and gains over time.</div>'}
      </div>
    </div>
  `;
}

function renderPortfolioActions(summary) {
  const pf = summary.pf;
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const isOpen = _openShareLotPfId === pf.id;
  const importMeta = _importTargetPfId === pf.id ? _pendingImportMeta : null;

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Manage Lots</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:${isOpen || importMeta ? '12px' : '0'}">
        <button class="btn btn-sm" onclick="toggleAddLot('${pf.id}')">${isOpen ? '− Hide Add Lot' : '+ Add Lot'}</button>
        <button class="btn btn-sm" onclick="document.getElementById('sh-csv-${pf.id}').click()">Import CSV</button>
        <input type="file" id="sh-csv-${pf.id}" accept=".csv,.txt" style="display:none" onchange="handleShareCSV(this,'${pf.id}')">
        <span class="tooltip-trigger" tabindex="0">?
          <span class="tooltip-body">Import share lots from CSV with columns like <code>Date</code>, <code>Label</code>, <code>Shares</code>, and optional <code>Grant Price</code>. Missing prices are resolved from cached history when available.</span>
        </span>
        ${pfNeedsFetch(pf) ? '<span class="sh-import-info" style="padding:4px 8px">Auto-refresh will fetch stale prices.</span>' : ''}
      </div>
      ${isOpen ? `
        <div class="sh-add-lot" style="padding:14px;border:1px solid var(--border);border-radius:var(--r);margin-bottom:${importMeta ? '12px' : '0'}">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
            <div class="sf" style="margin:0"><label>Date</label><input type="date" class="si" id="sh-lot-date-${pf.id}" value="${todayISO()}"></div>
            <div class="sf" style="margin:0"><label>Label</label><input class="si" id="sh-lot-label-${pf.id}" placeholder="Vest ${todayISO()}"></div>
            <div class="sf" style="margin:0"><label>Shares</label><input type="number" class="si" id="sh-lot-shares-${pf.id}" min="1" step="1" placeholder="0"></div>
            <div class="sf" style="margin:0"><label>Grant Price (${escHtml(pf.currency || baseCur)})</label><input type="number" class="si" id="sh-lot-price-${pf.id}" min="0" step="0.01" placeholder="0.00"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-g btn-sm" onclick="addShareLot('${pf.id}')">Save Lot</button>
            <button class="btn btn-sm" onclick="toggleAddLot('${pf.id}')">Cancel</button>
          </div>
        </div>
      ` : ''}
      ${importMeta ? renderImportPreviewCard(pf, importMeta) : ''}
    </div>
  `;
}

function renderCombinedLotsTable(summary) {
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const rowsHtml = summary.rows.length
    ? summary.rows.map(row => {
      const nativeCode = row.pf.currency || baseCur;
      const showBase = nativeCode !== baseCur;
      return `
        <tr>
          <td>${escHtml(row.pf.label || 'Portfolio')}</td>
          <td>${escHtml(row.lot.date || '—')}</td>
          <td>${escHtml(row.lot.label || '—')}</td>
          <td>${row.shares.toLocaleString()}</td>
          <td>${fmtAs(row.grantPrice, nativeCode)}</td>
          <td>${fmtAs(Math.round(row.market), nativeCode)}${showBase ? `<br><span class="ss">≈ ${fmt(Math.round(row.marketBase))}</span>` : ''}</td>
          <td class="${row.gain >= 0 ? 'cp' : 'cn'}">${fmtAs(Math.round(row.gain), nativeCode)}${showBase ? `<br><span class="ss">≈ ${fmt(Math.round(row.gainBase))}</span>` : ''}</td>
          <td class="${row.net >= 0 ? 'cp' : 'cn'}">${fmtAs(Math.round(row.net), nativeCode)}${showBase ? `<br><span class="ss">≈ ${fmt(Math.round(row.netBase))}</span>` : ''}</td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="8" style="text-align:left;color:var(--dim)">No share lots yet.</td></tr>';

  return `
    <div class="card">
      <div class="card-title">All Share Lots</div>
      <div class="sh-import-table-wrap">
        <table class="sh-table">
          <thead>
            <tr>
              <th>Portfolio</th><th>Date</th><th>Label</th><th>Shares</th><th>Grant Price</th><th>Market Value</th><th>Gain</th><th>Net After CGT</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${summary.rows.length ? `
              <tr>
                <td colspan="3">Combined total</td>
                <td>${summary.totalShares.toLocaleString()}</td>
                <td>—</td>
                <td>${fmt(Math.round(summary.totalMarketBase))}</td>
                <td class="${summary.totalGainBase >= 0 ? 'cp' : 'cn'}">${fmt(Math.round(summary.totalGainBase))}</td>
                <td class="${summary.totalNetBase >= 0 ? 'cp' : 'cn'}">${fmt(Math.round(summary.totalNetBase))}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPortfolioLotsTable(summary) {
  const { pf, rows, lots, totalShares, totalMarket, totalGain, totalNet, totalCost, totalIncomeTax, totalSocialCharges, rate } = summary;
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const rates = getShareTaxRates(pf);
  const showBase = (pf.currency || baseCur) !== baseCur && rate !== 1;

  const body = rows.length
    ? rows.map(({ lot, shares, grantPrice, market, cost, gain, tax, net }) => `
        <tr>
          <td>${escHtml(lot.date || '—')}</td>
          <td>${escHtml(lot.label || '—')}</td>
          <td>${shares.toLocaleString()}</td>
          <td>${fmtAs(grantPrice, pf.currency || baseCur)}</td>
          <td>${fmtAs(Math.round(cost), pf.currency || baseCur)}</td>
          <td class="cp">${fmtAs(Math.round(market), pf.currency || baseCur)}</td>
          <td class="${gain >= 0 ? 'cp' : 'cn'}">${fmtAs(Math.round(gain), pf.currency || baseCur)}</td>
          <td class="cn">${tax.incomeTax > 0 ? '-' + fmtAs(Math.round(tax.incomeTax), pf.currency || baseCur) : '—'}</td>
          <td class="cn">${tax.socialCharges > 0 ? '-' + fmtAs(Math.round(tax.socialCharges), pf.currency || baseCur) : '—'}</td>
          <td>${fmtAs(Math.round(net), pf.currency || baseCur)}</td>
          <td><button class="sh-del" onclick="deleteShareLot('${pf.id}','${lot.id}')" title="Delete">✕</button></td>
        </tr>
      `).join('')
    : '<tr><td colspan="11" style="text-align:left;color:var(--dim)">No share lots yet.</td></tr>';

  return `
    <div class="card">
      <div class="card-title">Share Lots</div>
      <div class="sh-import-table-wrap">
        <table class="sh-table">
          <thead>
            <tr>
              <th>Date</th><th>Label</th><th>Shares</th><th>Grant Price</th><th>Cost Basis</th><th>Market Value</th><th>Gain</th><th>Income Tax (${rates.incomeTaxPct}%)</th><th>Social (${rates.socialChargesPct}%)</th><th>Net After CGT</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${body}
            ${rows.length ? `
              <tr>
                <td>Total</td>
                <td>${lots.length} lot${lots.length === 1 ? '' : 's'}</td>
                <td>${totalShares.toLocaleString()}</td>
                <td>—</td>
                <td>${fmtAs(Math.round(totalCost), pf.currency || baseCur)}</td>
                <td>${fmtAs(Math.round(totalMarket), pf.currency || baseCur)}${showBase ? `<br><span class="ss">≈ ${fmt(Math.round(totalMarket * rate))}</span>` : ''}</td>
                <td class="${totalGain >= 0 ? 'cp' : 'cn'}">${fmtAs(Math.round(totalGain), pf.currency || baseCur)}${showBase ? `<br><span class="ss">≈ ${fmt(Math.round(totalGain * rate))}</span>` : ''}</td>
                <td>${totalIncomeTax > 0 ? '-' + fmtAs(Math.round(totalIncomeTax), pf.currency || baseCur) : '—'}</td>
                <td>${totalSocialCharges > 0 ? '-' + fmtAs(Math.round(totalSocialCharges), pf.currency || baseCur) : '—'}</td>
                <td class="${totalNet >= 0 ? 'cp' : 'cn'}">${fmtAs(Math.round(totalNet), pf.currency || baseCur)}${showBase ? `<br><span class="ss">≈ ${fmt(Math.round(totalNet * rate))}</span>` : ''}</td>
                <td></td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderImportPreviewCard(pf, meta) {
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const totalShares = meta.lots.reduce((sum, lot) => sum + (lot.shares || 0), 0);
  let note = `${totalShares.toLocaleString()} total shares`;
  if (meta.resolved > 0) note += ` · ${meta.resolved} price${meta.resolved === 1 ? '' : 's'} resolved from history`;
  if (meta.unresolved > 0) note += ` · ⚠ ${meta.unresolved} still missing`;

  const rows = meta.lots.map(lot => {
    const priceClass = lot._priceSource === 'missing' ? 'cn' : (lot._priceSource === 'history' ? 'cp' : '');
    const sourceLabel = lot._priceSource === 'history' ? 'History' : (lot._priceSource === 'missing' ? 'Missing' : 'CSV');
    return `
      <tr>
        <td>${escHtml(lot.date)}</td>
        <td>${escHtml(lot.label)}</td>
        <td>${lot.shares.toLocaleString()}</td>
        <td class="${priceClass}">${lot.grantPrice > 0 ? fmtAs(lot.grantPrice, pf.currency || baseCur) : '—'}</td>
        <td style="text-align:left;font-size:12px;color:var(--dim)">${sourceLabel}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="sh-import-info">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <strong>Import preview (${meta.total} row${meta.total === 1 ? '' : 's'})</strong><br>
          <span style="color:var(--dim)">${note}</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-g btn-sm" onclick="confirmShareImport()">Confirm Import</button>
          <button class="btn btn-sm" onclick="cancelShareImport()">Cancel</button>
        </div>
      </div>
      <div class="sh-import-table-wrap" style="margin-top:12px;background:#fff">
        <table class="sh-table">
          <thead><tr><th>Date</th><th>Label</th><th>Shares</th><th>Grant Price</th><th>Source</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderShares() {
  if (!Array.isArray(S.portfolios)) S.portfolios = [];

  const portfolios = S.portfolios;
  const statusEl = document.getElementById('sh-auto-status');
  const viewEl = document.getElementById('sh-view');
  if (!viewEl) return;

  if (_selectedPfId !== 'all' && !getPortfolioById(_selectedPfId)) _selectedPfId = 'all';
  for (const pf of portfolios) autoCacheSharePrice(pf);

  if (statusEl) {
    statusEl.title = '';
    if (!portfolios.length) {
      statusEl.textContent = 'Add a portfolio in Settings to start tracking shares.';
      statusEl.style.color = 'var(--dim)';
    } else if (window._shFetching) {
      statusEl.textContent = '⟳ Refreshing stale portfolio prices…';
      statusEl.style.color = 'var(--dim)';
    } else if (sharesNeedsFetch() && Date.now() >= (window._shFetchRetryAt || 0)) {
      statusEl.textContent = '⟳ Refreshing stale portfolio prices…';
      statusEl.style.color = 'var(--dim)';
      autoFetchShareHistory();
    } else if (sharesNeedsFetch()) {
      statusEl.textContent = '⚠ Some portfolio prices still need refresh — retrying shortly.';
      statusEl.style.color = 'var(--amber)';
    } else {
      const ready = portfolios.filter(pf => (pf.priceHistory || []).length > 0).length;
      statusEl.textContent = `✓ ${ready} portfolio${ready === 1 ? '' : 's'} ready`;
      statusEl.style.color = ready ? 'var(--green)' : 'var(--dim)';
    }
  }

  let html = renderSharesHeader(portfolios);
  if (!portfolios.length) {
    html += renderSharesEmptyState();
  } else if (_selectedPfId === 'all') {
    const combined = computeCombinedPortfolioSummary(portfolios);
    html += renderCombinedStats(combined);
    html += renderCombinedLotsTable(combined);
  } else {
    const pf = getPortfolioById(_selectedPfId);
    const summary = computePortfolioSummary(pf);
    html += renderPortfolioStats(summary);
    html += renderPortfolioChartShell(summary);
    html += renderPortfolioActions(summary);
    html += renderPortfolioLotsTable(summary);
  }

  viewEl.innerHTML = html;

  if (_selectedPfId !== 'all') {
    requestAnimationFrame(() => renderSharesCharts());
  }
}

function getShareRangeCutoff(latestDate, range) {
  if (!latestDate || range === 'max') return null;
  const cutoff = new Date(`${latestDate}T12:00:00`);
  if (range.endsWith('m')) cutoff.setMonth(cutoff.getMonth() - parseInt(range, 10));
  else if (range.endsWith('y')) cutoff.setFullYear(cutoff.getFullYear() - parseInt(range, 10));
  return cutoff.toISOString().slice(0, 10);
}

function filterShareHistoryByRange(history, range) {
  const sorted = (history || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (sorted.length <= 2) return sorted;
  const cutoff = getShareRangeCutoff(sorted[sorted.length - 1].date, range);
  if (!cutoff) return sorted;
  const filtered = sorted.filter(point => point.date >= cutoff);
  return filtered.length >= 2 ? filtered : sorted.slice(-Math.min(sorted.length, 60));
}

function filterPortfolioHistoryByRange(history, range) {
  if (!history || !Array.isArray(history.dates) || history.dates.length <= 2) return history;
  const cutoff = getShareRangeCutoff(history.dates[history.dates.length - 1], range);
  if (!cutoff) return history;
  const keep = history.dates.map((date, index) => ({ date, index })).filter(item => item.date >= cutoff);
  const indices = keep.length >= 2 ? keep.map(item => item.index) : history.dates.map((_, index) => index).slice(-Math.min(history.dates.length, 60));
  return {
    dates: indices.map(index => history.dates[index]),
    values: indices.map(index => history.values[index]),
    costs: indices.map(index => history.costs[index]),
    gains: indices.map(index => history.gains[index]),
    nets: indices.map(index => history.nets[index])
  };
}

function getDateTickIndices(dates, maxTicks = 5) {
  if (!dates.length) return [];
  const ticks = new Set([0, dates.length - 1]);
  if (dates.length <= maxTicks) {
    dates.forEach((_, index) => ticks.add(index));
    return [...ticks].sort((a, b) => a - b);
  }
  const step = Math.max(1, Math.floor((dates.length - 1) / (maxTicks - 1)));
  for (let i = step; i < dates.length - 1; i += step) ticks.add(i);
  return [...ticks].sort((a, b) => a - b);
}

function formatDateTick(date) {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function renderSharesCharts() {
  if (_selectedPfId === 'all') return;
  const pf = getPortfolioById(_selectedPfId);
  if (!pf) return;
  const priceHistory = filterShareHistoryByRange(pf.priceHistory || [], _sharesChartRange);
  const portfolioHistory = filterPortfolioHistoryByRange(computePortfolioHistory(pf), _sharesChartRange);
  if (document.getElementById('sh-price-chart')) drawSharePriceChart(priceHistory, pf);
  if (document.getElementById('sh-value-chart')) drawPortfolioValueChart(portfolioHistory, pf);
}

function drawSharePriceChart(history, pf) {
  const cv = document.getElementById('sh-price-chart');
  if (!cv || !history || history.length < 2) return;

  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const W = Math.max(280, (cv.parentElement?.clientWidth || 320) - 32), H = 260;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const pad = { t: 16, r: 16, b: 36, l: 90 };
  const vals = history.map(point => point.price || 0);
  let mx = Math.max(...vals), mn = Math.min(...vals);
  if (mx === mn) {
    const bump = Math.max(1, mx * 0.02 || 1);
    mx += bump; mn -= bump;
  } else {
    const extra = (mx - mn) * 0.08;
    mx += extra; mn -= extra;
  }
  const rng = mx - mn || 1;

  function px(i) { return pad.l + (i / Math.max(history.length - 1, 1)) * (W - pad.l - pad.r); }
  function py(v) { return pad.t + (1 - (v - mn) / rng) * (H - pad.t - pad.b); }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = mn + (rng * i / steps);
    const yy = py(v);
    ctx.strokeStyle = '#e6eaf1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(W - pad.r, yy);
    ctx.stroke();
    ctx.fillStyle = '#8b9099';
    ctx.font = '11px "DM Mono",monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatChartMoney(v, pf.currency || baseCur, 2), pad.l - 6, yy + 4);
  }

  const tickIndices = getDateTickIndices(history.map(point => point.date));
  for (const index of tickIndices) {
    const x = px(index);
    if (index > 0 && index < history.length - 1) {
      ctx.strokeStyle = '#dde2eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, H - pad.b);
      ctx.stroke();
    }
    ctx.fillStyle = '#8b9099';
    ctx.font = '11px "DM Sans",sans-serif';
    ctx.textAlign = index === history.length - 1 ? 'right' : 'left';
    ctx.fillText(formatDateTick(history[index].date), index === history.length - 1 ? x - 2 : x + 2, H - 6);
  }

  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0, 'rgba(154,117,32,.18)');
  grad.addColorStop(1, 'rgba(154,117,32,.03)');
  ctx.beginPath();
  ctx.moveTo(px(0), py(vals[0]));
  for (let i = 1; i < vals.length; i++) ctx.lineTo(px(i), py(vals[i]));
  ctx.lineTo(px(vals.length - 1), H - pad.b);
  ctx.lineTo(px(0), H - pad.b);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = '#9a7520';
  ctx.lineWidth = 2.5;
  ctx.moveTo(px(0), py(vals[0]));
  for (let i = 1; i < vals.length; i++) ctx.lineTo(px(i), py(vals[i]));
  ctx.stroke();

  [0, vals.length - 1].forEach(index => {
    ctx.beginPath();
    ctx.arc(px(index), py(vals[index]), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#9a7520';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  });
}

function drawPortfolioValueChart(history, pf) {
  const cv = document.getElementById('sh-value-chart');
  if (!cv || !history || !history.dates || history.dates.length < 2) return;

  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const W = Math.max(280, (cv.parentElement?.clientWidth || 320) - 32), H = 260;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const pad = { t: 28, r: 16, b: 36, l: 84 };
  const allVals = [...history.values, ...history.gains, ...history.nets, 0];
  let mx = Math.max(...allVals), mn = Math.min(...allVals);
  if (mx === mn) {
    const bump = Math.max(1, Math.abs(mx) * 0.05 || 1);
    mx += bump; mn -= bump;
  } else {
    const extra = (mx - mn) * 0.08;
    mx += extra; mn -= extra;
  }
  const rng = mx - mn || 1;

  function px(i) { return pad.l + (i / Math.max(history.dates.length - 1, 1)) * (W - pad.l - pad.r); }
  function py(v) { return pad.t + (1 - (v - mn) / rng) * (H - pad.t - pad.b); }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.font = '11px "DM Sans",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9a7520';
  ctx.fillRect(pad.l, 8, 12, 3);
  ctx.fillText('Market value', pad.l + 16, 13);
  ctx.fillStyle = '#15803d';
  ctx.fillRect(pad.l + 110, 8, 12, 3);
  ctx.fillText('Unrealised gain', pad.l + 126, 13);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(pad.l + 250, 8, 12, 3);
  ctx.fillText('Net after CGT', pad.l + 266, 13);

  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = mn + (rng * i / steps);
    const yy = py(v);
    ctx.strokeStyle = '#e6eaf1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(W - pad.r, yy);
    ctx.stroke();
    ctx.fillStyle = '#8b9099';
    ctx.font = '11px "DM Mono",monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatChartMoney(v, pf.currency || baseCur, 0), pad.l - 6, yy + 4);
  }

  if (mn < 0 && mx > 0) {
    ctx.strokeStyle = 'rgba(220,38,38,.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, py(0));
    ctx.lineTo(W - pad.r, py(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const tickIndices = getDateTickIndices(history.dates);
  for (const index of tickIndices) {
    const x = px(index);
    if (index > 0 && index < history.dates.length - 1) {
      ctx.strokeStyle = '#dde2eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, H - pad.b);
      ctx.stroke();
    }
    ctx.fillStyle = '#8b9099';
    ctx.font = '11px "DM Sans",sans-serif';
    ctx.textAlign = index === history.dates.length - 1 ? 'right' : 'left';
    ctx.fillText(formatDateTick(history.dates[index]), index === history.dates.length - 1 ? x - 2 : x + 2, H - 6);
  }

  const goldArea = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  goldArea.addColorStop(0, 'rgba(154,117,32,.18)');
  goldArea.addColorStop(1, 'rgba(154,117,32,.03)');
  ctx.beginPath();
  ctx.moveTo(px(0), py(history.values[0]));
  for (let i = 1; i < history.values.length; i++) ctx.lineTo(px(i), py(history.values[i]));
  ctx.lineTo(px(history.values.length - 1), H - pad.b);
  ctx.lineTo(px(0), H - pad.b);
  ctx.closePath();
  ctx.fillStyle = goldArea;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = '#9a7520';
  ctx.lineWidth = 2.5;
  ctx.moveTo(px(0), py(history.values[0]));
  for (let i = 1; i < history.values.length; i++) ctx.lineTo(px(i), py(history.values[i]));
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 4]);
  ctx.moveTo(px(0), py(history.gains[0]));
  for (let i = 1; i < history.gains.length; i++) ctx.lineTo(px(i), py(history.gains[i]));
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([2, 4]);
  ctx.moveTo(px(0), py(history.nets[0]));
  for (let i = 1; i < history.nets.length; i++) ctx.lineTo(px(i), py(history.nets[i]));
  ctx.stroke();
  ctx.setLineDash([]);

  [0, history.values.length - 1].forEach(index => {
    ctx.beginPath();
    ctx.arc(px(index), py(history.values[index]), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#9a7520';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  });
}

function autoCacheSharePrice(pf) {
  if (!pf || !pf.currentPrice || pf.currentPrice <= 0) return;
  const today = todayISO();
  const history = pf.priceHistory || [];
  const existing = history.find(p => p.date === today);
  if (existing && existing.price === pf.currentPrice) return;
  cacheSharePrice(pf, today, pf.currentPrice);
  markDirty();
}

async function autoFetchShareHistory() {
  const stale = (S.portfolios || []).filter(pf => pfNeedsFetch(pf));
  const statusEl = document.getElementById('sh-auto-status');
  if (stale.length === 0) {
    if (statusEl) {
      statusEl.textContent = S.portfolios.length ? '✓ Share prices are up to date.' : 'Add a portfolio to start tracking shares.';
      statusEl.style.color = 'var(--dim)';
    }
    return;
  }

  window._shFetching = true;
  if (statusEl) {
    statusEl.textContent = `⟳ Loading price history for ${stale.length} portfolio${stale.length === 1 ? '' : 's'}…`;
    statusEl.style.color = 'var(--dim)';
  }

  const results = await Promise.all(stale.map(async pf => {
    const result = await fetchShareHistory(pf.ticker, 'max');
    return { pf, result };
  }));

  let updated = 0;
  const failures = [];
  for (const { pf, result } of results) {
    if (result.error) {
      failures.push(`${pf.label || pf.ticker}: ${result.error}`);
      continue;
    }
    if (!result.history || result.history.length === 0) {
      failures.push(`${pf.label || pf.ticker}: no price data found`);
      continue;
    }
    const existing = new Map((pf.priceHistory || []).map(p => [p.date, p]));
    for (const point of result.history) existing.set(point.date, point);
    pf.priceHistory = [...existing.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (result.currentPrice) pf.currentPrice = result.currentPrice;
    if (result.currency) pf.currency = pf.currency || result.currency;
    updated++;
  }

  if (updated > 0) markDirty();
  window._shFetching = false;
  window._shFetchRetryAt = failures.length > 0 ? Date.now() + (5 * 60 * 1000) : 0;

  if (statusEl) {
    if (updated > 0 && failures.length === 0) {
      statusEl.textContent = `✓ Updated ${updated} portfolio${updated === 1 ? '' : 's'} price history.`;
      statusEl.style.color = 'var(--green)';
    } else if (updated > 0) {
      statusEl.textContent = `✓ Updated ${updated} portfolio${updated === 1 ? '' : 's'} · ⚠ ${failures.length} issue${failures.length === 1 ? '' : 's'}`;
      statusEl.style.color = 'var(--amber)';
      statusEl.title = failures.join('\n');
    } else {
      statusEl.textContent = `⚠ Could not fetch prices: ${failures.join(' · ')}`;
      statusEl.style.color = 'var(--red)';
    }
  }

  renderShares();
}

function addPortfolio() {
  if (!Array.isArray(S.portfolios)) S.portfolios = [];
  const label = `Portfolio ${S.portfolios.length + 1}`;
  const pf = newPortfolio(label);
  S.portfolios.push(pf);
  markDirty();
  populateSharesSettings();
  renderShares();
}

function removePortfolio(id) {
  const pf = getPortfolioById(id);
  if (!pf) return;
  if (!confirm(`Remove portfolio "${pf.label || pf.ticker || 'Untitled'}"?`)) return;
  S.portfolios = (S.portfolios || []).filter(item => item.id !== id);
  if (_selectedPfId === id) _selectedPfId = 'all';
  if (_openShareLotPfId === id) _openShareLotPfId = null;
  if (_importTargetPfId === id) {
    _importTargetPfId = null;
    _pendingImportLots = [];
    _pendingImportMeta = null;
  }
  markDirty();
  populateSharesSettings();
  renderShares();
}

function populateSharesSettings() {
  const host = document.getElementById('sh-portfolios-settings');
  if (!host) return;
  const portfolios = S.portfolios || [];

  if (portfolios.length === 0) {
    host.innerHTML = `<div class="fx-empty">No portfolios yet. Use “Add Portfolio” to create one.</div>`;
    return;
  }

  host.innerHTML = portfolios.map((pf, idx) => {
    const tb = pf.taxBreakdown || { incomeTax: 12.8, socialCharges: 18.6 };
    const history = pf.priceHistory || [];
    const latest = history.length ? history[history.length - 1].date : 'No history yet';
    return `
      <div class="ip" style="margin-bottom:12px">
        <div class="iph">
          <div class="ipt">${escHtml(pf.label || `Portfolio ${idx + 1}`)}</div>
          <div style="font-size:11px;color:var(--dim)">${history.length} cached price point${history.length === 1 ? '' : 's'} · ${escHtml(latest)}</div>
        </div>
        <div style="padding:16px 18px">
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px">
            <div class="sf" style="margin:0"><label>Label</label><input class="si" id="sh-set-label-${pf.id}" value="${escHtml(pf.label || '')}" placeholder="Portfolio label"></div>
            <div class="sf" style="margin:0"><label>Company</label><input class="si" id="sh-set-company-${pf.id}" value="${escHtml(pf.companyName || '')}" placeholder="Company name"></div>
            <div class="sf" style="margin:0"><label>Ticker</label><input class="si" id="sh-set-ticker-${pf.id}" value="${escHtml(pf.ticker || '')}" placeholder="MSFT"></div>
            <div class="sf" style="margin:0"><label>Currency</label><select class="si" id="sh-set-currency-${pf.id}">${Object.entries(CURRENCIES).map(([code, cur]) => `<option value="${code}" ${code === (pf.currency || 'USD') ? 'selected' : ''}>${code} · ${cur.name}</option>`).join('')}</select></div>
            <div class="sf" style="margin:0"><label>Income Tax %</label><input type="number" class="si" id="sh-set-ir-${pf.id}" step="0.1" value="${tb.incomeTax ?? 12.8}"></div>
            <div class="sf" style="margin:0"><label>Social Charges %</label><input type="number" class="si" id="sh-set-social-${pf.id}" step="0.1" value="${tb.socialCharges ?? 18.6}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px">
            <div style="font-size:12px;color:var(--dim)">PFU total: <strong>${((tb.incomeTax ?? 0) + (tb.socialCharges ?? 0)).toFixed(1)}%</strong></div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-g btn-sm" onclick="applyPortfolioCfg('${pf.id}')">Save Portfolio</button>
              <button class="btn btn-del btn-sm" onclick="removePortfolio('${pf.id}')">Remove</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function applyPortfolioCfg(id) {
  const pf = getPortfolioById(id);
  if (!pf) return;
  const oldTicker = pf.ticker || '';

  pf.label = document.getElementById(`sh-set-label-${id}`).value.trim() || pf.label || 'Portfolio';
  pf.companyName = document.getElementById(`sh-set-company-${id}`).value.trim();
  pf.ticker = document.getElementById(`sh-set-ticker-${id}`).value.trim().toUpperCase();
  pf.currency = document.getElementById(`sh-set-currency-${id}`).value || pf.currency || 'USD';

  const incomeTax = parseFloat(document.getElementById(`sh-set-ir-${id}`).value);
  const socialCharges = parseFloat(document.getElementById(`sh-set-social-${id}`).value);
  pf.taxBreakdown = {
    incomeTax: isNaN(incomeTax) ? 12.8 : incomeTax,
    socialCharges: isNaN(socialCharges) ? 18.6 : socialCharges
  };
  pf.cgtRate = pf.taxBreakdown.incomeTax + pf.taxBreakdown.socialCharges;

  if (pf.ticker !== oldTicker) {
    pf.priceHistory = [];
    pf.currentPrice = 0;
  }

  markDirty();
  populateSharesSettings();
  renderShares();
}

function toggleAddLot(pfId) {
  _openShareLotPfId = _openShareLotPfId === pfId ? null : pfId;
  renderShares();
}

function addShareLot(pfId) {
  const pf = getPortfolioById(pfId);
  if (!pf) return;
  const date = document.getElementById(`sh-lot-date-${pfId}`).value;
  const label = document.getElementById(`sh-lot-label-${pfId}`).value.trim();
  const shares = parseInt(document.getElementById(`sh-lot-shares-${pfId}`).value, 10) || 0;
  const grantPrice = parseFloat(document.getElementById(`sh-lot-price-${pfId}`).value) || 0;

  if (!date) return alert('Please select a vest date.');
  if (shares <= 0) return alert('Please enter the number of shares.');
  if (grantPrice <= 0) return alert('Please enter the grant price per share.');

  if (!pf.lots) pf.lots = [];
  pf.lots.push({
    id: 'lot_' + Date.now(),
    date,
    label: label || ('Vest ' + date),
    shares,
    grantPrice: +grantPrice.toFixed(2)
  });
  pf.lots.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  _openShareLotPfId = null;
  markDirty();
  renderShares();
}

function deleteShareLot(pfId, lotId) {
  const pf = getPortfolioById(pfId);
  if (!pf) return;
  if (!confirm('Delete this share lot?')) return;
  pf.lots = (pf.lots || []).filter(lot => lot.id !== lotId);
  markDirty();
  renderShares();
}

function handleShareCSV(input, pfId) {
  const pf = getPortfolioById(pfId);
  const file = input.files[0];
  if (!pf || !file) return;

  _importTargetPfId = pfId;
  _pendingImportLots = [];
  _pendingImportMeta = null;
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const parsed = parseShareCSV(e.target.result);
      if (parsed.length === 0) {
        alert('No valid rows found.\n\nMinimum columns: Date + Shares.\nGrant Price is optional — if omitted, it is looked up from cached price history.\n\nAccepted delimiters: comma, tab, or semicolon.');
        return;
      }

      let resolved = resolveGrantPrices(parsed);
      if (resolved.unresolved > 0 && pf.ticker) {
        const statusEl = document.getElementById('sh-auto-status');
        if (statusEl) {
          statusEl.textContent = `⟳ Fetching ${pf.ticker} history to resolve ${resolved.unresolved} missing grant price(s)…`;
          statusEl.style.color = 'var(--dim)';
        }

        const result = await fetchShareHistory(pf.ticker, 'max');
        if (result.history && result.history.length > 0) {
          const existing = new Map((pf.priceHistory || []).map(point => [point.date, point]));
          for (const point of result.history) existing.set(point.date, point);
          pf.priceHistory = [...existing.values()].sort((a, b) => a.date.localeCompare(b.date));
          if (result.currentPrice) pf.currentPrice = result.currentPrice;
          markDirty();
          resolved = resolveGrantPrices(parsed);
        }
      }

      _pendingImportLots = resolved.lots;
      showImportPreview(resolved);
    } catch (err) {
      alert('CSV parse error: ' + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function parseShareCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const header = lines[0].split(delim).map(cell => cell.trim().toLowerCase().replace(/['"]/g, ''));
  const colMap = {};

  header.forEach((cell, index) => {
    if (/date|vest.*date|vesting/i.test(cell)) colMap.date = index;
    else if (/label|desc|name|note|event|type/i.test(cell)) colMap.label = index;
    else if (/share|qty|quantity|units|number/i.test(cell)) colMap.shares = index;
    else if (/price|grant|cost|basis|strike/i.test(cell)) colMap.price = index;
  });

  const hasHeader = colMap.date !== undefined || colMap.shares !== undefined;
  if (!hasHeader) {
    const cols = header.length;
    if (cols >= 4) { colMap.date = 0; colMap.label = 1; colMap.shares = 2; colMap.price = 3; }
    else if (cols === 3) { colMap.date = 0; colMap.label = 1; colMap.shares = 2; }
    else if (cols === 2) { colMap.date = 0; colMap.shares = 1; }
    else return [];
  }

  const startRow = hasHeader ? 1 : 0;
  const lots = [];
  for (let i = startRow; i < lines.length; i++) {
    const cells = lines[i].split(delim).map(cell => cell.trim().replace(/^['"]|['"]$/g, ''));
    if (cells.length < 2) continue;

    const rawDate = cells[colMap.date] || '';
    const date = parseFlexDate(rawDate);
    if (!date) continue;

    const shares = parseFloat((cells[colMap.shares] || '').replace(/[^0-9.-]/g, ''));
    if (!shares || shares <= 0) continue;

    const rawPrice = colMap.price !== undefined ? (cells[colMap.price] || '').replace(/[^0-9.-]/g, '') : '';
    const price = rawPrice ? parseFloat(rawPrice) : null;
    const label = colMap.label !== undefined ? (cells[colMap.label] || '') : '';

    lots.push({
      id: `lot_imp_${Date.now()}_${i}`,
      date,
      label: label || ('Vest ' + date),
      shares: Math.round(shares),
      grantPrice: price && price > 0 ? +price.toFixed(2) : null
    });
  }

  return lots.sort((a, b) => a.date.localeCompare(b.date));
}

function parseFlexDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  let m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  m = raw.match(/^(\d{1,2})[\s\-.]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s\-.]?(\d{4})$/i);
  if (m) {
    const d = +m[1];
    const mo = MN.findIndex(name => name.toLowerCase() === m[2].slice(0, 3).toLowerCase()) + 1;
    const y = +m[3];
    if (mo > 0) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function resolveGrantPrices(lots) {
  const pf = getPortfolioById(_importTargetPfId);
  const history = ((pf && pf.priceHistory) || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  let resolved = 0, unresolved = 0;

  const result = lots.map(lot => {
    if (lot.grantPrice !== null) return { ...lot, _priceSource: 'csv' };
    const price = lookupHistoricalPrice(lot.date, history);
    if (price !== null) {
      resolved++;
      return { ...lot, grantPrice: +price.toFixed(2), _priceSource: 'history' };
    }
    unresolved++;
    return { ...lot, grantPrice: 0, _priceSource: 'missing' };
  });

  return { lots: result, resolved, unresolved, total: lots.length };
}

function lookupHistoricalPrice(date, sortedHistory) {
  if (!sortedHistory || sortedHistory.length === 0) return null;
  const exact = sortedHistory.find(point => point.date === date);
  if (exact) return exact.price;

  let nearest = null;
  for (const point of sortedHistory) {
    if (point.date <= date) nearest = point;
    else break;
  }

  if (!nearest) {
    const first = sortedHistory.find(point => point.date > date);
    if (first) {
      const diff = (new Date(first.date) - new Date(date)) / (1000 * 60 * 60 * 24);
      if (diff <= 7) return first.price;
    }
    return null;
  }
  return nearest.price;
}

function showImportPreview({ lots, resolved, unresolved, total }) {
  _pendingImportMeta = { lots, resolved, unresolved, total };
  renderShares();
}

function confirmShareImport() {
  const pf = getPortfolioById(_importTargetPfId);
  if (!pf || !_pendingImportLots.length) return;
  if (!pf.lots) pf.lots = [];
  pf.lots.push(..._pendingImportLots.map(lot => ({
    id: lot.id,
    date: lot.date,
    label: lot.label,
    shares: lot.shares,
    grantPrice: lot.grantPrice
  })));
  pf.lots.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  markDirty();
  _pendingImportLots = [];
  _pendingImportMeta = null;
  _importTargetPfId = null;
  renderShares();
}

function cancelShareImport() {
  _pendingImportLots = [];
  _pendingImportMeta = null;
  _importTargetPfId = null;
  renderShares();
}

// ─────────────────────────────────────────────
// LOG TAB — Transaction Entry
// ─────────────────────────────────────────────
let _logType = 'outgoing';

function setLogType(type) {
  _logType = type;
  document.getElementById('log-type-out').className = 'btn log-type-btn' + (type === 'outgoing' ? ' active' : '');
  document.getElementById('log-type-inc').className = 'btn log-type-btn' + (type === 'income' ? ' active' : '');
}

function addTransaction() {
  const date = document.getElementById('log-date').value;
  const desc = document.getElementById('log-desc').value.trim();
  const amount = parseFloat(document.getElementById('log-amt').value) || 0;
  const cat = document.getElementById('log-cat').value.trim();
  if (!date) return alert('Please select a date.');
  if (!desc) return alert('Please enter a description.');
  if (amount <= 0) return alert('Please enter a positive amount.');
  if (!S.transactions) S.transactions = [];
  S.transactions.push({
    id: 'tx_' + Date.now(),
    date,
    name: desc,
    amount,
    type: _logType,
    category: cat || 'Uncategorised'
  });
  markDirty();
  // Clear form (keep date)
  document.getElementById('log-desc').value = '';
  document.getElementById('log-amt').value = '';
  document.getElementById('log-cat').value = '';
  renderLog();
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  S.transactions = (S.transactions || []).filter(t => t.id !== id);
  markDirty();
  renderLog();
}

function renderLog() {
  // Set default date to today
  const dateInput = document.getElementById('log-date');
  if (!dateInput.value) dateInput.value = todayISO();

  // Populate category datalist from existing categories
  const allCats = new Set();
  [...S.income, ...S.outgoings].forEach(i => { if (i.category) allCats.add(i.category); });
  (S.transactions || []).forEach(t => { if (t.category) allCats.add(t.category); });
  document.getElementById('log-cat-list').innerHTML = [...allCats].sort().map(c => `<option>${c}</option>`).join('');

  const txs = (S.transactions || []).slice().sort((a, b) => b.date.localeCompare(a.date));

  // Month filter
  const monthFilter = document.getElementById('log-filter-month');
  const months = [...new Set(txs.map(t => t.date.slice(0, 7)))].sort().reverse();
  const curFilter = monthFilter.value;
  monthFilter.innerHTML = '<option value="all">All Months</option>' +
    months.map(m => `<option value="${m}" ${m === curFilter ? 'selected' : ''}>${mLabel(m)}</option>`).join('');

  const typeFilter = document.getElementById('log-filter-type').value;

  // Apply filters
  let filtered = txs;
  if (curFilter && curFilter !== 'all') filtered = filtered.filter(t => t.date.startsWith(curFilter));
  if (typeFilter !== 'all') filtered = filtered.filter(t => t.type === typeFilter);

  // Summary cards
  const summaryMonth = (curFilter && curFilter !== 'all') ? curFilter : todayYYYYMM();
  const mTxs = txs.filter(t => t.date.startsWith(summaryMonth));
  const mInc = mTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const mOut = mTxs.filter(t => t.type === 'outgoing').reduce((s, t) => s + t.amount, 0);
  const mNet = mInc - mOut;
  document.getElementById('log-summary').innerHTML = `
    <div class="sc"><div class="sl">${mLabel(summaryMonth)} Income</div><div class="sv pos">${fmt(Math.round(mInc))}</div><div class="ss">${mTxs.filter(t => t.type === 'income').length} entries</div></div>
    <div class="sc"><div class="sl">${mLabel(summaryMonth)} Outgoings</div><div class="sv neg">${fmt(Math.round(mOut))}</div><div class="ss">${mTxs.filter(t => t.type === 'outgoing').length} entries</div></div>
    <div class="sc"><div class="sl">${mLabel(summaryMonth)} Net</div><div class="sv ${mNet < 0 ? 'neg' : 'pos'}">${fmt(Math.round(mNet))}</div><div class="ss">${mTxs.length} total entries</div></div>
  `;

  // Transaction list
  const list = document.getElementById('log-list');
  const empty = document.getElementById('log-empty');
  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = filtered.map(tx => `<div class="log-row">
    <div class="log-date">${tx.date}</div>
    <div class="log-desc">${tx.name}</div>
    <div class="log-cat">${tx.category || ''}</div>
    <div class="log-amt ${tx.type === 'income' ? 'cp' : 'cn'}">${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}</div>
    <button class="log-del" onclick="deleteTransaction('${tx.id}')" title="Delete">✕</button>
  </div>`).join('');
}

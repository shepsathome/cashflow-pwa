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

  drawChart(d);
  renderAnnual(d);
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
function renderShares() {
  const sh = S.shares || {};

  // Auto-cache today's price if set
  autoCacheSharePrice();

  // Auto-fetch if stale or empty
  if (sharesNeedsFetch() && !window._shFetching) {
    autoFetchShareHistory();
  }

  const history = (sh.priceHistory || []);
  const lots = (sh.lots || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const price = sh.currentPrice || 0;
  const taxRates = getShareTaxRates();
  const baseCur = (S.settings && S.settings.currency) || 'GBP';
  const shCurCode = sh.currency || 'USD';
  const rate = xrate(shCurCode);

  // Compute per-lot with full tax breakdown
  let totalShares = 0, totalMarket = 0, totalCost = 0, totalGain = 0;
  let totalIncomeTax = 0, totalSocialCharges = 0, totalTax = 0, totalNet = 0;
  const lotRows = lots.map(lot => {
    const n = lot.shares || 0;
    const grantP = lot.grantPrice || 0;
    const market = n * price;
    const cost = n * grantP;
    const gain = market - cost;
    const tax = computeTaxOnGain(gain);
    const net = market - tax.total;
    totalShares += n; totalMarket += market; totalCost += cost;
    totalGain += gain; totalIncomeTax += tax.incomeTax;
    totalSocialCharges += tax.socialCharges; totalTax += tax.total; totalNet += net;
    return { lot, n, grantP, market, cost, gain, tax, net };
  });

  // Stats
  const showBase = shCurCode !== baseCur && rate !== 1;

  document.getElementById('sh-sv-total').textContent = totalShares.toLocaleString();
  document.getElementById('sh-ss-total').textContent = lots.length + ' lot' + (lots.length === 1 ? '' : 's');

  const svM = document.getElementById('sh-sv-market');
  svM.textContent = fmtAs(Math.round(totalMarket), shCurCode);
  svM.className = 'sv pos';
  document.getElementById('sh-ss-market').textContent = showBase ? `≈ ${fmt(Math.round(totalMarket * rate))}` : `@ ${fmtAs(price, shCurCode)}/share`;

  const svG = document.getElementById('sh-sv-gain');
  svG.textContent = fmtAs(Math.round(totalGain), shCurCode);
  svG.className = 'sv ' + (totalGain < 0 ? 'neg' : 'pos');
  document.getElementById('sh-ss-gain').textContent = totalCost > 0
    ? `${(totalGain / totalCost * 100).toFixed(1)}% return`
    : '—';

  const svN = document.getElementById('sh-sv-net');
  svN.textContent = fmtAs(Math.round(totalNet), shCurCode);
  svN.className = 'sv ' + (totalNet < 0 ? 'neg' : 'pos');
  const taxDesc = `PFU ${taxRates.totalPct}% (${taxRates.incomeTaxPct}% IR + ${taxRates.socialChargesPct}% social)`;
  document.getElementById('sh-ss-net').textContent = showBase
    ? `≈ ${fmt(Math.round(totalNet * rate))} · ${taxDesc}`
    : taxDesc;

  // Lot table
  const table = document.getElementById('sh-lot-table');
  const noLots = document.getElementById('sh-no-lots');
  if (lots.length === 0) {
    table.innerHTML = '';
    noLots.style.display = '';
    return;
  }
  noLots.style.display = 'none';

  let h = `<thead><tr>
    <th>Date</th><th>Label</th><th>Shares</th><th>Grant Price</th>
    <th>Cost Basis</th><th>Market Value</th><th>Gain</th>
    <th>Income Tax (${taxRates.incomeTaxPct}%)</th><th>Social (${taxRates.socialChargesPct}%)</th>
    <th>Net Post-Sale</th><th></th>
  </tr></thead><tbody>`;

  lotRows.forEach(({ lot, n, grantP, market, cost, gain, tax, net }) => {
    h += `<tr>
      <td>${lot.date || '—'}</td>
      <td>${lot.label || '—'}</td>
      <td>${n.toLocaleString()}</td>
      <td>${fmtAs(grantP, shCurCode)}</td>
      <td>${fmtAs(Math.round(cost), shCurCode)}</td>
      <td class="cp">${fmtAs(Math.round(market), shCurCode)}</td>
      <td class="${gain >= 0 ? 'cp' : 'cn'}">${fmtAs(Math.round(gain), shCurCode)}</td>
      <td class="cn">${tax.incomeTax > 0 ? '-' + fmtAs(Math.round(tax.incomeTax), shCurCode) : '—'}</td>
      <td class="cn">${tax.socialCharges > 0 ? '-' + fmtAs(Math.round(tax.socialCharges), shCurCode) : '—'}</td>
      <td style="font-weight:600">${fmtAs(Math.round(net), shCurCode)}</td>
      <td><button class="sh-del" onclick="deleteShareLot('${lot.id}')" title="Delete">✕</button></td>
    </tr>`;
  });

  // Totals row
  h += `<tr>
    <td>Total</td><td>${lots.length} lot${lots.length === 1 ? '' : 's'}</td>
    <td>${totalShares.toLocaleString()}</td><td>—</td>
    <td>${fmtAs(Math.round(totalCost), shCurCode)}</td>
    <td>${fmtAs(Math.round(totalMarket), shCurCode)}</td>
    <td>${fmtAs(Math.round(totalGain), shCurCode)}</td>
    <td>${totalIncomeTax > 0 ? '-' + fmtAs(Math.round(totalIncomeTax), shCurCode) : '—'}</td>
    <td>${totalSocialCharges > 0 ? '-' + fmtAs(Math.round(totalSocialCharges), shCurCode) : '—'}</td>
    <td>${fmtAs(Math.round(totalNet), shCurCode)}${showBase ? '<br><span style="font-size:10px;color:var(--dim)">≈ ' + fmt(Math.round(totalNet * rate)) + '</span>' : ''}</td>
    <td></td>
  </tr>`;
  h += '</tbody>';
  table.innerHTML = h;

  renderSharesCharts();
}

// Auto-cache today's price into history
function autoCacheSharePrice() {
  const sh = S.shares || {};
  if (!sh.currentPrice || sh.currentPrice <= 0) return;
  const today = todayISO();
  if (!sh.priceHistory) sh.priceHistory = [];
  const existing = sh.priceHistory.find(p => p.date === today);
  if (existing && existing.price === sh.currentPrice) return;
  cacheSharePrice(today, sh.currentPrice);
  markDirty();
}

function applySharesCfg() {
  if (!S.shares) S.shares = deep(DEFAULTS.shares);
  S.shares.companyName = document.getElementById('sh-company').value.trim();
  const oldTicker = S.shares.ticker;
  S.shares.ticker = document.getElementById('sh-ticker').value.trim().toUpperCase();
  S.shares.currency = document.getElementById('sh-currency').value;
  // Tax breakdown
  const ir = parseFloat(document.getElementById('sh-tax-ir').value) || 0;
  const social = parseFloat(document.getElementById('sh-tax-social').value) || 0;
  S.shares.taxBreakdown = { incomeTax: ir, socialCharges: social };
  S.shares.cgtRate = ir + social; // Keep for backward compat
  document.getElementById('sh-tax-total').textContent = `= ${(ir + social).toFixed(1)}% PFU`;
  markDirty();
  if (oldTicker !== S.shares.ticker) {
    S.shares.priceHistory = [];
    S.shares.currentPrice = 0;
    const status = document.getElementById('sh-settings-status');
    if (status) status.textContent = S.shares.ticker ? `Ticker changed to ${S.shares.ticker} — history will load on the Shares tab` : '';
  }
}

function populateSharesSettings() {
  const sh = S.shares || {};
  document.getElementById('sh-company').value = sh.companyName || '';
  document.getElementById('sh-ticker').value = sh.ticker || '';
  const tb = sh.taxBreakdown || { incomeTax: 12.8, socialCharges: 18.6 };
  document.getElementById('sh-tax-ir').value = tb.incomeTax;
  document.getElementById('sh-tax-social').value = tb.socialCharges;
  document.getElementById('sh-tax-total').textContent = `= ${(tb.incomeTax + tb.socialCharges).toFixed(1)}% PFU`;
  const curSel = document.getElementById('sh-currency');
  const shCur = sh.currency || 'USD';
  curSel.innerHTML = Object.entries(CURRENCIES)
    .map(([code, c]) => `<option value="${code}" ${code === shCur ? 'selected' : ''}>${code}</option>`)
    .join('');
  const status = document.getElementById('sh-settings-status');
  const hist = sh.priceHistory || [];
  if (hist.length > 0) {
    status.textContent = `${hist.length} cached price points · Latest: ${hist[hist.length - 1].date}`;
  } else {
    status.textContent = sh.ticker ? 'No price history cached yet' : '';
  }
}

function toggleAddLot() {
  const el = document.getElementById('sh-add-lot');
  el.style.display = el.style.display === 'none' ? '' : 'none';
  if (el.style.display !== 'none') {
    const sh = S.shares || {};
    document.getElementById('sh-lot-date').value = todayISO();
    document.getElementById('sh-lot-cur').textContent = (CURRENCIES[sh.currency || 'USD'] || {}).symbol || '$';
  }
}

function addShareLot() {
  const date = document.getElementById('sh-lot-date').value;
  const label = document.getElementById('sh-lot-label').value.trim();
  const shares = parseInt(document.getElementById('sh-lot-shares').value) || 0;
  const grantPrice = parseFloat(document.getElementById('sh-lot-price').value) || 0;
  if (!date) return alert('Please select a vest date.');
  if (shares <= 0) return alert('Please enter the number of shares.');
  if (grantPrice <= 0) return alert('Please enter the grant price per share.');
  if (!S.shares) S.shares = deep(DEFAULTS.shares);
  if (!S.shares.lots) S.shares.lots = [];
  S.shares.lots.push({
    id: 'lot_' + Date.now(),
    date,
    label: label || ('Vest ' + date),
    shares,
    grantPrice
  });
  markDirty();
  // Clear form
  document.getElementById('sh-lot-label').value = '';
  document.getElementById('sh-lot-shares').value = '';
  document.getElementById('sh-lot-price').value = '';
  renderShares();
}

function deleteShareLot(id) {
  if (!confirm('Delete this share lot?')) return;
  S.shares.lots = (S.shares.lots || []).filter(l => l.id !== id);
  markDirty();
  renderShares();
}

// ─── CSV Import for share lots ───
let _pendingImportLots = [];

function handleShareCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const parsed = parseShareCSV(e.target.result);
      if (parsed.length === 0) {
        alert('No valid rows found.\n\nMinimum columns: Date + Shares.\nGrant Price is optional — if omitted, it\'s looked up from cached price history.\n\nAccepts comma, tab, or semicolon delimiters.');
        return;
      }
      // First pass — resolve from existing cache
      let resolved = resolveGrantPrices(parsed);

      // If any unresolved and we have a ticker, fetch full history and retry
      if (resolved.unresolved > 0 && (S.shares || {}).ticker) {
        const statusEl = document.getElementById('sh-auto-status');
        if (statusEl) { statusEl.textContent = `⟳ Fetching full price history to resolve ${resolved.unresolved} missing price(s)…`; statusEl.style.color = 'var(--dim)'; }
        const result = await fetchShareHistory(S.shares.ticker, 'max');
        if (result.history && result.history.length > 0) {
          if (!S.shares.priceHistory) S.shares.priceHistory = [];
          const existing = new Map(S.shares.priceHistory.map(p => [p.date, p]));
          for (const h of result.history) existing.set(h.date, h);
          S.shares.priceHistory = [...existing.values()].sort((a, b) => a.date.localeCompare(b.date));
          if (result.currentPrice) S.shares.currentPrice = result.currentPrice;
          markDirty();
          if (statusEl) { statusEl.textContent = `✓ Loaded ${result.history.length} price points — resolving import…`; statusEl.style.color = 'var(--green)'; }
          // Re-resolve with full history
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
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const header = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const colMap = {};
  header.forEach((h, i) => {
    if (/date|vest.*date|vesting/i.test(h)) colMap.date = i;
    else if (/label|desc|name|note|event|type/i.test(h)) colMap.label = i;
    else if (/share|qty|quantity|units|number/i.test(h)) colMap.shares = i;
    else if (/price|grant|cost|basis|strike/i.test(h)) colMap.price = i;
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
    const cells = lines[i].split(delim).map(c => c.trim().replace(/^['"]|['"]$/g, ''));
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
      id: 'lot_imp_' + Date.now() + '_' + i,
      date,
      label: label || ('Vest ' + date),
      shares: Math.round(shares),
      grantPrice: (price && price > 0) ? +price.toFixed(2) : null
    });
  }

  return lots.sort((a, b) => a.date.localeCompare(b.date));
}

function parseFlexDate(raw) {
  if (!raw) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or DD-MM-YYYY
  let m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    // If first number > 12, it's DD/MM/YYYY; otherwise assume DD/MM/YYYY for UK
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // DD-Mon-YYYY or DD Mon YYYY
  m = raw.match(/^(\d{1,2})[\s\-.]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s\-.]?(\d{4})$/i);
  if (m) {
    const d = +m[1], mo = MN.findIndex(n => n.toLowerCase() === m[2].slice(0, 3).toLowerCase()) + 1, y = +m[3];
    if (mo > 0) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // Try native Date parse as last resort
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function resolveGrantPrices(lots) {
  const history = ((S.shares || {}).priceHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  let resolved = 0, unresolved = 0;

  const result = lots.map(lot => {
    if (lot.grantPrice !== null) return lot;
    const price = lookupHistoricalPrice(lot.date, history);
    if (price !== null) {
      resolved++;
      return { ...lot, grantPrice: price, _priceSource: 'history' };
    }
    unresolved++;
    return { ...lot, grantPrice: 0, _priceSource: 'missing' };
  });

  return { lots: result, resolved, unresolved, total: lots.length };
}

function lookupHistoricalPrice(date, sortedHistory) {
  if (!sortedHistory || sortedHistory.length === 0) return null;
  const exact = sortedHistory.find(h => h.date === date);
  if (exact) return exact.price;
  // Nearest prior date
  let nearest = null;
  for (const h of sortedHistory) {
    if (h.date <= date) nearest = h;
    else break;
  }
  if (!nearest) {
    // Try nearest future date within 7 days
    const first = sortedHistory.find(h => h.date > date);
    if (first) {
      const diff = (new Date(first.date) - new Date(date)) / (1000 * 60 * 60 * 24);
      if (diff <= 7) return first.price;
    }
    return null;
  }
  return nearest.price;
}

function showImportPreview({ lots, resolved, unresolved, total }) {
  const sh = S.shares || {};
  const sym = (CURRENCIES[sh.currency || 'USD'] || {}).symbol || '$';
  document.getElementById('sh-import-count').textContent = lots.length;
  const totalShares = lots.reduce((s, l) => s + l.shares, 0);
  let note = `${totalShares.toLocaleString()} total shares`;
  if (resolved > 0) note += ` · ${resolved} price${resolved === 1 ? '' : 's'} looked up from history`;
  if (unresolved > 0) note += ` · ⚠ ${unresolved} could not be resolved`;
  document.getElementById('sh-import-note').textContent = note;

  let h = '<thead><tr><th>Date</th><th>Label</th><th>Shares</th><th>Grant Price</th><th>Source</th></tr></thead><tbody>';
  lots.forEach(l => {
    const priceClass = l._priceSource === 'missing' ? 'cn' : (l._priceSource === 'history' ? 'cg' : '');
    const sourceLabel = l._priceSource === 'history' ? '📈 history' : (l._priceSource === 'missing' ? '⚠ not found' : 'CSV');
    h += `<tr>
      <td>${l.date}</td><td>${l.label}</td>
      <td>${l.shares.toLocaleString()}</td>
      <td class="${priceClass}">${l.grantPrice > 0 ? sym + l.grantPrice.toFixed(2) : '—'}</td>
      <td style="font-size:11px;color:var(--dim)">${sourceLabel}</td>
    </tr>`;
  });
  h += '</tbody>';
  document.getElementById('sh-import-table').innerHTML = h;
  document.getElementById('sh-import-preview').style.display = '';
}

function confirmShareImport() {
  if (!_pendingImportLots.length) return;
  if (!S.shares) S.shares = deep(DEFAULTS.shares);
  if (!S.shares.lots) S.shares.lots = [];
  S.shares.lots.push(..._pendingImportLots);
  markDirty();
  _pendingImportLots = [];
  document.getElementById('sh-import-preview').style.display = 'none';
  renderShares();
}

function cancelShareImport() {
  _pendingImportLots = [];
  document.getElementById('sh-import-preview').style.display = 'none';
}

// ─── Share price & portfolio charts ───
function renderSharesCharts() {
  const sh = S.shares || {};
  const allHistory = (sh.priceHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const rangeDays = parseInt(document.getElementById('sh-chart-range').value) || 0;

  // Filter by range
  let history = allHistory;
  if (rangeDays > 0 && allHistory.length > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    history = allHistory.filter(h => h.date >= cutoffStr);
  }

  drawSharePriceChart(history, sh);
  drawPortfolioValueChart(history, sh);
}

function drawSharePriceChart(history, sh) {
  const cv = document.getElementById('sh-price-chart');
  const empty = document.getElementById('sh-chart-empty');

  if (history.length < 2) {
    cv.width = 0; cv.height = 0;
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const W = cv.parentElement.clientWidth - 44, H = 220;
  if (W < 100) return;
  cv.width = W; cv.height = H;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const pad = { t: 20, r: 16, b: 36, l: 80 };

  const prices = history.map(h => h.price);
  const mx = Math.max(...prices) * 1.02, mn = Math.min(...prices) * 0.98;
  const rng = mx - mn || 1;
  const n = history.length;

  function px(i) { return pad.l + (i / Math.max(n - 1, 1)) * (W - pad.l - pad.r); }
  function py(v) { return pad.t + (1 - (v - mn) / rng) * (H - pad.t - pad.b); }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  // Grid
  const sym = (CURRENCIES[sh.currency || 'USD'] || {}).symbol || '$';
  for (let i = 0; i <= 4; i++) {
    const v = mn + (rng * i / 4); const yy = py(v);
    ctx.strokeStyle = '#e6eaf1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
    ctx.fillStyle = '#8b9099'; ctx.font = '11px "DM Mono",monospace'; ctx.textAlign = 'right';
    ctx.fillText(sym + Math.round(v).toLocaleString(), pad.l - 6, yy + 4);
  }

  // Date labels
  const labelInterval = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += labelInterval) {
    ctx.fillStyle = '#8b9099'; ctx.font = '10px "DM Sans",sans-serif'; ctx.textAlign = 'center';
    const d = history[i].date;
    ctx.fillText(d.slice(5), px(i), H - 6);
  }

  // Area fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0, 'rgba(154,117,32,.18)'); grad.addColorStop(1, 'rgba(154,117,32,.02)');
  ctx.beginPath(); ctx.moveTo(px(0), py(prices[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(prices[i]));
  ctx.lineTo(px(n - 1), H - pad.b); ctx.lineTo(px(0), H - pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.strokeStyle = '#9a7520'; ctx.lineWidth = 2;
  ctx.moveTo(px(0), py(prices[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(prices[i]));
  ctx.stroke();

  // Start/end dots
  [[0, prices[0]], [n - 1, prices[n - 1]]].forEach(([i, v]) => {
    ctx.beginPath(); ctx.arc(px(i), py(v), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#9a7520'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
  });

  // Current price label
  ctx.fillStyle = '#9a7520'; ctx.font = 'bold 12px "DM Mono",monospace'; ctx.textAlign = 'right';
  ctx.fillText(sym + prices[n - 1].toFixed(2), W - pad.r, pad.t - 4);

  // Title update
  const titleEl = document.getElementById('sh-price-chart-title');
  if (titleEl) {
    const pctChange = ((prices[n - 1] - prices[0]) / prices[0] * 100).toFixed(1);
    const arrow = pctChange >= 0 ? '↑' : '↓';
    titleEl.textContent = `Share Price — ${sym}${prices[0].toFixed(2)} → ${sym}${prices[n - 1].toFixed(2)} (${arrow}${Math.abs(pctChange)}%)`;
  }
}

function drawPortfolioValueChart(history, sh) {
  const cv = document.getElementById('sh-portfolio-chart');
  const empty = document.getElementById('sh-portfolio-empty');
  const lots = (sh.lots || []);

  if (history.length < 2 || lots.length === 0) {
    cv.width = 0; cv.height = 0;
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const pf = computePortfolioHistory();
  if (pf.dates.length < 2) { cv.width = 0; cv.height = 0; empty.style.display = ''; return; }

  // Filter to same range as price chart
  const rangeDays = parseInt(document.getElementById('sh-chart-range').value) || 0;
  let startIdx = 0;
  if (rangeDays > 0) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    startIdx = pf.dates.findIndex(d => d >= cutoffStr);
    if (startIdx < 0) startIdx = 0;
  }

  const dates = pf.dates.slice(startIdx);
  const values = pf.values.slice(startIdx);
  const gains = pf.gains.slice(startIdx);
  const nets = pf.nets.slice(startIdx);
  const n = dates.length;
  if (n < 2) { cv.width = 0; cv.height = 0; empty.style.display = ''; return; }

  const W = cv.parentElement.clientWidth - 44, H = 240;
  if (W < 100) return;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const pad = { t: 24, r: 16, b: 36, l: 80 };

  const allVals = [...values, ...gains, ...nets];
  const mx = Math.max(...allVals) * 1.05, mn = Math.min(...allVals, 0);
  const rng = mx - mn || 1;

  function px(i) { return pad.l + (i / Math.max(n - 1, 1)) * (W - pad.l - pad.r); }
  function py(v) { return pad.t + (1 - (v - mn) / rng) * (H - pad.t - pad.b); }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  // Grid
  const sym = (CURRENCIES[sh.currency || 'USD'] || {}).symbol || '$';
  for (let i = 0; i <= 4; i++) {
    const v = mn + (rng * i / 4); const yy = py(v);
    ctx.strokeStyle = '#e6eaf1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
    ctx.fillStyle = '#8b9099'; ctx.font = '11px "DM Mono",monospace'; ctx.textAlign = 'right';
    ctx.fillText(sym + Math.round(v).toLocaleString(), pad.l - 6, yy + 4);
  }

  // Zero line
  if (mn < 0) {
    ctx.strokeStyle = 'rgba(220,38,38,.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(pad.l, py(0)); ctx.lineTo(W - pad.r, py(0)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Date labels
  const labelInterval = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += labelInterval) {
    ctx.fillStyle = '#8b9099'; ctx.font = '10px "DM Sans",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(dates[i].slice(5), px(i), H - 6);
  }

  // Draw lines: market value (gold), gain (green), net after CGT (blue)
  function drawLine(arr, color, width, dash) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.moveTo(px(0), py(arr[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(arr[i]));
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Area under market value
  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0, 'rgba(154,117,32,.12)'); grad.addColorStop(1, 'rgba(154,117,32,.02)');
  ctx.beginPath(); ctx.moveTo(px(0), py(values[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(values[i]));
  ctx.lineTo(px(n - 1), H - pad.b); ctx.lineTo(px(0), H - pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  drawLine(values, '#9a7520', 2.5);
  drawLine(gains, '#15803d', 1.5, [5, 3]);
  drawLine(nets, '#1d4ed8', 1.5, [3, 2]);

  // Legend
  ctx.font = '11px "DM Sans",sans-serif'; ctx.textAlign = 'left';
  let lx = pad.l;
  ctx.fillStyle = '#9a7520'; ctx.fillRect(lx, pad.t - 2, 14, 3); ctx.fillText('Market Value', lx + 18, pad.t + 3); lx += 110;
  ctx.fillStyle = '#15803d'; ctx.fillRect(lx, pad.t - 2, 14, 3); ctx.fillText('Unrealised Gain', lx + 18, pad.t + 3); lx += 120;
  ctx.fillStyle = '#1d4ed8'; ctx.fillRect(lx, pad.t - 2, 14, 3); ctx.fillText('Net After CGT', lx + 18, pad.t + 3);
}

// ─── Auto-fetch handler ───
async function autoFetchShareHistory() {
  const sh = S.shares || {};
  if (!sh.ticker) return;
  window._shFetching = true;
  const statusEl = document.getElementById('sh-auto-status');
  if (statusEl) {
    statusEl.textContent = `⟳ Loading ${sh.ticker} price history…`;
    statusEl.style.color = 'var(--dim)';
  }

  const result = await fetchShareHistory(sh.ticker, 'max');

  if (result.error) {
    if (statusEl) { statusEl.textContent = '⚠ Could not fetch prices: ' + result.error; statusEl.style.color = 'var(--red)'; }
  } else if (result.history.length === 0) {
    if (statusEl) { statusEl.textContent = '⚠ No price data found for ' + sh.ticker; statusEl.style.color = 'var(--amber)'; }
  } else {
    // Merge into cache
    if (!S.shares.priceHistory) S.shares.priceHistory = [];
    const existing = new Map(S.shares.priceHistory.map(p => [p.date, p]));
    for (const h of result.history) existing.set(h.date, h);
    S.shares.priceHistory = [...existing.values()].sort((a, b) => a.date.localeCompare(b.date));
    // Update current price from latest data
    if (result.currentPrice) S.shares.currentPrice = result.currentPrice;
    markDirty();
    if (statusEl) {
      statusEl.textContent = `✓ ${result.history.length} price points loaded · ${sh.companyName || sh.ticker} · Latest: ${fmtAs(result.currentPrice, sh.currency || 'USD')}`;
      statusEl.style.color = 'var(--green)';
    }
    renderSharesCharts();
    // Re-render stats with updated price (but don't re-trigger fetch)
    window._shFetching = true;
    renderShares();
  }
  window._shFetching = false;
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

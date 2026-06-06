// ─────────────────────────────────────────────
// UI — Tabs, Dashboard, Forecast, Items, Savings, Modal
// ─────────────────────────────────────────────

// CONFIG
function populateCfg() {
  const mon = document.getElementById('cfg-mon');
  mon.innerHTML = MN.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  const yr = document.getElementById('cfg-yr');
  yr.innerHTML = '';
  for (let y = 2020; y <= 2035; y++) yr.innerHTML += `<option value="${y}">${y}</option>`;
  const [sy, sm] = S.startMonth.split('-').map(Number);
  mon.value = sm; yr.value = sy;
  document.getElementById('cfg-bal').value = S.startingBalance;
  document.getElementById('cfg-fy').value = S.forecastYears;
  document.getElementById('sav-start').value = S.savings.startValue;
  document.getElementById('sav-growth').value = S.savings.growthPct;
}

function applyCfg() {
  const mon = +document.getElementById('cfg-mon').value;
  const yr = +document.getElementById('cfg-yr').value;
  const bal = parseFloat(document.getElementById('cfg-bal').value) || 0;
  const fy = +document.getElementById('cfg-fy').value;
  S.startMonth = `${yr}-${String(mon).padStart(2, '0')}`;
  S.startingBalance = bal;
  S.forecastYears = fy;
  markDirty(); rebuildMonths(); renderAll();
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
  if (name === 'forecast') renderForecast();
  if (name === 'savings') renderSavings();
  if (name === 'items') renderItems();
}

// DASHBOARD
function renderDash() {
  if (!MONTHS.length) return;
  const d = compute();
  const minBal = Math.min(...d.bals), minI = d.bals.indexOf(minBal);
  const endBal = d.bals[d.bals.length - 1];
  const avgNet = d.net.reduce((a, b) => a + b, 0) / d.net.length;
  const endM = MONTHS[MONTHS.length - 1];

  document.getElementById('sv-start').textContent = fmt(S.startingBalance);
  document.getElementById('ss-start').textContent = mLabel(S.startMonth);
  document.getElementById('chart-title').textContent = `Running Balance — ${mLabel(S.startMonth)} → ${mLabel(endM)}`;

  const sm = document.getElementById('sv-min');
  sm.textContent = fmt(minBal); sm.className = 'sv ' + (minBal < 0 ? 'neg' : 'pos');
  document.getElementById('ss-min').textContent = MONTHS[minI] ? mLabel(MONTHS[minI]) : '—';

  const se = document.getElementById('sv-end');
  se.textContent = fmt(endBal); se.className = 'sv ' + (endBal < 0 ? 'neg' : 'pos');
  const negM = d.bals.filter(b => b < 0).length;
  document.getElementById('ss-end').textContent = mLabel(endM) + (negM ? ` · ${negM}mo deficit` : '');

  const sa = document.getElementById('sv-avg');
  sa.textContent = fmt(Math.round(avgNet)); sa.className = 'sv ' + (avgNet < 0 ? 'neg' : 'pos');

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
  const el = document.getElementById(type === 'income' ? 'inc-list' : 'out-list');
  el.innerHTML = items.map(item => {
    const oc = Object.keys(item.overrides || {}).length;
    return `<div class="ir">
      <div class="icat">${item.category}</div>
      <div class="iname">${item.name}</div>
      <div class="ibase">${(item.base || 0) > 0 ? fmt(item.base) : '—'}/mo</div>
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
  document.getElementById('mod-title').textContent = 'Add ' + (type === 'income' ? 'Income' : 'Outgoing') + ' Item';
  document.getElementById('mod-type').value = type; document.getElementById('mod-id').value = '';
  document.getElementById('mod-name').value = ''; document.getElementById('mod-cat').value = '';
  document.getElementById('mod-base').value = '0';
  _mOvr = {}; buildOvrList(); buildMonthSel({});
  document.getElementById('imod').classList.add('open');
}

function openEdit(type, id) {
  const items = type === 'income' ? S.income : S.outgoings;
  const item = items.find(i => i.id === id); if (!item) return;
  const cats = [...new Set(items.map(i => i.category))];
  document.getElementById('cat-list').innerHTML = cats.map(c => `<option>${c}</option>`).join('');
  document.getElementById('mod-title').textContent = 'Edit Item';
  document.getElementById('mod-type').value = type; document.getElementById('mod-id').value = id;
  document.getElementById('mod-name').value = item.name; document.getElementById('mod-cat').value = item.category;
  document.getElementById('mod-base').value = item.base || 0;
  _mOvr = Object.assign({}, item.overrides || {});
  buildOvrList(); buildMonthSel(_mOvr);
  document.getElementById('imod').classList.add('open');
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
  if (!name) return alert('Please enter a name.');
  document.querySelectorAll('#ovr-list .ov').forEach(inp => { const v = parseFloat(inp.value); if (!isNaN(v)) _mOvr[inp.dataset.m] = v; });
  const items = type === 'income' ? S.income : S.outgoings;
  if (id) {
    const item = items.find(i => i.id === id);
    if (item) { item.name = name; item.category = cat; item.base = base; item.overrides = Object.assign({}, _mOvr); }
  } else {
    items.push({ id: name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now(), name, category: cat, base, overrides: Object.assign({}, _mOvr) });
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
  if (document.getElementById('tab-forecast').classList.contains('on')) renderForecast();
  if (document.getElementById('tab-savings').classList.contains('on')) renderSavings();
  if (document.getElementById('tab-items').classList.contains('on')) renderItems();
}

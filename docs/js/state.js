// ─────────────────────────────────────────────
// STATE & STORAGE
// ─────────────────────────────────────────────
const SK = 'cashflow_pwa_v1';
const SYNC_FILENAME = 'cashflow-data.json';
let S = null, dirty = false;
let MONTHS = [];
let _suppressGistSync = false;

// File System Access API handle (persisted via IndexedDB)
let _syncDirHandle = null;
let _autoSync = true;

function migrateState() {
  if (!S.savings) S.savings = deep(DEFAULTS.savings);
  if (!S.settings) S.settings = deep(DEFAULTS.settings);
  if (!S.settings.exchangeRates) S.settings.exchangeRates = {};
  if (!S.transactions) S.transactions = [];
  // Migrate old single S.shares to S.portfolios array
  if (S.shares && !S.portfolios) {
    const old = S.shares;
    if (old.ticker || (old.lots && old.lots.length > 0)) {
      const pf = newPortfolio(old.companyName || old.ticker || 'Portfolio 1');
      Object.assign(pf, { companyName: old.companyName, ticker: old.ticker, currentPrice: old.currentPrice,
        currency: old.currency, cgtRate: old.cgtRate, taxBreakdown: old.taxBreakdown,
        lots: old.lots || [], priceHistory: old.priceHistory || [] });
      S.portfolios = [pf];
    } else {
      S.portfolios = [];
    }
    delete S.shares;
  }
  if (!S.portfolios) S.portfolios = [];
  if (!S.vintedSales) S.vintedSales = [];
}

function load() {
  try {
    const r = localStorage.getItem(SK);
    if (r) {
      S = JSON.parse(r);
      migrateState();
      return;
    }
  } catch (e) {}
  S = deep(DEFAULTS);
}

function save() {
  S._lastSaved = new Date().toISOString();
  try { localStorage.setItem(SK, JSON.stringify(S)); dirty = false; badge(); } catch (e) {}
  // Gist auto-sync (only if we have real data and not suppressed)
  if (_gistAutoSync && _gistPAT && _gistId && !_suppressGistSync) {
    const hasData = (S.income && S.income.length > 0) || (S.outgoings && S.outgoings.length > 0)
      || (S.transactions && S.transactions.length > 0) || (S.portfolios && S.portfolios.length > 0)
      || (S.vintedSales && S.vintedSales.length > 0);
    if (hasData) {
      clearTimeout(window._gistSyncTimer);
      window._gistSyncTimer = setTimeout(() => gistWrite().catch(err => console.warn('Gist sync failed:', err)), 2000);
    }
  }
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
  if (!d || !t) return;
  d.className = dirty ? 'dot dirty' : 'dot';
  const syncIcon = (_gistPAT && _gistId) ? ' ☁' : '';
  t.textContent = dirty ? 'Saving…' : 'Saved' + syncIcon;
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

// ─────────────────────────────────────────────
// GIST-BASED CLOUD SYNC
// ─────────────────────────────────────────────
const GIST_SK = 'cashflow_gist_sync';
let _gistPAT = null;
let _gistId = null;
let _gistAutoSync = true;

function loadGistConfig() {
  try {
    const raw = localStorage.getItem(GIST_SK);
    if (raw) {
      const cfg = JSON.parse(raw);
      _gistPAT = cfg.pat || null;
      _gistId = cfg.gistId || null;
      _gistAutoSync = cfg.autoSync !== false;
    }
  } catch (e) {}
}

function saveGistConfig() {
  try {
    localStorage.setItem(GIST_SK, JSON.stringify({ pat: _gistPAT, gistId: _gistId, autoSync: _gistAutoSync }));
  } catch (e) {}
}

async function gistAPI(method, path, body) {
  const resp = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `token ${_gistPAT}`,
      'Accept': 'application/vnd.github.v3+json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function gistWrite() {
  if (!_gistPAT || !_gistId) return;
  const content = JSON.stringify(S, null, 2);
  await gistAPI('PATCH', `/gists/${_gistId}`, {
    files: { 'cashflow-data.json': { content } }
  });
  updateGistStatus(`✓ Synced ${new Date().toLocaleTimeString()}`, 'var(--green)');
}

async function gistRead() {
  if (!_gistPAT || !_gistId) return null;
  const gist = await gistAPI('GET', `/gists/${_gistId}`);
  const file = gist.files && gist.files['cashflow-data.json'];
  if (!file) return null;
  // If content is truncated, fetch the full file via raw_url
  if (file.truncated && file.raw_url) {
    const resp = await fetch(file.raw_url, {
      headers: { 'Authorization': `token ${_gistPAT}` }
    });
    if (!resp.ok) return null;
    return resp.json();
  }
  if (!file.content) return null;
  return JSON.parse(file.content);
}

async function connectGistSync() {
  const pat = document.getElementById('gist-pat').value.trim();
  if (!pat) return alert('Please enter a Personal Access Token.');
  _gistPAT = pat;

  const statusEl = document.getElementById('gist-setup-status');
  statusEl.textContent = 'Connecting…'; statusEl.style.color = 'var(--dim)';

  try {
    // Check if we already have a Gist ID stored
    if (_gistId) {
      // Verify it still exists
      try {
        await gistAPI('GET', `/gists/${_gistId}`);
        saveGistConfig();
        updateGistUI();
        // Load remote data if newer
        await gistSyncNow();
        return;
      } catch (e) {
        _gistId = null; // Gist was deleted, create a new one
      }
    }

    // Search for existing cashflow gist
    const gists = await gistAPI('GET', '/gists?per_page=100');
    const existing = gists.find(g => g.files && g.files['cashflow-data.json']);
    if (existing) {
      _gistId = existing.id;
      saveGistConfig();
      updateGistUI();
      statusEl.textContent = '✓ Found existing sync Gist'; statusEl.style.color = 'var(--green)';
      await gistSyncNow();
      return;
    }

    // Create a new private Gist
    const gist = await gistAPI('POST', '/gists', {
      description: 'Cashflow PWA Sync',
      public: false,
      files: { 'cashflow-data.json': { content: JSON.stringify(S, null, 2) } }
    });
    _gistId = gist.id;
    saveGistConfig();
    updateGistUI();
    statusEl.textContent = '✓ Connected — private Gist created and data synced'; statusEl.style.color = 'var(--green)';
  } catch (err) {
    statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--red)';
    _gistPAT = null; _gistId = null;
  }
}

function disconnectGistSync() {
  if (!confirm('Disconnect cloud sync? Your data stays on this device but will no longer sync.')) return;
  _gistPAT = null; _gistId = null; _gistAutoSync = true;
  localStorage.removeItem(GIST_SK);
  updateGistUI();
  badge();
}

async function gistSyncNow() {
  if (!_gistPAT || !_gistId) return;
  const statusEl = document.getElementById('gist-sync-status');
  statusEl.textContent = '⟳ Syncing…'; statusEl.style.color = 'var(--dim)';

  try {
    const remote = await gistRead();
    const localHasData = (S.income && S.income.length > 0) || (S.outgoings && S.outgoings.length > 0)
      || (S.transactions && S.transactions.length > 0) || (S.portfolios && S.portfolios.length > 0)
      || (S.vintedSales && S.vintedSales.length > 0);
    const remoteHasData = remote && ((remote.income && remote.income.length > 0) || (remote.outgoings && remote.outgoings.length > 0)
      || (remote.transactions && remote.transactions.length > 0) || (remote.portfolios && remote.portfolios.length > 0)
      || (remote.vintedSales && remote.vintedSales.length > 0));

    if (remote && remote._lastSaved) {
      if (!S._lastSaved && remoteHasData) {
        _suppressGistSync = true;
        S = remote;
        migrateState();
        localStorage.setItem(SK, JSON.stringify(S));
        populateCfg();
        rebuildMonths();
        renderAll();
        _suppressGistSync = false;
        statusEl.textContent = `✓ Loaded data from cloud (${new Date(remote._lastSaved).toLocaleTimeString()})`;
        statusEl.style.color = 'var(--green)';
        return;
      }
      if (S._lastSaved && remote._lastSaved > S._lastSaved) {
        _suppressGistSync = true;
        S = remote;
        migrateState();
        localStorage.setItem(SK, JSON.stringify(S));
        populateCfg();
        rebuildMonths();
        renderAll();
        _suppressGistSync = false;
        statusEl.textContent = `✓ Loaded newer data from cloud (${new Date(remote._lastSaved).toLocaleTimeString()})`;
        statusEl.style.color = 'var(--green)';
        return;
      }
    }

    if (!localHasData && remoteHasData) {
      _suppressGistSync = true;
      statusEl.textContent = '⚠ Local data is empty — loading from cloud instead';
      statusEl.style.color = 'var(--amber)';
      S = remote;
      migrateState();
      localStorage.setItem(SK, JSON.stringify(S));
      populateCfg();
      rebuildMonths();
      renderAll();
      _suppressGistSync = false;
      return;
    }

    // Local is newer or same — push to cloud
    S._lastSaved = new Date().toISOString();
    await gistWrite();
  } catch (err) {
    statusEl.textContent = '⚠ ' + err.message; statusEl.style.color = 'var(--red)';
  }
}

function toggleGistAutoSync() {
  _gistAutoSync = document.getElementById('gist-auto-sync').checked;
  saveGistConfig();
}

function updateGistUI() {
  const setupEl = document.getElementById('gist-sync-setup');
  const activeEl = document.getElementById('gist-sync-active');
  if (_gistPAT && _gistId) {
    setupEl.style.display = 'none';
    activeEl.style.display = '';
    document.getElementById('gist-auto-sync').checked = _gistAutoSync;
  } else {
    setupEl.style.display = '';
    activeEl.style.display = 'none';
  }
}

function updateGistStatus(msg, color) {
  const el = document.getElementById('gist-sync-status');
  if (el) { el.textContent = msg; el.style.color = color || 'var(--dim)'; }
}

// ─── Manual backup: save/load via file download/picker ───
function syncSaveFile() {
  S._lastSaved = new Date().toISOString();
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = SYNC_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
  try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) {}
}

function syncLoadFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.income && !data.outgoings && !data.portfolios) throw new Error('Invalid cashflow data file');
      S = data;
      migrateState();
      save();
      populateCfg();
      rebuildMonths();
      renderAll();
      alert('Data loaded successfully.');
    } catch (err) {
      alert('Load failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// Init sync on startup
async function initSync() {
  loadGistConfig();
  updateGistUI();
  badge();

  // Auto-load from Gist on startup if connected
  if (_gistPAT && _gistId) {
    try {
      await gistSyncNow();
    } catch (e) {
      console.warn('Startup gist sync failed:', e);
    }
  }
}

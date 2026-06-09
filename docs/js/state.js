// ─────────────────────────────────────────────
// STATE & STORAGE
// ─────────────────────────────────────────────
const SK = 'cashflow_pwa_v1';
const SYNC_FILENAME = 'cashflow-data.json';
let S = null, dirty = false;
let MONTHS = [];

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
  try { localStorage.setItem(SK, JSON.stringify(S)); dirty = false; badge(); } catch (e) {}
  if (_autoSync && _syncDirHandle) {
    syncWriteFile().catch(err => console.warn('Auto-sync write failed:', err));
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
  const syncIcon = _syncDirHandle ? ' ☁' : '';
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
// FILE SYSTEM SYNC (File System Access API)
// ─────────────────────────────────────────────
const SYNC_DB_NAME = 'cashflow_sync';
const SYNC_DB_STORE = 'handles';

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SYNC_DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveSyncHandle(handle) {
  const db = await openSyncDB();
  const tx = db.transaction(SYNC_DB_STORE, 'readwrite');
  tx.objectStore(SYNC_DB_STORE).put(handle, 'dirHandle');
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function loadSyncHandle() {
  const db = await openSyncDB();
  const tx = db.transaction(SYNC_DB_STORE, 'readonly');
  const req = tx.objectStore(SYNC_DB_STORE).get('dirHandle');
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function clearSyncHandle() {
  const db = await openSyncDB();
  const tx = db.transaction(SYNC_DB_STORE, 'readwrite');
  tx.objectStore(SYNC_DB_STORE).delete('dirHandle');
}

async function syncWriteFile() {
  if (!_syncDirHandle) return;
  try {
    const fileHandle = await _syncDirHandle.getFileHandle(SYNC_FILENAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(S, null, 2));
    await writable.close();
    updateSyncStatus(`✓ Saved to ${SYNC_FILENAME}`, 'var(--green)');
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      updateSyncStatus('⚠ Permission lost — click Sync Now to re-authorise', 'var(--amber)');
    } else {
      updateSyncStatus('⚠ Write failed: ' + err.message, 'var(--red)');
    }
  }
}

async function syncReadFile() {
  if (!_syncDirHandle) return null;
  try {
    const fileHandle = await _syncDirHandle.getFileHandle(SYNC_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (err) {
    if (err.name === 'NotFoundError') return null; // File doesn't exist yet
    throw err;
  }
}

async function linkSyncFolder() {
  if (!('showDirectoryPicker' in window)) {
    document.getElementById('sync-api-note').textContent = '⚠ Your browser doesn\'t support folder access. Use Chrome or Edge.';
    document.getElementById('sync-api-note').style.color = 'var(--red)';
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    _syncDirHandle = handle;
    await saveSyncHandle(handle);
    updateSyncUI();
    // Try to read existing file and offer merge
    const existing = await syncReadFile();
    if (existing && existing.income) {
      if (confirm('Found existing cashflow-data.json in this folder.\n\nLoad data from this file? (Your current data will be replaced)')) {
        S = existing;
        migrateState();
        save();
        populateCfg();
        rebuildMonths();
        renderAll();
        updateSyncStatus('✓ Loaded data from sync folder', 'var(--green)');
        return;
      }
    }
    // Write current state to the folder
    await syncWriteFile();
  } catch (err) {
    if (err.name === 'AbortError') return; // User cancelled picker
    console.warn('Link sync folder failed:', err);
  }
}

function unlinkSyncFolder() {
  if (!confirm('Stop syncing to this folder? (Your data is kept in the browser)')) return;
  _syncDirHandle = null;
  clearSyncHandle();
  updateSyncUI();
  badge();
}

async function syncNow() {
  if (!_syncDirHandle) return;
  // Re-verify permission
  const perm = await _syncDirHandle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    updateSyncStatus('⚠ Permission denied — please re-link the folder', 'var(--red)');
    return;
  }
  // Read the file and check if it's newer
  try {
    const remote = await syncReadFile();
    if (remote && remote._lastSaved && S._lastSaved && remote._lastSaved > S._lastSaved) {
      if (confirm('The sync file is newer than your local data. Load it?')) {
        S = remote;
        migrateState();
        localStorage.setItem(SK, JSON.stringify(S));
        populateCfg();
        rebuildMonths();
        renderAll();
        updateSyncStatus('✓ Loaded newer data from sync file', 'var(--green)');
        return;
      }
    }
  } catch (e) {}
  // Write current state
  S._lastSaved = new Date().toISOString();
  await syncWriteFile();
}

function toggleAutoSync() {
  _autoSync = document.getElementById('sync-auto').checked;
}

function updateSyncUI() {
  const linked = document.getElementById('sync-linked');
  const notLinked = document.getElementById('sync-not-linked');
  if (_syncDirHandle) {
    linked.style.display = '';
    notLinked.style.display = 'none';
    document.getElementById('sync-folder-name').textContent = '📁 ' + _syncDirHandle.name;
  } else {
    linked.style.display = 'none';
    notLinked.style.display = '';
  }
}

function updateSyncStatus(msg, color) {
  const el = document.getElementById('sync-last-status');
  if (el) { el.textContent = msg; el.style.color = color || 'var(--dim)'; }
}

// ─── Mobile sync: save/load via file picker ───
function syncSaveFile() {
  S._lastSaved = new Date().toISOString();
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = SYNC_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
  // Also save to localStorage
  try { localStorage.setItem(SK, JSON.stringify(S)); } catch (e) {}
  const status = document.getElementById('sync-mobile-status');
  if (status) { status.textContent = '✓ Saved — choose your OneDrive folder when prompted'; status.style.color = 'var(--green)'; }
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
      const status = document.getElementById('sync-mobile-status');
      if (status) { status.textContent = '✓ Loaded data from file'; status.style.color = 'var(--green)'; }
    } catch (err) {
      alert('Load failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// Restore saved handle on startup + show correct UI
async function initSync() {
  const hasFileSystemAPI = 'showDirectoryPicker' in window;
  const desktopEl = document.getElementById('sync-desktop');
  const mobileEl = document.getElementById('sync-mobile');
  const mobileLabelEl = document.getElementById('sync-mobile-label');

  if (hasFileSystemAPI) {
    // Desktop: show auto-sync + mobile fallback
    if (desktopEl) desktopEl.style.display = '';
    if (mobileLabelEl) mobileLabelEl.textContent = 'Manual Sync (or use on mobile)';
    try {
      const handle = await loadSyncHandle();
      if (handle) {
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          _syncDirHandle = handle;
        } else {
          _syncDirHandle = handle;
        }
      }
    } catch (e) {
      console.warn('Sync init:', e);
    }
    updateSyncUI();
  } else {
    // Mobile: hide desktop section, show mobile-only
    if (desktopEl) desktopEl.style.display = 'none';
    if (mobileLabelEl) mobileLabelEl.textContent = 'Sync via OneDrive';
  }
}

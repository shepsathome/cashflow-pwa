// ─────────────────────────────────────────────
// APP INIT
// ─────────────────────────────────────────────
load();
rebuildMonths();
populateCfg();
renderDash();
initSync();

// Auto-fetch share price on startup if stale
if (sharesNeedsFetch()) {
  autoFetchShareHistory().then(() => {
    if (document.getElementById('tab-dashboard').classList.contains('on')) renderDash();
  });
}

window.addEventListener('resize', () => {
  if (document.getElementById('tab-dashboard').classList.contains('on')) drawChart(compute());
  if (document.getElementById('tab-savings').classList.contains('on')) drawSavingsChart(computeSavings());
});

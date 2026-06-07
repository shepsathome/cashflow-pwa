// ─────────────────────────────────────────────
// APP INIT
// ─────────────────────────────────────────────
load();
rebuildMonths();
populateCfg();
renderDash();
initSync();

window.addEventListener('resize', () => {
  if (document.getElementById('tab-dashboard').classList.contains('on')) drawChart(compute());
  if (document.getElementById('tab-savings').classList.contains('on')) drawSavingsChart(computeSavings());
});

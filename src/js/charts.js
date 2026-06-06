// ─────────────────────────────────────────────
// CHARTS (Canvas-based)
// ─────────────────────────────────────────────
function drawChart(d) {
  const cv = document.getElementById('bal-chart');
  const W = cv.parentElement.clientWidth - 44, H = 260;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const pad = { t: 16, r: 16, b: 36, l: 80 };
  const vals = d.bals;
  const mx = Math.max(...vals, 0) * 1.05, mn = Math.min(...vals, 0) * 1.05;
  const rng = mx - mn || 1;

  function px(i) { return pad.l + (i / (Math.max(MONTHS.length - 1, 1))) * (W - pad.l - pad.r); }
  function py(v) { return pad.t + (1 - (v - mn) / rng) * (H - pad.t - pad.b); }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  // Grid lines
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = mn + (rng * i / steps); const yy = py(v);
    ctx.strokeStyle = '#e6eaf1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
    ctx.fillStyle = '#8b9099'; ctx.font = '11px "DM Mono",monospace'; ctx.textAlign = 'right';
    ctx.fillText(fmt(Math.round(v)), pad.l - 6, yy + 4);
  }

  // Zero line
  if (mn < 0 && mx > 0) {
    ctx.strokeStyle = 'rgba(220,38,38,.35)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(pad.l, py(0)); ctx.lineTo(W - pad.r, py(0)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Year boundary lines + labels
  let lastYear = -1;
  for (let i = 0; i < MONTHS.length; i++) {
    const yr = parseInt(MONTHS[i]);
    if (yr !== lastYear) {
      lastYear = yr;
      if (i > 0) { ctx.strokeStyle = '#dde2eb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(i), pad.t); ctx.lineTo(px(i), H - pad.b); ctx.stroke(); }
      ctx.fillStyle = '#8b9099'; ctx.font = '11px "DM Sans",sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(yr, px(i) + 3, H - 6);
    }
  }

  // Area fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0, 'rgba(154,117,32,.15)'); grad.addColorStop(1, 'rgba(154,117,32,.03)');
  ctx.beginPath(); ctx.moveTo(px(0), py(vals[0]));
  for (let i = 1; i < vals.length; i++) ctx.lineTo(px(i), py(vals[i]));
  ctx.lineTo(px(vals.length - 1), H - pad.b); ctx.lineTo(px(0), H - pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Negative area
  if (mn < 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, py(0), W - pad.l - pad.r, H - pad.b - py(0)); ctx.clip();
    const g2 = ctx.createLinearGradient(0, py(0), 0, H - pad.b);
    g2.addColorStop(0, 'rgba(220,38,38,.18)'); g2.addColorStop(1, 'rgba(220,38,38,.04)');
    ctx.beginPath(); ctx.moveTo(px(0), py(vals[0]));
    for (let i = 1; i < vals.length; i++) ctx.lineTo(px(i), py(vals[i]));
    ctx.lineTo(px(vals.length - 1), H - pad.b); ctx.lineTo(px(0), H - pad.b); ctx.closePath();
    ctx.fillStyle = g2; ctx.fill(); ctx.restore();
  }

  // Line
  for (let i = 1; i < vals.length; i++) {
    ctx.beginPath(); ctx.lineWidth = 2.5;
    ctx.strokeStyle = vals[i] < 0 ? '#dc2626' : '#9a7520';
    ctx.moveTo(px(i - 1), py(vals[i - 1])); ctx.lineTo(px(i), py(vals[i])); ctx.stroke();
  }

  // Dots at start/end and year-ends
  for (let i = 0; i < vals.length; i++) {
    const m = MONTHS[i];
    if (i === 0 || i === vals.length - 1 || m.endsWith('-12')) {
      ctx.beginPath(); ctx.arc(px(i), py(vals[i]), 4, 0, Math.PI * 2);
      ctx.fillStyle = vals[i] < 0 ? '#dc2626' : '#9a7520';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    }
  }
}

function drawSavingsChart(d) {
  const cv = document.getElementById('sav-chart');
  const W = cv.parentElement.clientWidth - 44, H = 260;
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const pad = { t: 16, r: 16, b: 36, l: 84 };
  const vals = d.bals;
  const mx = Math.max(...vals) * 1.04, mn = 0;
  const rng = mx - mn || 1;

  function px(i) { return pad.l + (i / (Math.max(MONTHS.length - 1, 1))) * (W - pad.l - pad.r); }
  function py(v) { return pad.t + (1 - (v - mn) / rng) * (H - pad.t - pad.b); }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  // Grid
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = mn + (rng * i / steps); const yy = py(v);
    ctx.strokeStyle = '#e6eaf1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
    ctx.fillStyle = '#8b9099'; ctx.font = '11px "DM Mono",monospace'; ctx.textAlign = 'right';
    ctx.fillText(fmt(Math.round(v)), pad.l - 6, yy + 4);
  }

  // Year lines
  let lastYr = -1;
  for (let i = 0; i < MONTHS.length; i++) {
    const yr = +MONTHS[i].split('-')[0];
    if (yr !== lastYr) {
      lastYr = yr;
      if (i > 0) { ctx.strokeStyle = '#dde2eb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(i), pad.t); ctx.lineTo(px(i), H - pad.b); ctx.stroke(); }
      ctx.fillStyle = '#8b9099'; ctx.font = '11px "DM Sans",sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(yr, px(i) + 3, H - 6);
    }
  }

  // Cumulative arrays
  const cumContrib = [], cumGrowth = [];
  let cc = S.savings.startValue, cg = 0;
  for (let i = 0; i < MONTHS.length; i++) {
    cc += d.contribs[i]; cg += d.growth[i];
    cumContrib.push(cc); cumGrowth.push(cg);
  }

  // Area 1: contributions (green tint)
  const gGreen = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  gGreen.addColorStop(0, 'rgba(21,128,61,.2)'); gGreen.addColorStop(1, 'rgba(21,128,61,.05)');
  ctx.beginPath(); ctx.moveTo(px(0), py(cumContrib[0]));
  for (let i = 1; i < MONTHS.length; i++) ctx.lineTo(px(i), py(cumContrib[i]));
  ctx.lineTo(px(MONTHS.length - 1), H - pad.b); ctx.lineTo(px(0), H - pad.b); ctx.closePath();
  ctx.fillStyle = gGreen; ctx.fill();

  // Area 2: total (gold tint)
  const gGold = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  gGold.addColorStop(0, 'rgba(154,117,32,.22)'); gGold.addColorStop(1, 'rgba(154,117,32,.04)');
  ctx.beginPath(); ctx.moveTo(px(0), py(vals[0]));
  for (let i = 1; i < MONTHS.length; i++) ctx.lineTo(px(i), py(vals[i]));
  ctx.lineTo(px(MONTHS.length - 1), H - pad.b); ctx.lineTo(px(0), H - pad.b); ctx.closePath();
  ctx.fillStyle = gGold; ctx.fill();

  // Contribution line (green dashed)
  ctx.beginPath(); ctx.strokeStyle = '#15803d'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
  ctx.moveTo(px(0), py(cumContrib[0]));
  for (let i = 1; i < MONTHS.length; i++) ctx.lineTo(px(i), py(cumContrib[i]));
  ctx.stroke(); ctx.setLineDash([]);

  // Total balance line (gold solid)
  ctx.beginPath(); ctx.strokeStyle = '#9a7520'; ctx.lineWidth = 2.5;
  ctx.moveTo(px(0), py(vals[0]));
  for (let i = 1; i < MONTHS.length; i++) ctx.lineTo(px(i), py(vals[i]));
  ctx.stroke();

  // Start/end dots
  [[0, vals[0]], [MONTHS.length - 1, vals[MONTHS.length - 1]]].forEach(([i, v]) => {
    ctx.beginPath(); ctx.arc(px(i), py(v), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#9a7520'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
  });

  // Legend
  ctx.font = '11px "DM Sans",sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#15803d'; ctx.fillRect(pad.l, pad.t, 12, 3); ctx.fillText('Contributions only', pad.l + 16, pad.t + 5);
  ctx.fillStyle = '#9a7520'; ctx.fillRect(pad.l + 140, pad.t, 12, 3); ctx.fillText('Total incl. growth', pad.l + 156, pad.t + 5);
}

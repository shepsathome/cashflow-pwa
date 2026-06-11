const fs = require('fs');
const { execSync } = require('child_process');

const csvPath = process.argv[2];
const gistId = process.argv[3];

// Read current Gist — get raw_url since content may be truncated
const gistMeta = JSON.parse(execSync(`gh api /gists/${gistId}`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
const rawUrl = gistMeta.files['cashflow-data.json'].raw_url;
const raw = execSync(`curl -sL "${rawUrl}"`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const data = JSON.parse(raw);
console.log(`Loaded Gist: ${Object.keys(data).length} keys, vintedSales: ${(data.vintedSales || []).length}`);

// Parse CSV
const lines = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1).filter(l => l.trim());
const sales = [];
for (let i = 0; i < lines.length; i++) {
  const parts = lines[i].split(',');
  if (parts.length < 3) continue;
  const dp = parts[0].split('/');
  const date = dp[2] + '-' + dp[1] + '-' + dp[0];
  const price = parseFloat(parts[parts.length - 1]);
  const name = parts.slice(1, parts.length - 1).join(',');
  if (isNaN(price)) continue;
  sales.push({ id: 'vin_' + (i + 1), date, name, amount: price, seller: '' });
}

console.log(`Parsed ${sales.length} Vinted sales from CSV`);
data.vintedSales = sales;
data._lastSaved = new Date().toISOString();

// Write to Gist
const content = JSON.stringify(data, null, 2);
console.log(`Output size: ${Math.round(content.length / 1024)}KB`);
const body = JSON.stringify({ files: { 'cashflow-data.json': { content } } });
const tmpFile = require('os').tmpdir() + '/gist_upload.json';
fs.writeFileSync(tmpFile, body);
execSync(`gh api /gists/${gistId} -X PATCH --input "${tmpFile}"`, { stdio: 'pipe', maxBuffer: 20 * 1024 * 1024 });

console.log('✓ Gist updated');

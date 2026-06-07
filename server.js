const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3457;
const STATIC_DIR = path.join(__dirname, 'src');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

async function handleProxy(req, res) {
  // /api/yahoo-chart?ticker=MSFT&range=max&interval=1d
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const ticker = url.searchParams.get('ticker');
  const range = url.searchParams.get('range') || 'max';
  const interval = url.searchParams.get('interval') || '1d';

  if (!ticker) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ticker parameter required' }));
    return;
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  try {
    const resp = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CashflowPWA/1.0)' }
    });
    const data = await resp.text();
    res.writeHead(resp.status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleStatic(req, res) {
  let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  filePath = path.normalize(filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/yahoo-chart')) {
    handleProxy(req, res);
  } else {
    handleStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Cashflow server running at http://localhost:${PORT}`);
  console.log(`  Static files: ${STATIC_DIR}`);
  console.log(`  Yahoo proxy:  /api/yahoo-chart?ticker=MSFT&range=max`);
});

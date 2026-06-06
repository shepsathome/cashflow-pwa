# Cashflow PWA

Personal finance forecast app — track income, outgoings, savings and running balance over time.

## Features

- **Dashboard** — stats cards, running balance chart, annual summary table
- **Forecast** — full monthly breakdown with inline cell editing
- **Savings** — contributions vs growth projections with stacked area chart
- **Items** — manage income & outgoing items with category grouping and monthly overrides
- **PWA** — installable, works offline via service worker
- **Local storage** — all data persists in the browser, auto-saves on change

## Project Structure

```
src/
├── index.html          # App shell
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (cache-first)
├── css/
│   └── app.css         # All styles
├── js/
│   ├── data.js         # Default data & month helpers
│   ├── state.js        # LocalStorage state management
│   ├── compute.js      # Forecast & savings calculations
│   ├── charts.js       # Canvas chart rendering
│   ├── ui.js           # UI rendering & interactions
│   └── app.js          # Init & resize handlers
└── icons/
    ├── icon-192.png    # PWA icon (TODO: generate)
    └── icon-512.png    # PWA icon (TODO: generate)
```

## Development

Static files — just serve `src/` with any HTTP server:

```bash
npx serve src
# or
python -m http.server 8080 --directory src
```

## TODO

- [ ] Generate PWA icons (192x192 and 512x512)
- [ ] Add data export/import (JSON)
- [ ] Dark mode support
- [ ] Mobile-optimised layout improvements

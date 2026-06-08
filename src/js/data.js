// ─────────────────────────────────────────────
// DEFAULT DATA & MONTH HELPERS
// ─────────────────────────────────────────────
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildMonths(startYYYYMM, years) {
  const [sy, sm] = startYYYYMM.split('-').map(Number);
  const m = [];
  let y = sy, mo = sm;
  const total = years * 12;
  for (let i = 0; i < total; i++) {
    m.push(`${y}-${String(mo).padStart(2, '0')}`);
    mo++;
    if (mo > 12) { mo = 1; y++; }
  }
  return m;
}

function mLabel(m) { const [y, mo] = m.split('-'); return MN[+mo - 1] + ' ' + y; }
function mLblShort(m) { const [y, mo] = m.split('-'); return MN[+mo - 1] + ' ' + y.slice(2); }

// Supported currencies — symbol, locale, and position
const CURRENCIES = {
  GBP: { symbol: '£', locale: 'en-GB', name: 'British Pound (£)' },
  USD: { symbol: '$', locale: 'en-US', name: 'US Dollar ($)' },
  EUR: { symbol: '€', locale: 'de-DE', name: 'Euro (€)' },
  JPY: { symbol: '¥', locale: 'ja-JP', name: 'Japanese Yen (¥)' },
  AUD: { symbol: 'A$', locale: 'en-AU', name: 'Australian Dollar (A$)' },
  CAD: { symbol: 'C$', locale: 'en-CA', name: 'Canadian Dollar (C$)' },
  CHF: { symbol: 'CHF', locale: 'de-CH', name: 'Swiss Franc (CHF)' },
  INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee (₹)' },
  SEK: { symbol: 'kr', locale: 'sv-SE', name: 'Swedish Krona (kr)' },
  NOK: { symbol: 'kr', locale: 'nb-NO', name: 'Norwegian Krone (kr)' },
  DKK: { symbol: 'kr', locale: 'da-DK', name: 'Danish Krone (kr)' },
  NZD: { symbol: 'NZ$', locale: 'en-NZ', name: 'New Zealand Dollar (NZ$)' },
  ZAR: { symbol: 'R', locale: 'en-ZA', name: 'South African Rand (R)' },
  BRL: { symbol: 'R$', locale: 'pt-BR', name: 'Brazilian Real (R$)' },
  SGD: { symbol: 'S$', locale: 'en-SG', name: 'Singapore Dollar (S$)' },
};

function newPortfolio(label) {
  return {
    id: 'pf_' + Date.now(),
    label: label || 'New Portfolio',
    companyName: '',
    ticker: '',
    currentPrice: 0,
    currency: 'USD',
    cgtRate: 31.4,
    taxBreakdown: { incomeTax: 12.8, socialCharges: 18.6 },
    lots: [],
    priceHistory: []
  };
}

const DEFAULTS = {
  startingBalance: 12500,
  startMonth: '2026-01',
  forecastYears: 5,
  settings: {
    currency: 'GBP',
    exchangeRates: {},      // e.g. { EUR: 0.845 } — 1 EUR = 0.845 base currency
    ratesLastUpdated: null   // ISO timestamp of last fetch
  },
  savings: { startValue: 8000, growthPct: 4.5 },
  portfolios: [],
  income: [
    { id: 'salary_1', name: 'Salary — Partner 1', category: 'Salaries', base: 3500, overrides: {} },
    { id: 'salary_2', name: 'Salary — Partner 2', category: 'Salaries', base: 2800, overrides: {} },
    { id: 'bonus', name: 'Annual Bonus', category: 'Bonuses', base: 0, overrides: {
      '2026-07': 5000, '2027-07': 5000, '2028-07': 5000, '2029-07': 5000, '2030-07': 5000
    }},
    { id: 'freelance', name: 'Freelance / Side Income', category: 'Other Income', base: 0, overrides: {
      '2026-03': 600, '2026-06': 800, '2026-09': 600, '2026-12': 500,
      '2027-03': 600, '2027-06': 800, '2027-09': 700, '2027-12': 500,
      '2028-03': 700, '2028-06': 900, '2028-09': 700, '2028-12': 600,
      '2029-03': 700, '2029-06': 900, '2029-09': 800, '2029-12': 600,
      '2030-03': 800, '2030-06': 1000, '2030-09': 800, '2030-12': 700
    }}
  ],
  outgoings: [
    { id: 'mortgage', name: 'Mortgage', category: 'Monthly Bills', base: 1250, overrides: {} },
    { id: 'utilities', name: 'Utilities (Gas, Electric, Water)', category: 'Monthly Bills', base: 185, overrides: {
      '2026-01': 220, '2026-02': 220, '2026-03': 200, '2026-11': 200, '2026-12': 230,
      '2027-01': 230, '2027-02': 225, '2027-11': 210, '2027-12': 235,
      '2028-01': 235, '2028-02': 230, '2028-11': 215, '2028-12': 240,
      '2029-01': 240, '2029-02': 235, '2029-11': 220, '2029-12': 245,
      '2030-01': 245, '2030-02': 240, '2030-11': 225, '2030-12': 250
    }},
    { id: 'council_tax', name: 'Council Tax', category: 'Monthly Bills', base: 155, overrides: {} },
    { id: 'home_ins', name: 'Home Insurance', category: 'Monthly Bills', base: 90, overrides: {} },
    { id: 'phone_broad', name: 'Phone & Broadband', category: 'Monthly Bills', base: 70, overrides: {} },
    { id: 'monthly_sav', name: 'Monthly Savings', category: 'Savings', base: 500, overrides: {} },
    { id: 'isa', name: 'ISA Contribution', category: 'Savings', base: 300, overrides: {
      '2026-04': 300, '2026-05': 300, '2026-06': 300, '2026-07': 300, '2026-08': 300,
      '2026-09': 300, '2026-10': 300, '2026-11': 300, '2026-12': 300,
      '2027-04': 350, '2027-05': 350, '2027-06': 350, '2027-07': 350, '2027-08': 350,
      '2027-09': 350, '2027-10': 350, '2027-11': 350, '2027-12': 350,
      '2028-04': 400, '2028-05': 400, '2028-06': 400, '2028-07': 400, '2028-08': 400,
      '2028-09': 400, '2028-10': 400, '2028-11': 400, '2028-12': 400,
      '2029-04': 400, '2030-04': 450
    }},
    { id: 'food', name: 'Food & Groceries', category: 'Regular', base: 420, overrides: {} },
    { id: 'transport', name: 'Transport & Fuel', category: 'Regular', base: 160, overrides: {} },
    { id: 'eating_out', name: 'Eating Out & Socialising', category: 'Regular', base: 200, overrides: {} },
    { id: 'clothing', name: 'Clothing & Personal', category: 'Regular', base: 100, overrides: {} },
    { id: 'subs', name: 'Subscriptions & Streaming', category: 'Regular', base: 55, overrides: {} },
    { id: 'gym', name: 'Gym & Health', category: 'Regular', base: 50, overrides: {} },
    { id: 'childcare', name: 'Childcare', category: 'Children', base: 650, overrides: {
      '2026-07': 0, '2026-08': 0,
      '2027-07': 0, '2027-08': 0,
      '2028-07': 0, '2028-08': 0, '2028-09': 200,
      '2028-10': 200, '2028-11': 200, '2028-12': 200,
      '2029-01': 200, '2029-02': 200, '2029-03': 200, '2029-04': 200, '2029-05': 200, '2029-06': 200,
      '2029-07': 0, '2029-08': 0, '2029-09': 0, '2029-10': 0, '2029-11': 0, '2029-12': 0,
      '2030-01': 0, '2030-02': 0, '2030-03': 0, '2030-04': 0, '2030-05': 0, '2030-06': 0,
      '2030-07': 0, '2030-08': 0, '2030-09': 0, '2030-10': 0, '2030-11': 0, '2030-12': 0
    }},
    { id: 'child_act', name: "Children's Activities", category: 'Children', base: 80, overrides: {} },
    { id: 'car_ins', name: 'Car Insurance', category: 'Annual', base: 0, overrides: {
      '2026-03': 850, '2027-03': 875, '2028-03': 900, '2029-03': 925, '2030-03': 950
    }},
    { id: 'holiday', name: 'Holiday', category: 'Annual', base: 0, overrides: {
      '2026-08': 2200, '2027-08': 2400, '2028-08': 2500, '2029-08': 2600, '2030-08': 2700
    }},
    { id: 'christmas', name: 'Christmas & Gifts', category: 'Annual', base: 0, overrides: {
      '2026-12': 1500, '2027-12': 1500, '2028-12': 1600, '2029-12': 1600, '2030-12': 1700
    }},
    { id: 'home_maint', name: 'Home Maintenance', category: 'Annual', base: 0, overrides: {
      '2026-04': 600, '2027-04': 500, '2027-10': 800, '2028-04': 600, '2029-04': 700, '2030-04': 600
    }},
    { id: 'credit_card', name: 'Credit Card Payment', category: 'Credit Cards', base: 150, overrides: {
      '2027-06': 3200
    }}
  ]
};

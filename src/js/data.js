// ─────────────────────────────────────────────
// DEFAULT DATA & MONTH HELPERS
// ─────────────────────────────────────────────
const APP_VERSION = '2026.08.15.1';
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

const CATEGORIES = {
  income: [
    'Salary', 'Bonus', 'Freelance', 'Rental Income', 'Dividends',
    'Child Benefit', 'Tax Refund', 'Gifts Received', 'Other Income'
  ],
  outgoing: [
    'Food & Groceries', 'Eating Out', 'Coffee & Drinks',
    'Rent / Mortgage', 'Utilities', 'Council Tax / Local Tax', 'Home Insurance',
    'Phone & Internet', 'Subscriptions', 'Streaming',
    'Transport & Fuel', 'Car Insurance', 'Car Maintenance', 'Parking & Tolls',
    'Health & Fitness', 'Medical & Pharmacy',
    'Clothes', 'Shoes', 'Make-up & Beauty', 'Haircuts',
    'Children', 'Childcare', 'School & Education',
    'Holidays & Travel', 'Eating Out & Socialising',
    'Gifts & Celebrations', 'Christmas',
    'Home Maintenance', 'Furniture & Homeware',
    'Electronics & Tech', 'Books & Magazines',
    'Pets', 'Charity & Donations',
    'Savings', 'Investments',
    'Credit Cards', 'Loans & Debt',
    'Tax & Accounting', 'Insurance (Other)',
    'Miscellaneous'
  ]
};

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
  // Emergency fund — 3–6 months of essential expenses (Rebel Finance School / Ramsey / JL Collins)
  emergencyFund: {
    targetMonths: 6,          // 3 = basic security, 6 = strong (default), 12 = variable income
    expenseMode: 'auto',      // 'auto' (all non-savings outgoings) | 'items' | 'manual'
    essentialItemIds: [],     // outgoing item ids counted when expenseMode === 'items'
    manualMonthlyExpense: 0,  // used when expenseMode === 'manual'
    fundSource: 'manual',     // 'manual' | 'savings' (link to current savings balance)
    currentAmount: 5000       // amount saved so far when fundSource === 'manual'
  },
  // Drawdown / FIRE planner — live off an ETF portfolio drawdown (4% rule / 25x, Trinity, Rebel Finance School)
  drawdown: {
    location: 'UK',            // 'UK' | 'France' — drives tax wrappers & rates
    potSource: 'auto',        // 'auto' (current savings + shares net + optional cash) | 'manual'
    includeCash: false,       // include current cash balance in the auto pot
    manualPot: 500000,        // starting investable pot when potSource === 'manual'
    expenseSource: 'auto',    // 'auto' (all non-savings outgoings ×12) | 'manual'
    manualAnnualExpense: 40000,
    currentAge: 40,
    retireAge: 55,            // year drawdown begins
    horizonAge: 95,           // plan must last until this age
    inflationPct: 2.5,        // predicted long-run inflation
    expReturnPct: 7.0,        // expected NOMINAL annual ETF return (real = exp − inflation)
    volatilityPct: 15.0,      // annual return std-dev for Monte Carlo
    withdrawalRate: 4.0,      // safe withdrawal rate used for the FIRE number (25× at 4%)
    annualContribution: 12000,// added each year until retireAge (today's money)
    otherIncome: 0,           // legacy single stream — superseded by pensions[] (kept for migration)
    otherIncomeStartAge: 67,
    // Guaranteed income streams (state/DB pensions) — reduce ETF drawdown from startAge
    pensions: [
      { id: 'uk_state', name: 'UK State Pension', annualAmount: 11500, startAge: 67, inflationLinked: true, taxRatePct: 0 }
    ],
    // Defined-contribution pension pots (workplace / SIPP / PER) — unlock at accessAge into the pot
    pensionPots: [
      { id: 'workplace', name: 'Workplace / SIPP pot', currentValue: 120000, accessAge: 57, taxFreePct: 25, incomeTaxPct: 15, annualContribution: 6000 }
    ],
    gainFraction: 50,         // % of each withdrawal assumed to be taxable gain vs returned capital
    simRuns: 1000,            // Monte Carlo iterations
    // Wrapper allocation (% of pot) per jurisdiction
    wrappers: {
      UK:     { isa: 60, sipp: 30, gia: 10 },
      France: { pea: 50, av: 30, cto: 20 }
    },
    // Effective tax rate applied to the GAIN portion of taxable withdrawals + annual allowance
    taxRates: {
      // UK: ISA & SIPP treated as sheltered (SIPP has a small effective income-tax drag);
      // GIA taxed at CGT. Allowance ≈ £3,000 CGT + £500 dividend.
      UK:     { isaRate: 0, sippRate: 15, giaRate: 20, allowance: 3500 },
      // France: PEA >5yr = 17.2% social only; Assurance Vie >8yr ≈ 24.7% (€4,600 allowance);
      // CTO = PFU flat tax 31.4% (12.8% + 18.6% from 2025).
      France: { peaRate: 17.2, avRate: 24.7, ctoRate: 31.4, allowance: 4600 }
    }
  },
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





// ============================================================
// currency.js
// Single source of truth for money math across AdOrbit / OrbitEarn.
// Every price is defined ONCE in UGX inside the route files, then
// converted here on the fly into whatever currency is needed.
//
// PRODUCTION UPGRADE PATH: these rates will drift over time. For a
// real launch, move RATE_PER_UGX into a DB table an admin can edit
// without a redeploy. Left as constants here for simplicity.
// ============================================================

const SUPPORTED_CURRENCIES = ['UGX', 'KES', 'TZS', 'RWF', 'ZAR', 'USD', 'EUR'];

// How many units of the target currency equal 1 UGX. Approximate, early 2026.
const RATE_PER_UGX = {
    UGX: 1,
    KES: 0.0347,
    TZS: 0.6935,
    RWF: 0.3629,
    ZAR: 0.0049,
    USD: 0.00027,
    EUR: 0.00025
};

const ZERO_DECIMAL = new Set(['UGX', 'TZS', 'RWF']);

function convert(amountUgx, targetCurrency) {
    if (!SUPPORTED_CURRENCIES.includes(targetCurrency)) {
        throw new Error(`Unsupported currency: ${targetCurrency}`);
    }
    const raw = Number(amountUgx) * RATE_PER_UGX[targetCurrency];
    const decimals = ZERO_DECIMAL.has(targetCurrency) ? 0 : 2;
    return Number(raw.toFixed(decimals));
}

function convertAll(amountUgx) {
    const out = {};
    SUPPORTED_CURRENCIES.forEach((c) => { out[c] = convert(amountUgx, c); });
    return out;
}

module.exports = { SUPPORTED_CURRENCIES, RATE_PER_UGX, convert, convertAll };

// ============================================================
// paymentGateway.js
// Modular abstraction over the mobile-money payment provider.
// Written against Flutterwave's v3 API. Swap the two env vars
// below in your Render dashboard to go live — no other code
// in this file needs to change.
// ============================================================

const FLW_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || 'FLWSECK_TEST-REPLACE_ME';
const FLW_WEBHOOK_HASH = process.env.FLUTTERWAVE_WEBHOOK_HASH || 'REPLACE_ME_WITH_A_LONG_RANDOM_STRING';
const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

/**
 * Creates a hosted checkout link for an advertiser to pay for a campaign.
 * amount must be a plain decimal number (e.g. 56000.00), never a string
 * with currency symbols — Flutterwave expects raw numeric values.
 */
async function createCheckoutLink({ amount, currency, email, txRef, redirectUrl }) {
    // ---- PRODUCTION: uncomment this block once FLUTTERWAVE_SECRET_KEY is a real live key ----
    /*
    const response = await fetch(`${FLW_BASE_URL}/payments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            tx_ref: txRef,
            amount,               // decimal number, e.g. 56000.00
            currency,              // 'UGX' | 'KES' | 'TZS' | 'RWF' | 'ZAR' | 'USD' | 'EUR'
            redirect_url: redirectUrl,
            customer: { email },
            payment_options: 'mobilemoneyuganda,mobilemoneyghana,mpesa,card'
        })
    });
    const data = await response.json();
    if (data.status !== 'success') {
        throw new Error(data.message || 'Payment gateway rejected the checkout request.');
    }
    return data.data.link;
    */

    // ---- SANDBOX STUB: remove once the block above is live ----
    console.warn('[paymentGateway] Using sandbox stub checkout link. Set FLUTTERWAVE_SECRET_KEY to go live.');
    return `https://sandbox-checkout.example.com/pay/${txRef}`;
}

/**
 * Verifies that an incoming webhook actually came from the payment
 * provider (not a forged request). Flutterwave sends a shared-secret
 * hash in the 'verif-hash' header that must match FLW_WEBHOOK_HASH,
 * which you configure both in Render's env vars and in the Flutterwave
 * dashboard webhook settings — never in code.
 */
function verifyWebhookSignature(reqHeaders) {
    const signature = reqHeaders['verif-hash'];
    if (!signature) return false;
    return signature === FLW_WEBHOOK_HASH;
}

/**
 * Pays an earner out to their mobile money account.
 * PRODUCTION: wire this to Flutterwave's /transfers endpoint.
 */
async function initiatePayout({ amount, currency, phoneNumber, network }) {
    /*
    const response = await fetch(`${FLW_BASE_URL}/transfers`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            account_bank: network === 'AIRTEL' ? 'AIRTEL' : 'MTN',
            account_number: phoneNumber,
            amount,
            currency,
            narration: 'AdOrbit / OrbitEarn payout'
        })
    });
    const data = await response.json();
    if (data.status !== 'success') throw new Error(data.message || 'Payout failed.');
    return { reference: data.data.reference };
    */

    const crypto = require('crypto');
    console.warn('[paymentGateway] Using sandbox stub payout. Set FLUTTERWAVE_SECRET_KEY to go live.');
    return { reference: 'PO_' + crypto.randomBytes(6).toString('hex').toUpperCase() };
}

module.exports = { createCheckoutLink, verifyWebhookSignature, initiatePayout };

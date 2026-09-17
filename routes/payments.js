const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { verifyWebhookSignature, initiatePayout } = require('../paymentGateway');

// The payment gateway calls this once an advertiser's checkout succeeds.
// This flips a campaign from 'unpaid' to either:
//   - 'active'          (content_source = 'own')
//   - 'pending_content'  (content_source = 'generated' — waits for the
//                         admin content queue, then customer approval)
router.post('/webhook', async (req, res) => {
    if (!verifyWebhookSignature(req.headers)) {
        return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const payload = req.body?.data || req.body || {};
    const { tx_ref: txRef, status } = payload;
    if (!txRef) {
        return res.status(400).json({ error: 'Missing transaction reference.' });
    }

    try {
        if (status === 'successful') {
            await db.query(
                `UPDATE campaigns
                 SET status = CASE WHEN content_source = 'generated' THEN 'pending_content' ELSE 'active' END
                 WHERE invoice_ref = $1 AND status = 'unpaid'`,
                [txRef]
            );
        }
        res.status(200).json({ received: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Webhook processing failed.' });
    }
});

// Earners cash out their withdrawable balance to mobile money.
router.post('/withdraw', auth, async (req, res) => {
    if (req.user.role !== 'earner') {
        return res.status(403).json({ error: 'Only earner accounts can request a withdrawal.' });
    }

    const { amount, currency, phoneNumber, network } = req.body;
    if (!amount || !currency || !phoneNumber) {
        return res.status(400).json({ error: 'Amount, currency, and phone number are required.' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const walletResult = await client.query(
            `SELECT balance FROM wallets WHERE user_id = $1 AND currency = $2 FOR UPDATE`,
            [req.user.id, currency]
        );
        if (!walletResult.rows.length || Number(walletResult.rows[0].balance) < Number(amount)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient withdrawable balance.' });
        }

        await client.query(
            `UPDATE wallets SET balance = balance - $1 WHERE user_id = $2 AND currency = $3`,
            [amount, req.user.id, currency]
        );

        const payout = await initiatePayout({ amount, currency, phoneNumber, network: network || 'MTN' });

        await client.query(
            `INSERT INTO payouts (user_id, amount, currency, phone_number, network, provider_ref, status)
             VALUES ($1,$2,$3,$4,$5,$6,'processing')`,
            [req.user.id, amount, currency, phoneNumber, network || 'MTN', payout.reference]
        );

        await client.query('COMMIT');
        res.json({ message: 'Withdrawal request submitted.', reference: payout.reference });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Withdrawal failed.' });
    } finally {
        client.release();
    }
});

module.exports = router;

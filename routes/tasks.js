const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { convert } = require('../currency');
const { isEligible } = require('../util/eligibility');

// Flat earner payout for social posts, defined once in UGX and converted
// per campaign currency via currency.js. Video pays per tracked view
// instead — see BASE_RATES_UGX in routes/campaigns.js (200 UGX charged to
// the advertiser, 50 UGX paid to the earner, per view) and the crediting
// logic in routes/admin.js's video-tasks endpoints.
const SOCIAL_EARNER_PAYOUT_UGX = 5000;   // per approved post — flat, not a percentage split

function requireEarner(req, res, next) {
    if (req.user.role !== 'earner') {
        return res.status(403).json({ error: 'Only earner accounts can complete tasks.' });
    }
    next();
}

async function earnerIsEligible(userId) {
    const socialResult = await db.query(
        `SELECT platform, followers_count, verification_status, verification_method FROM social_accounts WHERE user_id = $1`,
        [userId]
    );
    return isEligible(socialResult.rows);
}

// ---- Video: earner posts to their own TikTok/YouTube, then submits the live
// link here. No payout happens at submission time — the platform tracks the
// view count on that link over time (see /api/admin/video-tasks) and credits
// 50 UGX-equivalent per view as views come in, up to the campaign's budget. ----
router.post('/submit-video-proof', auth, requireEarner, async (req, res) => {
    const { campaignId, proofUrl } = req.body;
    if (!proofUrl) {
        return res.status(400).json({ error: 'A live video link is required.' });
    }

    try {
        if (!(await earnerIsEligible(req.user.id))) {
            return res.status(403).json({ error: 'Verify a qualifying social account before submitting videos.' });
        }

        const campaignResult = await db.query(
            `SELECT * FROM campaigns WHERE id = $1 AND campaign_type = 'video_cpv' AND status = 'active'`,
            [campaignId]
        );
        if (!campaignResult.rows.length) {
            return res.status(404).json({ error: 'This campaign is no longer available.' });
        }
        const campaign = campaignResult.rows[0];

        const existing = await db.query(
            `SELECT id FROM tasks WHERE campaign_id = $1 AND earner_id = $2 AND task_type = 'video'`,
            [campaignId, req.user.id]
        );
        if (existing.rows.length) {
            return res.status(409).json({ error: 'You already submitted a video link for this campaign — it\'s being tracked.' });
        }

        await db.query(
            `INSERT INTO tasks (campaign_id, earner_id, task_type, currency, proof_url, status)
             VALUES ($1,$2,'video',$3,$4,'active')`,
            [campaignId, req.user.id, campaign.currency, proofUrl]
        );

        res.status(201).json({ message: "Link submitted — we'll track its views and credit your balance as they come in." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit video link.' });
    }
});

// ---- Social reposts: funds sit in pending_balance until an admin reviews the live link ----
router.post('/submit-social-proof', auth, requireEarner, async (req, res) => {
    const { campaignId, proofUrl } = req.body;
    if (!proofUrl) {
        return res.status(400).json({ error: 'A live post URL is required.' });
    }

    try {
        if (!(await earnerIsEligible(req.user.id))) {
            return res.status(403).json({ error: 'Verify a qualifying social account before submitting posts.' });
        }

        const campaignResult = await db.query(
            `SELECT * FROM campaigns WHERE id = $1 AND campaign_type = 'social_flat' AND status = 'active'`,
            [campaignId]
        );
        if (!campaignResult.rows.length) {
            return res.status(404).json({ error: 'This campaign is no longer available.' });
        }
        const campaign = campaignResult.rows[0];
        const earnerAmount = convert(SOCIAL_EARNER_PAYOUT_UGX, campaign.currency);

        await db.query(
            `INSERT INTO tasks (campaign_id, earner_id, task_type, earner_amount, advertiser_deduction, currency, proof_url, status)
             VALUES ($1,$2,'social',$3,$4,$5,$6,'pending_approval')`,
            [campaignId, req.user.id, earnerAmount, campaign.unit_cost, campaign.currency, proofUrl]
        );
        await db.query(
            `UPDATE wallets SET pending_balance = pending_balance + $1 WHERE user_id = $2 AND currency = $3`,
            [earnerAmount, req.user.id, campaign.currency]
        );

        res.status(201).json({ message: 'Proof submitted. Funds will move to your withdrawable balance once an admin approves it.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit proof.' });
    }
});

router.get('/mine', auth, requireEarner, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, task_type, earner_amount, currency, status, proof_url, views_delivered, last_view_check_at, created_at
             FROM tasks WHERE earner_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [req.user.id]
        );
        res.json({ tasks: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch tasks.' });
    }
});

module.exports = router;

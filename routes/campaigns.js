const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { createCheckoutLink } = require('../paymentGateway');
const { convert, SUPPORTED_CURRENCIES } = require('../currency');
const { isEligible } = require('../util/eligibility');

const upload = multer({ dest: '/tmp/uploads', limits: { fileSize: 10 * 1024 * 1024 } });

// ---- Base prices, defined ONCE in UGX. Every currency is derived via currency.js ----
// Video is a real, distinct format: earners post it to their own TikTok/
// YouTube, then submit the live link. The platform tracks the view count
// on that link over time (see routes/tasks.js + routes/admin.js) and pays
// out per view, same as it charges the advertiser per view. There is no
// in-app "watch this video" mechanic — viewing happens on the earner's
// own social platform, not inside AdOrbit/OrbitEarn.
const BASE_RATES_UGX = {
    classified:  7500,    // flat, per week
    video_cpv:   200,     // per tracked view — advertiser price
    social_flat: 20000    // flat, per post — advertiser price
};
const GENERATED_CONTENT_MULTIPLIER = 1.5; // "generate for me" costs 50% more

const FLAT_TYPES = ['classified', 'social_flat'];
const VALID_CAMPAIGN_TYPES = Object.keys(BASE_RATES_UGX);

const VALID_COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'South Africa'];
const COUNTRY_CONTINENT = {
    Uganda: 'Africa', Kenya: 'Africa', Tanzania: 'Africa', Rwanda: 'Africa', 'South Africa': 'Africa'
};
const VALID_CONTINENTS = ['Africa']; // extend as AdOrbit expands beyond these 5 countries

const VALID_CATEGORIES = [
    'fashion', 'food', 'beauty', 'tech', 'fitness', 'finance',
    'entertainment', 'education', 'travel', 'automotive', 'general'
];

// ---- Advertisers pay per campaign — no wallet buffer on this side ----
router.post('/create', auth, upload.single('mediaFile'), async (req, res) => {
    if (req.user.role !== 'advertiser') {
        return res.status(403).json({ error: 'Only advertiser accounts can launch campaigns.' });
    }

    const {
        campaignType, title, businessCategory,
        targetScope, targetCountry, targetContinent,
        currency, totalUnits, destinationUrl,
        contentSource, generationBrief
    } = req.body;

    if (!title || !VALID_CATEGORIES.includes(businessCategory)) {
        return res.status(400).json({ error: 'A valid title and business category are required.' });
    }
    if (!VALID_CAMPAIGN_TYPES.includes(campaignType)) {
        return res.status(400).json({ error: 'Unsupported campaign type.' });
    }
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
        return res.status(400).json({ error: 'Unsupported currency.' });
    }
    const scope = targetScope || 'country';
    if (!['country', 'continent', 'world'].includes(scope)) {
        return res.status(400).json({ error: 'Target scope must be country, continent, or world.' });
    }
    if (scope === 'country' && !VALID_COUNTRIES.includes(targetCountry)) {
        return res.status(400).json({ error: 'A valid target country is required for country-scoped campaigns.' });
    }
    if (scope === 'continent' && !VALID_CONTINENTS.includes(targetContinent)) {
        return res.status(400).json({ error: 'A valid target continent is required for continent-scoped campaigns.' });
    }

    const source = contentSource === 'generated' ? 'generated' : 'own';
    if (source === 'generated' && (!generationBrief || generationBrief.trim().length < 15)) {
        return res.status(400).json({ error: 'Please describe your product/business (at least 15 characters) so our team can create your content.' });
    }
    if (source === 'own' && !req.file && campaignType !== 'classified') {
        return res.status(400).json({ error: 'Please upload your creative, or choose "generate for me" instead.' });
    }

    const units = FLAT_TYPES.includes(campaignType) ? 1 : Math.max(1, parseInt(totalUnits, 10) || 0);
    const baseUgx = BASE_RATES_UGX[campaignType] * (source === 'generated' ? GENERATED_CONTENT_MULTIPLIER : 1);
    const unitCost = convert(baseUgx, currency);
    const totalCost = Number((unitCost * units).toFixed(2));

    const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const invoiceRef = 'AD_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const generationStatus = source === 'generated' ? 'pending_admin' : 'not_applicable';

    try {
        const campaignResult = await db.query(
            `INSERT INTO campaigns
                (advertiser_id, campaign_type, title, business_category, target_scope, target_country, target_continent,
                 currency, unit_cost, total_units, remaining_budget, media_url, destination_url, invoice_ref,
                 content_source, generation_brief, generation_status, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'unpaid')
             RETURNING id, title, currency, campaign_type, total_units, invoice_ref, status, content_source, generation_status`,
            [
                req.user.id, campaignType, title, businessCategory, scope,
                scope === 'country' ? targetCountry : null,
                scope === 'continent' ? targetContinent : null,
                currency, unitCost, units, totalCost, mediaUrl, destinationUrl || null, invoiceRef,
                source, source === 'generated' ? generationBrief.trim() : null, generationStatus
            ]
        );
        const campaign = campaignResult.rows[0];

        const userResult = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);

        const checkoutLink = await createCheckoutLink({
            amount: totalCost,
            currency,
            email: userResult.rows[0].email,
            txRef: invoiceRef,
            redirectUrl: `${process.env.FRONTEND_ADVERTISER_URL || ''}/dashboard.html?invoice=${invoiceRef}`
        });

        res.status(201).json({ campaign, totalCost, checkoutLink });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create campaign.' });
    }
});

router.get('/mine', auth, async (req, res) => {
    if (req.user.role !== 'advertiser') {
        return res.status(403).json({ error: 'Only advertiser accounts can view this.' });
    }
    try {
        const result = await db.query(
            `SELECT c.id, c.campaign_type, c.title, c.business_category, c.target_scope, c.target_country, c.target_continent,
                    c.currency, c.unit_cost, c.total_units, c.remaining_budget, c.status, c.invoice_ref,
                    c.content_source, c.generation_status, c.generated_media_url, c.revision_notes, c.created_at,
                    COALESCE((SELECT SUM(t.views_delivered) FROM tasks t WHERE t.campaign_id = c.id AND t.task_type = 'video'), 0) AS total_views_delivered,
                    (SELECT COUNT(*) FROM tasks t WHERE t.campaign_id = c.id AND t.task_type = 'video') AS video_submission_count
             FROM campaigns c
             WHERE c.advertiser_id = $1 ORDER BY c.created_at DESC`,
            [req.user.id]
        );
        res.json({ campaigns: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch campaigns.' });
    }
});

// Per-campaign breakdown of who posted what, and how many views each link has delivered so far.
router.get('/:id/video-stats', auth, async (req, res) => {
    if (req.user.role !== 'advertiser') {
        return res.status(403).json({ error: 'Only advertiser accounts can view this.' });
    }
    try {
        const campaignCheck = await db.query(
            `SELECT id FROM campaigns WHERE id = $1 AND advertiser_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!campaignCheck.rows.length) {
            return res.status(404).json({ error: 'Campaign not found.' });
        }
        const result = await db.query(
            `SELECT t.id, t.proof_url, t.views_delivered, t.earner_amount, t.currency, t.created_at, t.last_view_check_at,
                    u.username AS earner_username
             FROM tasks t
             JOIN users u ON u.id = t.earner_id
             WHERE t.campaign_id = $1 AND t.task_type = 'video'
             ORDER BY t.views_delivered DESC`,
            [req.params.id]
        );
        res.json({ submissions: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch video stats.' });
    }
});

// Customer reviews content the admin generated for them.
router.post('/:id/review-content', auth, async (req, res) => {
    if (req.user.role !== 'advertiser') {
        return res.status(403).json({ error: 'Only advertiser accounts can review content.' });
    }
    const { approve, feedback } = req.body;

    try {
        const campaignResult = await db.query(
            `SELECT * FROM campaigns WHERE id = $1 AND advertiser_id = $2 AND generation_status = 'pending_customer_approval'`,
            [req.params.id, req.user.id]
        );
        if (!campaignResult.rows.length) {
            return res.status(404).json({ error: 'No content awaiting your review for this campaign.' });
        }
        const campaign = campaignResult.rows[0];

        if (approve) {
            await db.query(
                `UPDATE campaigns
                 SET media_url = generated_media_url, status = 'active',
                     generation_status = 'approved', revision_notes = NULL
                 WHERE id = $1`,
                [campaign.id]
            );
            res.json({ message: 'Content approved — your campaign is now live for earners.' });
        } else {
            await db.query(
                `UPDATE campaigns
                 SET status = 'pending_content', generation_status = 'pending_admin', revision_notes = $2
                 WHERE id = $1`,
                [campaign.id, feedback || 'Customer requested changes.']
            );
            res.json({ message: 'Feedback sent back to our content team for revisions.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit review.' });
    }
});

// Feed of live campaigns an earner can complete — filtered by niche, targeting scope, and social account eligibility.
router.get('/available/:taskType', auth, async (req, res) => {
    if (req.user.role !== 'earner') {
        return res.status(403).json({ error: 'Only earner accounts can view available tasks.' });
    }
    const typeMap = { video: 'video_cpv', social: 'social_flat' };
    const campaignType = typeMap[req.params.taskType];
    if (!campaignType) return res.status(400).json({ error: 'Invalid task type.' });

    try {
        const socialResult = await db.query(
            `SELECT platform, followers_count, verification_status, verification_method FROM social_accounts WHERE user_id = $1`,
            [req.user.id]
        );
        if (!isEligible(socialResult.rows)) {
            return res.status(403).json({
                error: 'Verify a qualifying social account (100+ TikTok/YouTube followers or 1000+ X followers) to unlock tasks.'
            });
        }

        const userResult = await db.query('SELECT niche, country FROM users WHERE id = $1', [req.user.id]);
        const { niche, country } = userResult.rows[0];
        const continent = COUNTRY_CONTINENT[country] || null;

        const result = await db.query(
            `SELECT id, title, currency, media_url, destination_url, unit_cost, remaining_budget, total_units, target_scope
             FROM campaigns
             WHERE campaign_type = $1 AND status = 'active' AND remaining_budget > 0
               AND (business_category = $2 OR business_category = 'general')
               AND (
                    target_scope = 'world'
                    OR (target_scope = 'country' AND target_country = $3)
                    OR (target_scope = 'continent' AND target_continent = $4)
               )
             ORDER BY created_at DESC LIMIT 50`,
            [campaignType, niche, country, continent]
        );

        res.json({ campaigns: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch available campaigns.' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { attemptAutoVerify } = require('../util/socialVerify');
const { isEligible } = require('../util/eligibility');

const VALID_PLATFORMS = ['tiktok', 'youtube', 'twitter'];
const VALID_CATEGORIES = [
    'fashion', 'food', 'beauty', 'tech', 'fitness', 'finance',
    'entertainment', 'education', 'travel', 'automotive', 'general'
];
const VALID_COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'South Africa'];

function requireEarner(req, res, next) {
    if (req.user.role !== 'earner') {
        return res.status(403).json({ error: 'Only earner accounts can access this.' });
    }
    next();
}

// Step 2 of earner onboarding: set niche + country.
router.post('/profile', auth, requireEarner, async (req, res) => {
    const { niche, country } = req.body;
    if (!VALID_CATEGORIES.includes(niche)) {
        return res.status(400).json({ error: 'Please select a valid niche.' });
    }
    if (!VALID_COUNTRIES.includes(country)) {
        return res.status(400).json({ error: 'Please select a valid country.' });
    }
    try {
        await db.query('UPDATE users SET niche = $1, country = $2 WHERE id = $3', [niche, country, req.user.id]);
        res.json({ message: 'Profile updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// Step 3: submit a social account link for follower verification.
router.post('/social-accounts', auth, requireEarner, async (req, res) => {
    const { platform, handle, profileUrl } = req.body;
    if (!VALID_PLATFORMS.includes(platform) || !handle || !profileUrl) {
        return res.status(400).json({ error: 'Platform, handle, and profile URL are required.' });
    }

    try {
        const { followersCount, method } = await attemptAutoVerify(platform, handle);

        const result = await db.query(
            `INSERT INTO social_accounts (user_id, platform, handle, profile_url, followers_count, verification_status, verification_method, verified_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (user_id, platform) DO UPDATE
                SET handle = $3, profile_url = $4, followers_count = $5, verification_status = $6, verification_method = $7, verified_at = $8
             RETURNING id, platform, handle, followers_count, verification_status`,
            [
                req.user.id, platform, handle, profileUrl,
                followersCount,
                followersCount != null ? 'verified' : 'pending',
                method,
                followersCount != null ? new Date() : null
            ]
        );

        const message = followersCount != null
            ? `Verified automatically at ${followersCount} followers.`
            : 'Submitted — TikTok/X accounts are checked by an admin and usually verified within a day.';

        res.status(201).json({ message, account: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit social account.' });
    }
});

router.get('/social-accounts', auth, requireEarner, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, platform, handle, profile_url, followers_count, verification_status, verification_method, created_at, verified_at
             FROM social_accounts WHERE user_id = $1`,
            [req.user.id]
        );
        res.json({ accounts: result.rows, eligible: isEligible(result.rows) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch social accounts.' });
    }
});

module.exports = router;

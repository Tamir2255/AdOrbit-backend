// ============================================================
// util/eligibility.js
// (replaces the old util/tiers.js — the micro/standard tier system
// has been removed entirely per Tamir's request)
//
// The ONLY gate for earning on OrbitEarn: at least one verified
// TikTok, YouTube, or X account meeting the platform minimum.
// No further tiering by follower count — once you're in, you see
// every campaign matching your niche and location, full stop.
//
// Minimums:
//   - TikTok / YouTube: 100+ followers/subscribers
//   - X (Twitter):      1,000+ followers
// ============================================================

const MINIMUM_FOLLOWERS = { tiktok: 100, youtube: 100, twitter: 1000 };

// An account counts as eligible if:
//   - it's 'verified', AND
//   - if it was auto-verified (exact follower count known), that count
//     meets the platform minimum
//   - if it was manually verified by an admin, we trust the admin already
//     confirmed it meets the minimum before approving
function accountIsEligible(account) {
    if (account.verification_status !== 'verified') return false;
    const min = MINIMUM_FOLLOWERS[account.platform];
    if (!min) return false;

    if (account.verification_method === 'auto' && account.followers_count != null) {
        return Number(account.followers_count) >= min;
    }
    return true; // manual approval already implies the minimum was met
}

function isEligible(socialAccounts) {
    return socialAccounts.some(accountIsEligible);
}

module.exports = { MINIMUM_FOLLOWERS, accountIsEligible, isEligible };

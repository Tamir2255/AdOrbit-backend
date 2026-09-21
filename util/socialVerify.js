// ============================================================
// util/socialVerify.js
// Attempts to auto-verify a submitted social account's follower count.
// Falls back to the admin manual-review queue when no reliable API exists.
//
// CURRENT STATE:
//   - YouTube: auto via Data API v3 if YOUTUBE_API_KEY is set. Free.
//   - TikTok:  MANUAL for now (see verifyTikTok below). No free public
//              lookup exists for arbitrary accounts.
//   - X:       MANUAL for now (see verifyTwitter below). The follower-count
//              endpoint requires a paid API tier.
//
// WHEN TAMIR ADDS THE PAID SCRAPING API:
//   Fill in verifyTikTok() / verifyTwitter() below with the real HTTP call
//   (a RapidAPI TikTok/Twitter follower-lookup endpoint, or the official
//   paid X API). The moment either function returns a number instead of
//   null, that platform becomes fully automatic — nothing else in the
//   codebase needs to change, since routes/earnerProfile.js just calls
//   attemptAutoVerify() and reacts to whether a count came back.
// ============================================================

async function verifyYouTube(handle) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=${encodeURIComponent(cleanHandle)}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();
    const stats = data?.items?.[0]?.statistics;
    if (!stats) return null;
    return Number(stats.subscriberCount);
}

async function verifyTwitter(_handle) {
    // ---- PLUG IN PAID API HERE ----
    // const token = process.env.TWITTER_BEARER_TOKEN;
    // if (!token) return null;
    // const response = await fetch(`https://api.twitter.com/2/users/by/username/${_handle}?user.fields=public_metrics`,
    //     { headers: { Authorization: `Bearer ${token}` } });
    // const data = await response.json();
    // return data?.data?.public_metrics?.followers_count ?? null;
    return null; // manual review until the paid tier/API key is added
}

async function verifyTikTok(_handle) {
    // ---- PLUG IN SCRAPING API HERE (e.g. a RapidAPI TikTok stats endpoint) ----
    // const response = await fetch(`https://<provider>/tiktok/user?username=${_handle}`,
    //     { headers: { 'X-RapidAPI-Key': process.env.TIKTOK_SCRAPE_API_KEY } });
    // const data = await response.json();
    // return data?.followerCount ?? null;
    return null; // manual review until a scraping API key is added
}

async function attemptAutoVerify(platform, handle) {
    try {
        let followersCount = null;
        if (platform === 'youtube') followersCount = await verifyYouTube(handle);
        else if (platform === 'twitter') followersCount = await verifyTwitter(handle);
        else if (platform === 'tiktok') followersCount = await verifyTikTok(handle);

        if (followersCount != null) return { followersCount, method: 'auto' };
        return { followersCount: null, method: 'manual' };
    } catch (err) {
        console.error('[socialVerify] auto-verification failed, falling back to manual:', err.message);
        return { followersCount: null, method: 'manual' };
    }
}

module.exports = { attemptAutoVerify };

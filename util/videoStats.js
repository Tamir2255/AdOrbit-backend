// ============================================================
// util/videoStats.js
// After an earner posts a video to their own TikTok/YouTube and submits
// the live link, this is what lets AdOrbit track how many views that
// specific link has gotten — the number both the earner's payout and
// the advertiser's campaign stats are based on.
//
// CURRENT STATE:
//   - YouTube: auto via Data API v3's public `statistics.viewCount` on the
//     video, if YOUTUBE_API_KEY is set. Free, no auth from the earner needed
//     since view count is public data.
//   - TikTok: MANUAL. TikTok has no free public endpoint for view counts on
//     an arbitrary video URL. An admin opens the link, reads the view count
//     off the page, and enters it in the Admin Console's video tracking tab.
//
// WHEN A PAID TIKTOK API IS ADDED: fill in fetchTikTokViewCount() below.
// The moment it returns a number instead of null, TikTok tracking becomes
// automatic too — nothing else needs to change.
// ============================================================

function detectPlatform(url) {
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
    if (/tiktok\.com/i.test(url)) return 'tiktok';
    return 'unknown';
}

function extractYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function fetchYouTubeViewCount(url) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    const videoId = extractYouTubeVideoId(url);
    if (!videoId) return null;

    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    const stats = data?.items?.[0]?.statistics;
    if (!stats) return null;
    return Number(stats.viewCount);
}

async function fetchTikTokViewCount(_url) {
    // ---- PLUG IN A PAID TIKTOK API/SCRAPER HERE ----
    // const response = await fetch(`https://<provider>/tiktok/video-stats?url=${encodeURIComponent(_url)}`,
    //     { headers: { 'X-RapidAPI-Key': process.env.TIKTOK_SCRAPE_API_KEY } });
    // const data = await response.json();
    // return data?.viewCount ?? null;
    return null; // manual entry via Admin Console until a key is added
}

/**
 * Returns { viewCount: number, method: 'auto' } on success,
 * or { viewCount: null, method: 'manual' } when it needs an admin to check by hand.
 */
async function attemptAutoFetchViews(url) {
    try {
        const platform = detectPlatform(url);
        let viewCount = null;
        if (platform === 'youtube') viewCount = await fetchYouTubeViewCount(url);
        else if (platform === 'tiktok') viewCount = await fetchTikTokViewCount(url);

        if (viewCount != null) return { viewCount, method: 'auto', platform };
        return { viewCount: null, method: 'manual', platform };
    } catch (err) {
        console.error('[videoStats] auto view-count fetch failed, falling back to manual:', err.message);
        return { viewCount: null, method: 'manual', platform: detectPlatform(url) };
    }
}

module.exports = { detectPlatform, attemptAutoFetchViews };

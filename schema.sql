-- ============================================================
-- AdOrbit / OrbitEarn Platform — PostgreSQL Schema (Supabase)
-- Run this once in your Supabase project's SQL Editor before first deploy.
-- This is a full rebuild — safe to run now since there's no live
-- user data yet. If that changes before you run this, ask for an
-- incremental ALTER migration instead.
-- ============================================================

DROP TABLE IF EXISTS payouts CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS social_accounts CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS currency_code CASCADE;

CREATE TYPE user_role AS ENUM ('advertiser', 'earner', 'admin');
CREATE TYPE currency_code AS ENUM ('UGX', 'KES', 'TZS', 'RWF', 'ZAR', 'USD', 'EUR');

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50) NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'advertiser',
    -- Earner-only fields (NULL for advertisers/admins):
    niche         VARCHAR(50),
    country       VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallets (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency        currency_code NOT NULL,
    balance         NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    pending_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    UNIQUE (user_id, currency)
);

-- The only qualification that matters: does this account meet the
-- platform minimum (100+ TikTok/YouTube, 1000+ X)? Verified accounts are
-- eligible to earn; there's no further tiering by follower count.
CREATE TABLE social_accounts (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform             VARCHAR(20) NOT NULL CHECK (platform IN ('tiktok', 'youtube', 'twitter')),
    handle               VARCHAR(100) NOT NULL,
    profile_url          TEXT NOT NULL,
    followers_count      INTEGER,
    verification_status  VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verification_method  VARCHAR(20), -- 'auto' | 'manual'
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at            TIMESTAMPTZ,
    UNIQUE (user_id, platform)
);

CREATE TABLE campaigns (
    id                    SERIAL PRIMARY KEY,
    advertiser_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_type         VARCHAR(30) NOT NULL, -- classified | video_cpv | social_flat
    title                 VARCHAR(255) NOT NULL,
    business_category     VARCHAR(50) NOT NULL,

    target_scope          VARCHAR(20) NOT NULL DEFAULT 'country'
                          CHECK (target_scope IN ('country', 'continent', 'world')),
    target_country        VARCHAR(50),
    target_continent      VARCHAR(50),

    currency              currency_code NOT NULL,
    unit_cost             NUMERIC(14,4) NOT NULL,
    total_units           INTEGER NOT NULL,
    remaining_budget      NUMERIC(14,2) NOT NULL,
    media_url             TEXT,
    destination_url       TEXT,
    invoice_ref           VARCHAR(50) UNIQUE NOT NULL,

    content_source        VARCHAR(20) NOT NULL DEFAULT 'own'
                          CHECK (content_source IN ('own', 'generated')),
    generation_brief       TEXT,
    generated_media_url    TEXT,
    generation_status      VARCHAR(30) NOT NULL DEFAULT 'not_applicable'
                          CHECK (generation_status IN (
                              'not_applicable', 'pending_admin', 'pending_customer_approval', 'approved', 'revision_requested'
                          )),
    revision_notes          TEXT,

    status                VARCHAR(30) NOT NULL DEFAULT 'unpaid'
                          CHECK (status IN (
                              'unpaid', 'pending_content', 'pending_customer_approval', 'active', 'completed', 'rejected'
                          )),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tasks (
    id                   SERIAL PRIMARY KEY,
    campaign_id          INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    earner_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_type            VARCHAR(30) NOT NULL, -- video | social
    earner_amount        NUMERIC(14,4) NOT NULL DEFAULT 0, -- cumulative for video (grows as views are credited); final for social
    advertiser_deduction NUMERIC(14,4) NOT NULL DEFAULT 0, -- cumulative spend this task has drawn from the campaign budget
    currency             currency_code NOT NULL,
    proof_url            TEXT,
    -- Video-only view tracking. NULL/0 for social tasks.
    views_delivered      INTEGER NOT NULL DEFAULT 0,
    last_view_check_at   TIMESTAMPTZ,
    status               VARCHAR(20) NOT NULL DEFAULT 'approved'
                         CHECK (status IN ('approved', 'pending_approval', 'rejected', 'active')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at          TIMESTAMPTZ
);

CREATE TABLE payouts (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount        NUMERIC(14,2) NOT NULL,
    currency      currency_code NOT NULL,
    phone_number  VARCHAR(20),
    network       VARCHAR(20),
    provider_ref  VARCHAR(100),
    status        VARCHAR(20) NOT NULL DEFAULT 'processing',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_advertiser ON campaigns(advertiser_id);
CREATE INDEX idx_campaigns_status_type ON campaigns(status, campaign_type);
CREATE INDEX idx_campaigns_targeting ON campaigns(business_category, target_scope, target_country, target_continent);
CREATE INDEX idx_tasks_earner ON tasks(earner_id);
CREATE INDEX idx_tasks_campaign ON tasks(campaign_id);
CREATE INDEX idx_social_accounts_user ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_status ON social_accounts(verification_status, platform);

-- After deploying, promote yourself to admin manually, e.g.:
-- UPDATE users SET role = 'admin' WHERE email = 'you@example.com';

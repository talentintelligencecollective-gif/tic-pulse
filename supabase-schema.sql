-- ═══════════════════════════════════════════════════════════════
--  TIC Pulse — Supabase Schema (Phase 1)
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- ─── Articles ───
-- Core table storing GDELT-sourced articles with AI summaries
CREATE TABLE IF NOT EXISTS articles (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gdelt_url    TEXT UNIQUE NOT NULL,                       -- dedupe key
  title        TEXT NOT NULL,
  source_name  TEXT,                                       -- e.g. "Financial Times"
  source_domain TEXT,                                      -- e.g. "ft.com"
  image_url    TEXT,                                       -- GDELT socialimage
  category     TEXT,                                       -- AI-assigned category
  tldr         TEXT,                                       -- AI-generated summary
  tags         TEXT[] DEFAULT '{}',                        -- AI-generated hashtags
  gdelt_tone   NUMERIC(5,2),                               -- GDELT tone score (-100 to +100)
  language     TEXT DEFAULT 'en',
  published_at TIMESTAMPTZ,                                -- article publish date
  created_at   TIMESTAMPTZ DEFAULT NOW(),                  -- when we ingested it
  summarised   BOOLEAN DEFAULT FALSE,                      -- has Claude processed it?
  read_time_min INTEGER DEFAULT 4,                         -- estimated read time
  active       BOOLEAN DEFAULT TRUE                        -- soft delete flag
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
CREATE INDEX IF NOT EXISTS idx_articles_summarised ON articles (summarised) WHERE summarised = FALSE;
CREATE INDEX IF NOT EXISTS idx_articles_active ON articles (active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_gdelt_url ON articles (gdelt_url);

-- Enable RLS
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Public read access (anon key can read active articles)
CREATE POLICY "Anyone can read active articles"
  ON articles
  FOR SELECT
  TO anon
  USING (active = TRUE AND summarised = TRUE);

-- Service role can do everything (used by Netlify Functions)
-- No explicit policy needed — service role bypasses RLS


-- ─── Engagement Counts ───
-- Denormalised counters for fast reads (Phase 1: updated client-side via RPC)
-- In Phase 2 these will be derived from user-specific likes/comments tables
CREATE TABLE IF NOT EXISTS article_engagement (
  article_id   UUID PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  like_count   INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count  INTEGER DEFAULT 0,
  view_count   INTEGER DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE article_engagement ENABLE ROW LEVEL SECURITY;

-- Anyone can read engagement counts
CREATE POLICY "Anyone can read engagement"
  ON article_engagement
  FOR SELECT
  TO anon
  USING (TRUE);

-- Allow anon to increment counts (Phase 1 — no auth)
-- In Phase 2, replace this with authenticated-only updates
CREATE POLICY "Anyone can update engagement"
  ON article_engagement
  FOR UPDATE
  TO anon
  USING (TRUE)
  WITH CHECK (TRUE);


-- ─── RPC: Increment engagement ───
-- Atomic counter increment to prevent race conditions
CREATE OR REPLACE FUNCTION increment_engagement(
  p_article_id UUID,
  p_field TEXT,          -- 'like_count', 'share_count', 'view_count'
  p_delta INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  -- Validate field name to prevent SQL injection
  IF p_field NOT IN ('like_count', 'comment_count', 'share_count', 'view_count') THEN
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;

  -- Upsert engagement row and increment atomically
  INSERT INTO article_engagement (article_id)
  VALUES (p_article_id)
  ON CONFLICT (article_id) DO NOTHING;

  EXECUTE format(
    'UPDATE article_engagement SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE article_id = $2',
    p_field, p_field
  ) USING p_delta, p_article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── View: Articles with engagement ───
-- Joined view for the frontend to query
CREATE OR REPLACE VIEW articles_feed AS
SELECT
  a.id,
  a.gdelt_url,
  a.title,
  a.source_name,
  a.source_domain,
  a.image_url,
  a.category,
  a.tldr,
  a.tags,
  a.gdelt_tone,
  a.published_at,
  a.created_at,
  a.read_time_min,
  COALESCE(e.like_count, 0)    AS like_count,
  COALESCE(e.comment_count, 0) AS comment_count,
  COALESCE(e.share_count, 0)   AS share_count,
  COALESCE(e.view_count, 0)    AS view_count
FROM articles a
LEFT JOIN article_engagement e ON e.article_id = a.id
WHERE a.active = TRUE AND a.summarised = TRUE
ORDER BY a.created_at DESC;

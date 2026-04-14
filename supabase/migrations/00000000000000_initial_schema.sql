-- TIC Pulse — canonical bootstrap schema (code-derived; apply to a fresh Supabase project)
-- Order: run after enabling extensions if needed. Auth is Supabase-managed (auth.users).

-- ─── Articles (GDELT pipeline) ───
CREATE TABLE IF NOT EXISTS articles (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gdelt_url     TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  source_name   TEXT,
  source_domain TEXT,
  image_url     TEXT,
  category      TEXT,
  tldr          TEXT,
  tags          TEXT[] DEFAULT '{}',
  gdelt_tone    NUMERIC(5,2),
  language      TEXT DEFAULT 'en',
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  summarised    BOOLEAN DEFAULT FALSE,
  read_time_min INTEGER DEFAULT 4,
  active        BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
CREATE INDEX IF NOT EXISTS idx_articles_summarised ON articles (summarised) WHERE summarised = FALSE;
CREATE INDEX IF NOT EXISTS idx_articles_active ON articles (active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_gdelt_url ON articles (gdelt_url);

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active articles"
  ON articles FOR SELECT TO anon, authenticated
  USING (active = TRUE AND summarised = TRUE);

-- ─── Engagement counters ───
CREATE TABLE IF NOT EXISTS article_engagement (
  article_id    UUID PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  like_count    INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count   INTEGER DEFAULT 0,
  view_count    INTEGER DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE article_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read engagement"
  ON article_engagement FOR SELECT TO anon, authenticated USING (TRUE);

CREATE POLICY "Authenticated users can update engagement"
  ON article_engagement FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Authenticated users can insert engagement"
  ON article_engagement FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION increment_engagement(
  p_article_id UUID,
  p_field TEXT,
  p_delta INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  IF p_field NOT IN ('like_count', 'comment_count', 'share_count', 'view_count') THEN
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;
  INSERT INTO article_engagement (article_id) VALUES (p_article_id)
  ON CONFLICT (article_id) DO NOTHING;
  EXECUTE format(
    'UPDATE article_engagement SET %I = GREATEST(0, %I + $1), updated_at = NOW() WHERE article_id = $2',
    p_field, p_field
  ) USING p_delta, p_article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION increment_engagement(UUID, TEXT, INTEGER) TO anon, authenticated;

-- ─── Feed view ───
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
WHERE a.active = TRUE AND a.summarised = TRUE;

-- Balanced feed RPC (8 categories cap per round-robin)
CREATE OR REPLACE FUNCTION fetch_balanced_feed(feed_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  gdelt_url text,
  title text,
  source_name text,
  source_domain text,
  image_url text,
  category text,
  tldr text,
  tags text[],
  gdelt_tone numeric,
  published_at timestamptz,
  created_at timestamptz,
  read_time_min integer,
  like_count integer,
  comment_count integer,
  share_count integer,
  view_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      af.id,
      af.gdelt_url,
      af.title,
      af.source_name,
      af.source_domain,
      af.image_url,
      af.category,
      af.tldr,
      af.tags,
      af.gdelt_tone,
      af.published_at,
      af.created_at,
      af.read_time_min,
      af.like_count,
      af.comment_count,
      af.share_count,
      af.view_count,
      row_number() OVER (PARTITION BY af.category ORDER BY af.created_at DESC) AS rn
    FROM articles_feed af
  ),
  lim AS (
    SELECT GREATEST(1, CEIL(feed_limit::numeric / 8))::int AS per_cat
  )
  SELECT
    ranked.id,
    ranked.gdelt_url,
    ranked.title,
    ranked.source_name,
    ranked.source_domain,
    ranked.image_url,
    ranked.category,
    ranked.tldr,
    ranked.tags,
    ranked.gdelt_tone,
    ranked.published_at,
    ranked.created_at,
    ranked.read_time_min,
    ranked.like_count,
    ranked.comment_count,
    ranked.share_count,
    ranked.view_count
  FROM ranked, lim
  WHERE ranked.rn <= lim.per_cat
  ORDER BY ranked.created_at DESC
  LIMIT feed_limit;
$$;

GRANT EXECUTE ON FUNCTION fetch_balanced_feed(integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION article_category_counts()
RETURNS TABLE (category text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT af.category, COUNT(*)::bigint FROM articles_feed af GROUP BY af.category;
$$;

GRANT EXECUTE ON FUNCTION article_category_counts() TO anon, authenticated;

-- ─── Profiles ───
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  company     TEXT,
  job_title   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── User intelligence profile (AI-generated) ───
CREATE TABLE IF NOT EXISTS user_profiles (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company             TEXT,
  industry            TEXT,
  "function"          TEXT,
  seniority           TEXT,
  feed_topics         TEXT[] DEFAULT '{}',
  company_keywords    TEXT[] DEFAULT '{}',
  competitor_keywords TEXT[] DEFAULT '{}',
  profile_source      TEXT,
  generated_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own user_profiles"
  ON user_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own user_profiles"
  ON user_profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Per-user article engagement ───
CREATE TABLE IF NOT EXISTS user_engagement (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id       UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  liked            BOOLEAN DEFAULT FALSE,
  bookmarked       BOOLEAN DEFAULT FALSE,
  user_name        TEXT,
  newsletter_prefs JSONB,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_user_engagement_article ON user_engagement (article_id);

ALTER TABLE user_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own engagement"
  ON user_engagement FOR ALL TO authenticated  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Read likers for article"
  ON user_engagement FOR SELECT TO authenticated
  USING (liked = TRUE);

-- ─── Streaks ───
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak     INTEGER DEFAULT 0,
  longest_streak     INTEGER DEFAULT 0,
  last_active_date   DATE,
  total_active_days  INTEGER DEFAULT 0,
  total_likes        INTEGER DEFAULT 0,
  total_comments     INTEGER DEFAULT 0,
  total_shares       INTEGER DEFAULT 0,
  total_bookmarks    INTEGER DEFAULT 0,
  total_newsletters  INTEGER DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own streaks"
  ON user_streaks FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_user_streak(p_user_id uuid)
RETURNS SETOF user_streaks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (timezone('utc', now()))::date;
  rec user_streaks%ROWTYPE;
BEGIN
  INSERT INTO user_streaks (user_id, last_active_date, current_streak, longest_streak, total_active_days)
  VALUES (p_user_id, v_today, 1, 1, 1)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO rec FROM user_streaks WHERE user_id = p_user_id FOR UPDATE;

  IF rec.last_active_date IS NOT DISTINCT FROM v_today THEN
    RETURN NEXT rec;
    RETURN;
  END IF;

  IF rec.last_active_date IS NULL THEN
    rec.current_streak := 1;
    rec.longest_streak := GREATEST(rec.longest_streak, 1);
    rec.total_active_days := rec.total_active_days + 1;
    rec.last_active_date := v_today;
    rec.updated_at := now();
    UPDATE user_streaks SET
      last_active_date = rec.last_active_date,
      current_streak = rec.current_streak,
      longest_streak = rec.longest_streak,
      total_active_days = rec.total_active_days,
      updated_at = rec.updated_at
    WHERE user_id = p_user_id
    RETURNING * INTO rec;
    RETURN NEXT rec;
    RETURN;
  END IF;

  IF rec.last_active_date = v_today - 1 THEN
    rec.current_streak := rec.current_streak + 1;
  ELSE
    rec.current_streak := 1;
  END IF;

  rec.longest_streak := GREATEST(rec.longest_streak, rec.current_streak);
  rec.total_active_days := rec.total_active_days + 1;
  rec.last_active_date := v_today;
  rec.updated_at := now();

  UPDATE user_streaks SET
    last_active_date = rec.last_active_date,
    current_streak = rec.current_streak,
    longest_streak = rec.longest_streak,
    total_active_days = rec.total_active_days,
    updated_at = rec.updated_at
  WHERE user_id = p_user_id
  RETURNING * INTO rec;

  RETURN NEXT rec;
END;
$$;

GRANT EXECUTE ON FUNCTION update_user_streak(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION increment_streak_counter(
  p_user_id uuid,
  p_field text,
  p_delta integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field NOT IN (
    'total_likes', 'total_comments', 'total_shares', 'total_bookmarks', 'total_newsletters'
  ) THEN
    RAISE EXCEPTION 'Invalid streak field';
  END IF;
  INSERT INTO user_streaks (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  EXECUTE format(
    'UPDATE user_streaks SET %I = GREATEST(0, %I + $1), updated_at = now() WHERE user_id = $2',
    p_field, p_field
  ) USING p_delta, p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_streak_counter(uuid, text, integer) TO authenticated;

-- ─── Comments ───
CREATE TABLE IF NOT EXISTS comments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES comments(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  user_name  TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_article ON comments (article_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments"
  ON comments FOR SELECT TO anon, authenticated USING (TRUE);

CREATE POLICY "Authenticated insert comments"
  ON comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own comments"
  ON comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── Multimedia sources ───
CREATE TABLE IF NOT EXISTS sources (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type                    TEXT NOT NULL,
  name                    TEXT NOT NULL,
  host                    TEXT,
  tier                    TEXT DEFAULT '3',
  active                  BOOLEAN DEFAULT TRUE,
  rss_url                 TEXT,
  youtube_channel_id      TEXT,
  youtube_uploads_playlist TEXT,
  logo_url                TEXT,
  pull_mode               TEXT,
  keywords                TEXT[] DEFAULT '{}',
  keyword_threshold       INTEGER DEFAULT 2,
  last_fetched_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sources_type_active ON sources (type, active);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active sources"
  ON sources FOR SELECT TO anon, authenticated USING (active = TRUE);

-- ─── Videos (YouTube) ───
CREATE TABLE IF NOT EXISTS videos (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id        UUID REFERENCES sources(id) ON DELETE SET NULL,
  youtube_id       TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  description      TEXT,
  published_at     TIMESTAMPTZ,
  duration         TEXT,
  duration_seconds INTEGER,
  thumbnail_url    TEXT,
  channel_title    TEXT,
  view_count       BIGINT DEFAULT 0,
  like_count       BIGINT DEFAULT 0,
  comment_count    BIGINT DEFAULT 0,
  video_type       TEXT DEFAULT 'video',
  tags             TEXT[] DEFAULT '{}',
  keyword_matches  TEXT[] DEFAULT '{}',
  keyword_score    INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_published ON videos (published_at DESC);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read videos"
  ON videos FOR SELECT TO anon, authenticated USING (TRUE);

-- ─── Podcast episodes ───
CREATE TABLE IF NOT EXISTS episodes (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id        UUID REFERENCES sources(id) ON DELETE CASCADE,
  episode_guid     TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  published_at     TIMESTAMPTZ,
  duration TEXT,
  duration_seconds INTEGER,
  audio_url        TEXT,
  link             TEXT,
  guest_name       TEXT,
  guest_org        TEXT,
  image_url        TEXT,
  keyword_matches  TEXT[] DEFAULT '{}',
  keyword_score    INTEGER DEFAULT 0,
  listen_count     INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_id, episode_guid)
);

CREATE INDEX IF NOT EXISTS idx_episodes_published ON episodes (published_at DESC);

ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read episodes"
  ON episodes FOR SELECT TO anon, authenticated USING (TRUE);

-- ─── Brand guidelines (newsletter theming) ───
CREATE TABLE IF NOT EXISTS brand_guidelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  primary_hex  TEXT,
  logo_url     TEXT,
  extra JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE brand_guidelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read brand_guidelines"
  ON brand_guidelines FOR SELECT TO authenticated USING (TRUE);

-- ─── Audio briefings metadata ───
CREATE TABLE IF NOT EXISTS audio_briefings (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path      TEXT NOT NULL,
  public_url        TEXT NOT NULL,
  article_count     INTEGER DEFAULT 0,
  duration_estimate TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_briefings_user ON audio_briefings (user_id);

ALTER TABLE audio_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own audio_briefings"
  ON audio_briefings FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own audio_briefings"
  ON audio_briefings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Sentinel article for newsletter_prefs row (user_engagement uses all-zero UUID article_id)
INSERT INTO articles (id, gdelt_url, title, summarised, active)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'tic-pulse-internal://newsletter-prefs',
  '[Internal] Newsletter preferences',
  true,
  false
)
ON CONFLICT (gdelt_url) DO NOTHING;

-- Storage bucket (create if missing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-briefings', 'audio-briefings', true)
ON CONFLICT (id) DO NOTHING;

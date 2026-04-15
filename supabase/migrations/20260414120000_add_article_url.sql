-- Resolved publisher article URL (Google News RSS links are decoded server-side).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS article_url TEXT;

COMMENT ON COLUMN articles.article_url IS 'Publisher article URL when resolved from news.google.com; optional.';

-- Cannot use CREATE OR REPLACE VIEW when inserting a column in the middle of the
-- projection: Postgres matches columns by ordinal position. Drop dependents first.
DROP FUNCTION IF EXISTS article_category_counts();
DROP FUNCTION IF EXISTS fetch_balanced_feed(integer);
DROP VIEW IF EXISTS articles_feed;

CREATE VIEW articles_feed AS
SELECT
  a.id,
  a.gdelt_url,
  a.article_url,
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

CREATE OR REPLACE FUNCTION fetch_balanced_feed(feed_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  gdelt_url text,
  article_url text,
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
      af.article_url,
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
    ranked.article_url,
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

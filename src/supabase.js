import { createClient } from "@supabase/supabase-js";

// ─── Client Setup ───

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

// ─── Article Queries ───

/**
 * Fetch articles from the articles_feed view.
 * Returns articles sorted by created_at DESC.
 *
 * @param {Object} options
 * @param {string} [options.category] - Filter by category (omit for all)
 * @param {string} [options.search] - Search in title and tldr
 * @param {number} [options.limit=200] - Max articles to return
 * @param {number} [options.offset=0] - Pagination offset
 */
export async function fetchArticles({ category, search, limit = 200, offset = 0 } = {}) {
  let query = supabase
    .from("articles_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== "All") {
    query = query.eq("category", category);
  }

  if (search) {
    // Sanitise special characters for PostgREST ilike
    const safe = search.replace(/[%_'"\\]/g, "");
    if (safe.length > 0) {
      query = query.or(`title.ilike.%${safe}%,tldr.ilike.%${safe}%`);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchArticles error:", error.message);
    return [];
  }

  return data || [];
}

/**
 * Increment an engagement counter atomically.
 *
 * @param {string} articleId - UUID of the article
 * @param {string} field - One of: like_count, share_count, view_count
 * @param {number} [delta=1] - Amount to increment (use -1 to decrement)
 */
export async function incrementEngagement(articleId, field, delta = 1) {
  const { error } = await supabase.rpc("increment_engagement", {
    p_article_id: articleId,
    p_field: field,
    p_delta: delta,
  });

  if (error) {
    console.error(`incrementEngagement error (${field}):`, error.message);
  }
}

/**
 * Fetch top categories by article count for the Discover view.
 */
export async function fetchCategoryCounts() {
  const { data, error } = await supabase
    .from("articles_feed")
    .select("category");

  if (error || !data) return {};

  const counts = {};
  for (const row of data) {
    counts[row.category] = (counts[row.category] || 0) + 1;
  }
  return counts;
}

// ─── Interaction Tracking (for personalisation) ───

/**
 * Log a user interaction for personalisation scoring.
 * Fires and forgets — errors are logged but don't block UI.
 *
 * @param {string} userId
 * @param {string} articleId
 * @param {string} interactionType - 'like' | 'bookmark' | 'share' | 'click'
 * @param {Object} article - The article object (needs category, tags, region)
 */
export async function trackInteraction(userId, articleId, interactionType, article) {
  if (!userId || !articleId) return;
  try {
    await supabase.from("user_interactions").insert({
      user_id: userId,
      article_id: articleId,
      interaction_type: interactionType,
      category: article?.category || null,
      tags: article?.tags || [],
      region: article?.region || null,
    });
  } catch (err) {
    // Silently fail — personalisation is non-critical
    console.warn("trackInteraction error:", err.message);
  }
}

/**
 * Fetch a user's category affinities from the user_affinities view.
 * Returns { "Automation": { total: 12, recent: 5 }, ... }
 *
 * @param {string} userId
 * @returns {Object} affinities keyed by category
 */
export async function fetchUserAffinities(userId) {
  if (!userId) return {};
  try {
    const { data, error } = await supabase
      .from("user_affinities")
      .select("*")
      .eq("user_id", userId);

    if (error || !data) return {};

    const result = {};
    for (const row of data) {
      result[row.category] = {
        total: row.interaction_count || 0,
        recent: row.recent_count || 0,
        likes: row.like_count || 0,
        bookmarks: row.bookmark_count || 0,
      };
    }
    return result;
  } catch (err) {
    console.warn("fetchUserAffinities error:", err.message);
    return {};
  }
}

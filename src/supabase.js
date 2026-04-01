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
 * @param {number} [options.limit=30] - Max articles to return
 * @param {number} [options.offset=0] - Pagination offset
 */
export async function fetchArticles({ category, search, limit = 30, offset = 0 } = {}) {
  let query = supabase
    .from("articles_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== "All") {
    query = query.eq("category", category);
  }

  if (search) {
    // Search across title and tldr
    query = query.or(`title.ilike.%${search}%,tldr.ilike.%${search}%`);
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

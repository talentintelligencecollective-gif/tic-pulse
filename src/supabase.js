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
 * Limit raised to 200 for global coverage.
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
    // Sanitise: escape PostgREST special chars to prevent filter injection
    const safe = search.replace(/[%_\\()"',.*]/g, "");
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

// ═══════════════════════════════════════════════
//  INTERACTION TRACKING — for personalisation
// ═══════════════════════════════════════════════

/**
 * Log a user interaction for personalisation.
 * Called on like, bookmark, share, and article click (open external link).
 *
 * @param {string} userId - The user's auth ID
 * @param {string} articleId - UUID of the article
 * @param {string} type - One of: 'view', 'like', 'bookmark', 'share', 'click'
 * @param {Object} article - The article object (for denormalised category/tags/region)
 */
export async function trackInteraction(userId, articleId, type, article = {}) {
  if (!userId || !articleId) return;

  const { error } = await supabase.from("user_interactions").insert({
    user_id: userId,
    article_id: articleId,
    interaction_type: type,
    category: article.category || null,
    tags: article.tags || [],
    region: article.region || null,
  });

  if (error && error.code !== "23505") {
    console.error("trackInteraction error:", error.message);
  }
}

/**
 * Fetch the current user's category affinities for personalisation.
 * Returns { "Talent Strategy": { count: 12, recent: 5 }, ... }
 *
 * @param {string} userId
 * @returns {Object} Category affinity scores
 */
export async function fetchUserAffinities(userId) {
  if (!userId) return {};

  const { data, error } = await supabase
    .from("user_affinities")
    .select("*")
    .eq("user_id", userId);

  if (error || !data) return {};

  const affinities = {};
  for (const row of data) {
    affinities[row.category] = {
      total: row.interaction_count,
      likes: row.like_count,
      bookmarks: row.bookmark_count,
      clicks: row.click_count,
      recent: row.recent_count,
    };
  }
  return affinities;
}

// ═══════════════════════════════════════════════
//  NEWSLETTER & BRAND GUIDELINES
//  (used by NewsletterBuilder.jsx)
// ═══════════════════════════════════════════════

/**
 * Load user's saved newsletter preferences (theme, sender name, etc.)
 */
export async function loadUserPreferences(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_engagement")
      .select("newsletter_prefs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data.newsletter_prefs || null;
  } catch {
    return null;
  }
}

/**
 * Save user's newsletter preferences
 */
export async function saveUserPreferences(userId, prefs) {
  if (!userId) return;
  try {
    await supabase.from("user_engagement").upsert({
      user_id: userId,
      newsletter_prefs: prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  } catch (e) {
    console.error("saveUserPreferences error:", e.message);
  }
}

/**
 * Look up brand guidelines for a company name.
 * Returns the full colour palette + typography for newsletter theming.
 */
export async function lookupBrandGuidelines(companyName) {
  if (!companyName) return null;
  try {
    const { data, error } = await supabase
      .from("brand_guidelines")
      .select("*")
      .ilike("company_name", `%${companyName}%`)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Send newsletter email via edge function (placeholder).
 * Currently downloads HTML — email sending requires a backend email service.
 */
export async function sendNewsletterEmail({ to, subject, html }) {
  console.log("sendNewsletterEmail called — email delivery requires backend integration (e.g. Resend, SendGrid).");
  return { ok: false, message: "Email sending not yet configured. Use 'Download HTML' or 'Copy to clipboard' instead." };
}

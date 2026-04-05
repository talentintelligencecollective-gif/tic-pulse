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

// ═══════════════════════════════════════════════
//  NEWSLETTER & BRAND GUIDELINES
// ═══════════════════════════════════════════════

/**
 * Load user's saved newsletter preferences (company name, theme, sender name, etc.)
 */
export async function loadNewsletterPrefs(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_engagement")
      .select("newsletter_prefs")
      .eq("user_id", userId)
      .not("newsletter_prefs", "is", null)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.newsletter_prefs || null;
  } catch {
    return null;
  }
}

/**
 * Save user's newsletter preferences.
 * Upserts into user_engagement keyed on user_id + a sentinel article_id.
 */
export async function saveNewsletterPrefs(userId, prefs) {
  if (!userId) return;
  try {
    // Use a fixed sentinel article_id for newsletter prefs storage
    const PREFS_SENTINEL = "00000000-0000-0000-0000-000000000000";
    await supabase.from("user_engagement").upsert({
      user_id: userId,
      article_id: PREFS_SENTINEL,
      newsletter_prefs: prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,article_id" });
  } catch (e) {
    console.error("saveNewsletterPrefs error:", e.message);
  }
}

/**
 * Look up brand guidelines for a company name.
 * Returns the full colour palette + typography for newsletter theming.
 * Uses case-insensitive partial matching.
 */
export async function lookupBrandGuidelines(companyName) {
  if (!companyName || companyName.trim().length < 2) return null;
  try {
    const { data, error } = await supabase
      .from("brand_guidelines")
      .select("*")
      .ilike("company_name", `%${companyName.trim()}%`)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Save custom brand colours to the brand_guidelines table.
 * Creates a new row if the company doesn't exist, updates if it does.
 */
export async function saveBrandGuidelines({ companyName, colors }) {
  if (!companyName || !colors) return null;
  try {
    const existing = await lookupBrandGuidelines(companyName);
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("brand_guidelines")
        .update({
          color_primary: colors.accent,
          color_header_bg: colors.headerBg,
          color_body_bg: colors.bg,
          color_card_bg: colors.cardBg,
          color_text_primary: colors.textPrimary,
          color_text_secondary: colors.textSecondary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .maybeSingle();
      return data;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from("brand_guidelines")
        .insert({
          company_name: companyName.trim(),
          industry: "User-defined",
          color_primary: colors.accent,
          color_header_bg: colors.headerBg,
          color_body_bg: colors.bg,
          color_card_bg: colors.cardBg,
          color_text_primary: colors.textPrimary,
          color_text_secondary: colors.textSecondary || "#666666",
          source_confidence: "user",
          notes: "Added via TIC Pulse newsletter builder",
        })
        .select()
        .maybeSingle();
      return data;
    }
  } catch (e) {
    console.error("saveBrandGuidelines error:", e.message);
    return null;
  }
}

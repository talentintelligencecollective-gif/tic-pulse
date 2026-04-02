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

// ─── User Preferences ───

/**
 * Load user preferences for newsletter builder + brand colours.
 */
export async function loadUserPreferences(userId) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found (expected for new users)
    console.error("loadUserPreferences error:", error.message);
  }
  return data || null;
}

/**
 * Save user preferences (upsert).
 */
export async function saveUserPreferences(userId, prefs) {
  const { error } = await supabase.from("user_preferences").upsert({
    user_id: userId,
    ...prefs,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) {
    console.error("saveUserPreferences error:", error.message);
  }
}

// ─── Brand Guidelines ───

/**
 * Look up brand guidelines by company name (fuzzy match).
 * Strips common suffixes and does case-insensitive ILIKE.
 */
export async function lookupBrandGuidelines(companyName) {
  if (!companyName) return null;

  // Try exact match first
  const { data: exact } = await supabase
    .from("brand_guidelines")
    .select("*")
    .ilike("company_name", companyName)
    .limit(1);
  if (exact && exact.length > 0) return exact[0];

  // Try fuzzy: strip common suffixes
  const cleaned = companyName
    .replace(/\s*(Inc\.?|Ltd\.?|LLC|PLC|plc|Group|Co\.?|Corp\.?|Corporation|Limited|& Company|& Co\.?)\s*$/gi, "")
    .trim();
  if (cleaned !== companyName) {
    const { data: fuzzy } = await supabase
      .from("brand_guidelines")
      .select("*")
      .ilike("company_name", `%${cleaned}%`)
      .limit(1);
    if (fuzzy && fuzzy.length > 0) return fuzzy[0];
  }

  // Try first word (e.g. "Deloitte Digital" → "Deloitte")
  const firstWord = cleaned.split(/\s+/)[0];
  if (firstWord.length >= 3) {
    const { data: partial } = await supabase
      .from("brand_guidelines")
      .select("*")
      .ilike("company_name", `${firstWord}%`)
      .limit(1);
    if (partial && partial.length > 0) return partial[0];
  }

  return null;
}

// ─── Media Engagement ───

/**
 * Load all media engagement for a user (videos + episodes).
 */
export async function loadMediaEngagement(userId) {
  const { data, error } = await supabase
    .from("media_engagement")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("loadMediaEngagement error:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Upsert media engagement (progress, completed, saved_for_later).
 */
export async function upsertMediaEngagement(userId, mediaType, mediaId, updates) {
  const { error } = await supabase.from("media_engagement").upsert({
    user_id: userId,
    media_type: mediaType,
    media_id: mediaId,
    ...updates,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,media_type,media_id" });
  if (error) {
    console.error("upsertMediaEngagement error:", error.message);
  }
}

// ─── Source Submissions ───

/**
 * Submit a new source suggestion.
 */
export async function submitSourceSuggestion(userId, submission) {
  const { error } = await supabase.from("source_submissions").insert({
    submitted_by: userId,
    ...submission,
  });
  if (error) {
    console.error("submitSourceSuggestion error:", error.message);
    return false;
  }
  return true;
}

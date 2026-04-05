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
//  USER PROFILE
// ═══════════════════════════════════════════════

/**
 * Fetch the user's profile (company, job title, etc.) from the profiles table.
 */
export async function fetchUserProfile(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, company, job_title")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Update the user's profile and auth metadata.
 */
export async function updateUserProfile(userId, { fullName, company, jobTitle }) {
  if (!userId) return false;
  try {
    // Update profiles table
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        full_name: fullName,
        company,
        job_title: jobTitle,
      }, { onConflict: "id" });

    if (profileErr) {
      console.error("Profile update error:", profileErr.message);
      return false;
    }

    // Update auth metadata (for full_name used in comments etc.)
    const { error: authErr } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (authErr) {
      console.error("Auth metadata update error:", authErr.message);
    }

    return true;
  } catch (e) {
    console.error("updateUserProfile error:", e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════
//  INTERACTION TRACKING — for personalisation
// ═══════════════════════════════════════════════

/**
 * Log a user interaction for personalisation.
 * Called on like, bookmark, share, and article click.
 */
export async function trackInteraction(userId, articleId, type, article = {}) {
  if (!userId || !articleId) return;
  try {
    const { error } = await supabase.from("user_interactions").insert({
      user_id: userId,
      article_id: articleId,
      interaction_type: type,
      category: article.category || null,
      tags: article.tags || [],
      region: article.region || null,
    });
    // Ignore duplicate key errors (23505)
    if (error && error.code !== "23505") {
      console.error("trackInteraction error:", error.message);
    }
  } catch {}
}

/**
 * Fetch the current user's category affinities for personalisation.
 * Returns { "Automation": { total: 12, recent: 5 }, ... }
 */
export async function fetchUserAffinities(userId) {
  if (!userId) return {};
  try {
    const { data, error } = await supabase
      .from("user_affinities")
      .select("category, interaction_count, recent_count")
      .eq("user_id", userId);
    if (error || !data) return {};
    const affinities = {};
    for (const row of data) {
      affinities[row.category] = {
        total: row.interaction_count,
        recent: row.recent_count,
      };
    }
    return affinities;
  } catch {
    return {};
  }
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

// ═══════════════════════════════════════════════
//  USER STREAKS & BADGES
// ═══════════════════════════════════════════════

/**
 * Badge tier definitions.
 * Computed from streak length.
 */
export const STREAK_TIERS = [
  { min: 500, label: "Legend",         icon: "⭐", color: "#ffd700" },
  { min: 300, label: "Champion",       icon: "🏆", color: "#f59e0b" },
  { min: 100, label: "Centurion",      icon: "👑", color: "#a855f7" },
  { min:  50, label: "Dedicated",      icon: "💎", color: "#00b4d8" },
  { min:  10, label: "On Fire",        icon: "⚡", color: "#ff6b35" },
  { min:   3, label: "Warming Up",     icon: "🔥", color: "#00e5a0" },
  { min:   0, label: "New Member",     icon: "🌱", color: "#888888" },
];

export const ENGAGEMENT_BADGES = [
  { field: "total_comments",    min: 10, label: "Commenter",      icon: "💬" },
  { field: "total_likes",       min: 50, label: "Supporter",      icon: "❤️" },
  { field: "total_newsletters", min: 5,  label: "Curator",        icon: "📰" },
  { field: "total_shares",      min: 20, label: "Amplifier",      icon: "📡" },
  { field: "total_bookmarks",   min: 30, label: "Collector",      icon: "📚" },
];

/**
 * Get the streak tier for a given streak count.
 */
export function getStreakTier(streakCount) {
  for (const tier of STREAK_TIERS) {
    if (streakCount >= tier.min) return tier;
  }
  return STREAK_TIERS[STREAK_TIERS.length - 1];
}

/**
 * Get earned engagement badges from streak data.
 */
export function getEarnedBadges(streakData) {
  if (!streakData) return [];
  return ENGAGEMENT_BADGES.filter((b) => (streakData[b.field] || 0) >= b.min);
}

/**
 * Update the user's streak on app open.
 * Returns the full streak data including counters.
 */
export async function updateStreak(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.rpc("update_user_streak", {
      p_user_id: userId,
    });
    if (error) {
      console.error("updateStreak error:", error.message);
      return null;
    }
    return data?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Increment a streak engagement counter.
 * Call alongside existing engagement logic.
 */
export async function incrementStreakCounter(userId, field, delta = 1) {
  if (!userId) return;
  try {
    await supabase.rpc("increment_streak_counter", {
      p_user_id: userId,
      p_field: field,
      p_delta: delta,
    });
  } catch {}
}

/**
 * Fetch another user's streak data (for comment badges).
 */
export async function fetchUserStreak(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_streaks")
      .select("current_streak, longest_streak, total_active_days, total_likes, total_comments, total_shares, total_bookmarks, total_newsletters")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

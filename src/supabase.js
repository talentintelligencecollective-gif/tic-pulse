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

// ─── Streaks & Badges ───

const STREAK_TIERS = [
  { min: 500, label: "Legend",     icon: "⭐", color: "#ffd700" },
  { min: 300, label: "Champion",   icon: "🏆", color: "#f59e0b" },
  { min: 100, label: "Centurion",  icon: "👑", color: "#a855f7" },
  { min:  50, label: "Dedicated",  icon: "💎", color: "#00b4d8" },
  { min:  10, label: "On Fire",    icon: "⚡", color: "#ff6b35" },
  { min:   3, label: "Warming Up", icon: "🔥", color: "#00e5a0" },
  { min:   0, label: "New Member", icon: "🌱", color: "#888888" },
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
 * Fetch a user's streak data (for comment badges).
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

/**
 * Increment a streak engagement counter.
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

// ─── Streak Badges ───

const ENGAGEMENT_BADGES = [
  { field: "total_comments",    min: 10, label: "Commenter",  icon: "💬" },
  { field: "total_likes",       min: 50, label: "Supporter",  icon: "❤️" },
  { field: "total_newsletters", min: 5,  label: "Curator",    icon: "📰" },
  { field: "total_shares",      min: 20, label: "Amplifier",  icon: "📡" },
  { field: "total_bookmarks",   min: 30, label: "Collector",  icon: "📚" },
];

export function getEarnedBadges(streakData) {
  if (!streakData) return [];
  return ENGAGEMENT_BADGES.filter((b) => (streakData[b.field] || 0) >= b.min);
}

export async function updateStreak(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.rpc("update_user_streak", {
      p_user_id: userId,
    });
    if (error) { console.error("updateStreak error:", error.message); return null; }
    return data?.[0] || null;
  } catch { return null; }
}

// ─── Newsletter & Brand Guidelines ───

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
  } catch { return null; }
}

export async function saveUserPreferences(userId, prefs) {
  if (!userId) return;
  try {
    await supabase.from("user_engagement").upsert({
      user_id: userId,
      newsletter_prefs: prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  } catch (e) { console.error("saveUserPreferences error:", e.message); }
}

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
  } catch { return null; }
}

export async function saveBrandGuidelines(guidelines) {
  if (!guidelines?.company_name) return null;
  try {
    const { data, error } = await supabase
      .from("brand_guidelines")
      .upsert(guidelines, { onConflict: "company_name" })
      .select()
      .maybeSingle();
    if (error) { console.error("saveBrandGuidelines error:", error.message); return null; }
    return data;
  } catch (e) { console.error("saveBrandGuidelines error:", e.message); return null; }
}

export async function sendNewsletterEmail({ to, subject, html }) {
  console.log("sendNewsletterEmail — use Brevo function or Download HTML instead.");
  return { ok: false, message: "Use 'Download HTML' or 'Copy to clipboard' instead." };
}

// ─── User Profiles ───

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
  } catch { return null; }
}

export async function updateUserProfile(userId, { fullName, company, jobTitle }) {
  if (!userId) return false;
  try {
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, full_name: fullName, company, job_title: jobTitle }, { onConflict: "id" });
    if (profileErr) { console.error("Profile update error:", profileErr.message); return false; }
    const { error: authErr } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (authErr) console.error("Auth metadata update error:", authErr.message);
    return true;
  } catch (e) { console.error("updateUserProfile error:", e.message); return false; }
}

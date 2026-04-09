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

// ═══════════════════════════════════════════════
//  ARTICLE QUERIES
// ═══════════════════════════════════════════════

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
 * Fetch top categories by article count.
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
//  USER PROFILES
// ═══════════════════════════════════════════════

/**
 * Fetch a user's profile from the profiles table.
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
 * Update a user's profile (profiles table + auth metadata).
 */
export async function updateUserProfile(userId, { fullName, company, jobTitle }) {
  if (!userId) return false;
  try {
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
//  USER STREAKS & BADGES
// ═══════════════════════════════════════════════

const STREAK_TIERS = [
  { min: 500, label: "Legend",     icon: "⭐", color: "#ffd700" },
  { min: 300, label: "Champion",   icon: "🏆", color: "#f59e0b" },
  { min: 100, label: "Centurion",  icon: "👑", color: "#a855f7" },
  { min:  50, label: "Dedicated",  icon: "💎", color: "#00b4d8" },
  { min:  10, label: "On Fire",    icon: "⚡", color: "#ff6b35" },
  { min:   3, label: "Warming Up", icon: "🔥", color: "#00e5a0" },
  { min:   0, label: "New Member", icon: "🌱", color: "#888888" },
];

const ENGAGEMENT_BADGES = [
  { field: "total_likes",       min: 10,  icon: "❤️",  label: "Heart Giver" },
  { field: "total_likes",       min: 100, icon: "💖",  label: "Love Machine" },
  { field: "total_comments",    min: 5,   icon: "💬",  label: "Conversationalist" },
  { field: "total_comments",    min: 50,  icon: "🎤",  label: "Commentator" },
  { field: "total_shares",      min: 5,   icon: "📤",  label: "Sharer" },
  { field: "total_shares",      min: 50,  icon: "📡",  label: "Broadcaster" },
  { field: "total_bookmarks",   min: 10,  icon: "📚",  label: "Collector" },
  { field: "total_bookmarks",   min: 100, icon: "🏛️",  label: "Librarian" },
  { field: "total_newsletters", min: 1,   icon: "📰",  label: "Newsletter Maker" },
  { field: "total_newsletters", min: 10,  icon: "✍️",  label: "Editor in Chief" },
  { field: "total_active_days", min: 30,  icon: "📅",  label: "Monthly Regular" },
  { field: "total_active_days", min: 365, icon: "🎂",  label: "One Year Club" },
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

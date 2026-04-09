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
 * Fetch a user's profile (full_name, company, job_title).
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
 * Update a user's profile and auth metadata.
 * Returns true on success.
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

    // Keep auth metadata in sync so full_name is used in comments
    await supabase.auth.updateUser({ data: { full_name: fullName } });

    return true;
  } catch (e) {
    console.error("updateUserProfile error:", e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════
//  USER STREAKS & BADGES
// ═══════════════════════════════════════════════

export const STREAK_TIERS = [
  { min: 500, label: "Legend",     icon: "⭐", color: "#ffd700" },
  { min: 300, label: "Champion",   icon: "🏆", color: "#f59e0b" },
  { min: 100, label: "Centurion",  icon: "👑", color: "#a855f7" },
  { min:  50, label: "Dedicated",  icon: "💎", color: "#00b4d8" },
  { min:  10, label: "On Fire",    icon: "⚡", color: "#ff6b35" },
  { min:   3, label: "Warming Up", icon: "🔥", color: "#00e5a0" },
  { min:   0, label: "New Member", icon: "🌱", color: "#888888" },
];

export const ENGAGEMENT_BADGES = [
  { field: "total_comments",    min: 10, label: "Commenter",  icon: "💬" },
  { field: "total_likes",       min: 50, label: "Supporter",  icon: "❤️"  },
  { field: "total_newsletters", min: 5,  label: "Curator",    icon: "📰" },
  { field: "total_shares",      min: 20, label: "Amplifier",  icon: "📡" },
  { field: "total_bookmarks",   min: 30, label: "Collector",  icon: "📚" },
];

/**
 * Get the streak tier object for a given streak count.
 */
export function getStreakTier(streakCount) {
  for (const tier of STREAK_TIERS) {
    if ((streakCount || 0) >= tier.min) return tier;
  }
  return STREAK_TIERS[STREAK_TIERS.length - 1];
}

/**
 * Get earned engagement badges from a streak data row.
 */
export function getEarnedBadges(streakData) {
  if (!streakData) return [];
  return ENGAGEMENT_BADGES.filter((b) => (streakData[b.field] || 0) >= b.min);
}

/**
 * Call on app open — updates the streak server-side and returns the row.
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
 * Increment an engagement counter on the streak row.
 * field: total_likes | total_comments | total_shares | total_bookmarks | total_newsletters
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
 * Fetch another user's streak data (used for comment badges).
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

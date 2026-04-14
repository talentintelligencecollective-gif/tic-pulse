import { createClient } from "@supabase/supabase-js";
import { parseClientEnv } from "./env/clientEnv";
import { DEFAULT_FEED_LIMIT } from "./constants/feed";
import { parseArticleRows, type Article } from "./schemas/article";
import { z } from "zod";

const env = parseClientEnv(import.meta.env);
const supabaseUrl = env?.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = env?.VITE_SUPABASE_ANON_KEY ?? "";

if (!env) {
  console.error(
    "Missing or invalid Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface UserStreakSnapshot {
  current_streak?: number | null;
  longest_streak?: number | null;
  total_active_days?: number | null;
  total_likes?: number | null;
  total_comments?: number | null;
  total_shares?: number | null;
  total_bookmarks?: number | null;
  total_newsletters?: number | null;
}

const CategoryCountRowSchema = z.object({
  category: z.string(),
  count: z.coerce.number(),
});

export interface FetchArticlesOptions {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch articles from the articles_feed view or balanced RPC.
 */
export async function fetchArticles(
  options: FetchArticlesOptions = {}
): Promise<Article[]> {
  const {
    category,
    search,
    limit = DEFAULT_FEED_LIMIT,
    offset = 0,
  } = options;

  if (!category || category === "All") {
    const { data, error } = await supabase.rpc("fetch_balanced_feed", {
      feed_limit: limit,
    });
    if (error) {
      console.error("fetchArticles balanced error:", error.message);
      return [];
    }
    return parseArticleRows(data);
  }

  let query = supabase
    .from("articles_feed")
    .select("*")
    .eq("category", category)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`title.ilike.%${search}%,tldr.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchArticles error:", error.message);
    return [];
  }
  return parseArticleRows(data);
}

export async function incrementEngagement(
  articleId: string,
  field: "like_count" | "comment_count" | "share_count" | "view_count",
  delta = 1
): Promise<void> {
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
 * Category counts via RPC (avoids scanning entire feed client-side).
 */
export async function fetchCategoryCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("article_category_counts");
  if (error) {
    console.error({ event: "CATEGORY_COUNTS_RPC_FAILED", message: error.message });
    return {};
  }
  const parsed = z.array(CategoryCountRowSchema).safeParse(data);
  if (!parsed.success) {
    console.error({
      event: "CATEGORY_COUNTS_INVALID",
      issues: parsed.error.flatten(),
    });
    return {};
  }
  const counts: Record<string, number> = {};
  for (const row of parsed.data) {
    if (row.category) counts[row.category] = row.count;
  }
  return counts;
}

export async function fetchUserProfile(
  userId: string | undefined
): Promise<{ full_name: string | null; company: string | null; job_title: string | null } | null> {
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

export async function updateUserProfile(
  userId: string,
  {
    fullName,
    company,
    jobTitle,
  }: { fullName: string; company: string; jobTitle: string }
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { error: profileErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        company,
        job_title: jobTitle,
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      console.error("Profile update error:", profileErr.message);
      return false;
    }

    const { error: authErr } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (authErr) {
      console.error("Auth metadata update error:", authErr.message);
    }

    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("updateUserProfile error:", msg);
    return false;
  }
}

const STREAK_TIERS = [
  { min: 500, label: "Legend", icon: "\u2B50", color: "#ffd700" },
  { min: 300, label: "Champion", icon: "\uD83C\uDFC6", color: "#f59e0b" },
  { min: 100, label: "Centurion", icon: "\uD83D\uDC51", color: "#a855f7" },
  { min: 50, label: "Dedicated", icon: "\uD83D\uDC8E", color: "#00b4d8" },
  { min: 10, label: "On Fire", icon: "\u26A1", color: "#ff6b35" },
  { min: 3, label: "Warming Up", icon: "\uD83D\uDD25", color: "#00e5a0" },
  { min: 0, label: "New Member", icon: "\uD83C\uDF31", color: "#888888" },
] as const;

const ENGAGEMENT_BADGES = [
  { field: "total_likes" as const, min: 10, icon: "\u2764\uFE0F", label: "Heart Giver" },
  { field: "total_likes" as const, min: 100, icon: "\uD83D\uDC96", label: "Love Machine" },
  { field: "total_comments" as const, min: 5, icon: "\uD83D\uDCAC", label: "Conversationalist" },
  { field: "total_comments" as const, min: 50, icon: "\uD83C\uDFA4", label: "Commentator" },
  { field: "total_shares" as const, min: 5, icon: "\uD83D\uDCE4", label: "Sharer" },
  { field: "total_shares" as const, min: 50, icon: "\uD83D\uDCE1", label: "Broadcaster" },
  { field: "total_bookmarks" as const, min: 10, icon: "\uD83D\uDCDA", label: "Collector" },
  { field: "total_bookmarks" as const, min: 100, icon: "\uD83C\uDFDB\uFE0F", label: "Librarian" },
  { field: "total_newsletters" as const, min: 1, icon: "\uD83D\uDCF0", label: "Newsletter Maker" },
  { field: "total_newsletters" as const, min: 10, icon: "\u270D\uFE0F", label: "Editor in Chief" },
  { field: "total_active_days" as const, min: 30, icon: "\uD83D\uDCC5", label: "Monthly Regular" },
  { field: "total_active_days" as const, min: 365, icon: "\uD83C\uDF82", label: "One Year Club" },
];

export function getStreakTier(streakCount: number) {
  for (const tier of STREAK_TIERS) {
    if (streakCount >= tier.min) return tier;
  }
  return STREAK_TIERS[STREAK_TIERS.length - 1];
}

export function getEarnedBadges(streakData: UserStreakSnapshot | null) {
  if (!streakData) return [];
  return ENGAGEMENT_BADGES.filter(
    (b) => (streakData[b.field] ?? 0) >= b.min
  );
}

export async function updateStreak(
  userId: string
): Promise<UserStreakSnapshot | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.rpc("update_user_streak", {
      p_user_id: userId,
    });
    if (error) {
      console.error("updateStreak error:", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    return (row as UserStreakSnapshot) ?? null;
  } catch {
    return null;
  }
}

export async function incrementStreakCounter(
  userId: string,
  field:
    | "total_likes"
    | "total_comments"
    | "total_shares"
    | "total_bookmarks"
    | "total_newsletters",
  delta = 1
): Promise<void> {
  if (!userId) return;
  try {
    await supabase.rpc("increment_streak_counter", {
      p_user_id: userId,
      p_field: field,
      p_delta: delta,
    });
  } catch {
    /* ignore */
  }
}

export async function fetchUserStreak(
  userId: string
): Promise<UserStreakSnapshot | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_streaks")
      .select(
        "current_streak, longest_streak, total_active_days, total_likes, total_comments, total_shares, total_bookmarks, total_newsletters"
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data as UserStreakSnapshot;
  } catch {
    return null;
  }
}

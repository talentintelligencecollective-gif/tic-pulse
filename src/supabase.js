import { createClient } from "@supabase/supabase-js";

// ─── Client Setup ───

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

// ─── Article Queries ───

export async function fetchArticles({ category, search, limit = 30, offset = 0 } = {}) {
  let query = supabase.from("articles_feed").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (category && category !== "All") query = query.eq("category", category);
  if (search) query = query.or(`title.ilike.%${search}%,tldr.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) { console.error("fetchArticles error:", error.message); return []; }
  return data || [];
}

export async function incrementEngagement(articleId, field, delta = 1) {
  const { error } = await supabase.rpc("increment_engagement", { p_article_id: articleId, p_field: field, p_delta: delta });
  if (error) console.error(`incrementEngagement error (${field}):`, error.message);
}

export async function fetchCategoryCounts() {
  const { data, error } = await supabase.from("articles_feed").select("category");
  if (error || !data) return {};
  const counts = {};
  for (const row of data) counts[row.category] = (counts[row.category] || 0) + 1;
  return counts;
}

// ─── Article Read Tracking ───

/**
 * Load all read article IDs for a user.
 * @returns {Set<string>} Set of article IDs that have been read
 */
export async function loadArticleReads(userId) {
  const { data, error } = await supabase
    .from("article_reads")
    .select("article_id")
    .eq("user_id", userId);
  if (error) { console.error("loadArticleReads error:", error.message); return new Set(); }
  return new Set((data || []).map((r) => r.article_id));
}

/**
 * Mark an article as read (idempotent — upserts).
 */
export async function markArticleRead(userId, articleId) {
  const { error } = await supabase
    .from("article_reads")
    .upsert({ user_id: userId, article_id: articleId }, { onConflict: "user_id,article_id" });
  if (error) console.error("markArticleRead error:", error.message);
}

// ─── User Preferences ───

export async function loadUserPreferences(userId) {
  const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", userId).single();
  if (error && error.code !== "PGRST116") console.error("loadUserPreferences error:", error.message);
  return data || null;
}

export async function saveUserPreferences(userId, prefs) {
  const { error } = await supabase.from("user_preferences").upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("saveUserPreferences error:", error.message);
}

// ─── Brand Guidelines ───

export async function lookupBrandGuidelines(companyName) {
  if (!companyName) return null;
  const { data: exact } = await supabase.from("brand_guidelines").select("*").ilike("company_name", companyName).limit(1);
  if (exact && exact.length > 0) return exact[0];
  const cleaned = companyName.replace(/\s*(Inc\.?|Ltd\.?|LLC|PLC|plc|Group|Co\.?|Corp\.?|Corporation|Limited|& Company|& Co\.?)\s*$/gi, "").trim();
  if (cleaned !== companyName) {
    const { data: fuzzy } = await supabase.from("brand_guidelines").select("*").ilike("company_name", `%${cleaned}%`).limit(1);
    if (fuzzy && fuzzy.length > 0) return fuzzy[0];
  }
  const firstWord = cleaned.split(/\s+/)[0];
  if (firstWord.length >= 3) {
    const { data: partial } = await supabase.from("brand_guidelines").select("*").ilike("company_name", `${firstWord}%`).limit(1);
    if (partial && partial.length > 0) return partial[0];
  }
  return null;
}

// ─── Media Engagement ───

export async function loadMediaEngagement(userId) {
  const { data, error } = await supabase.from("media_engagement").select("*").eq("user_id", userId);
  if (error) { console.error("loadMediaEngagement error:", error.message); return []; }
  return data || [];
}

export async function upsertMediaEngagement(userId, mediaType, mediaId, updates) {
  const { error } = await supabase.from("media_engagement").upsert({ user_id: userId, media_type: mediaType, media_id: mediaId, ...updates, updated_at: new Date().toISOString() }, { onConflict: "user_id,media_type,media_id" });
  if (error) console.error("upsertMediaEngagement error:", error.message);
}

// ─── Source Submissions ───

export async function submitSourceSuggestion(userId, submission) {
  const { error } = await supabase.from("source_submissions").insert({ submitted_by: userId, ...submission });
  if (error) { console.error("submitSourceSuggestion error:", error.message); return false; }
  return true;
}

// ─── Send Newsletter via Brevo ───

export async function sendNewsletterEmail({ to, subject, htmlContent, senderName }) {
  const session = await supabase.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch("/.netlify/functions/send-newsletter", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ to, subject, htmlContent, senderName }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to send");
  return data;
}

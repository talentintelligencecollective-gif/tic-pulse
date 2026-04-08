// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — User Profile Generator
//  On-demand Netlify Function
//  Called: on first login (if no profile exists)
//          on profile save from Settings screen
//  Uses Claude Haiku to infer industry, function, seniority,
//  feed topics, company keywords, and competitor keywords from
//  the user's registered company + job title.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const VALID_INDUSTRIES = [
  "tech", "finance", "healthcare", "retail", "fmcg",
  "consulting", "government", "professional_services", "energy", "media",
];

const VALID_FUNCTIONS = [
  "talent_acquisition", "people_analytics", "hr_ops",
  "learning_dev", "compensation", "executive",
];

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ─── Fetch the user's registration profile ───
async function getUserRegistrationData(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("company, job_title, full_name, email")
    .eq("id", userId)
    .single();

  if (error) throw new Error(`Could not fetch user profile: ${error.message}`);
  return data;
}

// ─── Generate intelligence profile via Claude Haiku ───
async function generateProfileWithClaude(company, jobTitle) {
  if (!ANTHROPIC_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

  // If we don't have enough data, return a minimal profile rather than wasting an API call
  if (!company && !jobTitle) {
    return buildFallbackProfile(company, jobTitle);
  }

  const prompt = `You are a talent intelligence analyst. Given a professional's company and job title, derive their professional context for personalising a news feed about talent, HR, and workforce topics.

Company: ${company || "Unknown"}
Job Title: ${jobTitle || "Unknown"}

Respond ONLY with valid JSON (no markdown, no preamble):
{
  "industry": "one value from: ${VALID_INDUSTRIES.join(", ")}",
  "function": "one value from: ${VALID_FUNCTIONS.join(", ")}",
  "seniority": "one value from: strategic, operational",
  "feed_topics": ["2-4 specific topic strings this person would care about most, e.g. skills_based_hiring, ai_in_recruiting, workforce_planning"],
  "company_keywords": ["2-4 keywords/phrases to detect articles mentioning their company — include short name, full name, stock ticker if relevant"],
  "competitor_keywords": ["3-5 direct competitors of their company that they would want to track"]
}

Guidelines:
- seniority: use 'strategic' for Head/VP/Director/Chief/C-suite, 'operational' for Manager/Specialist/Analyst/Coordinator
- company_keywords: think about how their company would appear in news headlines
- competitor_keywords: focus on direct business competitors, not just industry peers
- feed_topics: use snake_case, be specific rather than generic (e.g. 'skills_based_hiring' not 'hiring')`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty Claude response");

  const result = JSON.parse(text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());

  // Validate and sanitise
  if (!VALID_INDUSTRIES.includes(result.industry)) result.industry = "tech";
  if (!VALID_FUNCTIONS.includes(result.function)) result.function = "talent_acquisition";
  if (!["strategic", "operational"].includes(result.seniority)) result.seniority = "operational";
  if (!Array.isArray(result.feed_topics)) result.feed_topics = [];
  if (!Array.isArray(result.company_keywords)) result.company_keywords = company ? [company] : [];
  if (!Array.isArray(result.competitor_keywords)) result.competitor_keywords = [];

  result.feed_topics = result.feed_topics.slice(0, 5);
  result.company_keywords = result.company_keywords.slice(0, 5);
  result.competitor_keywords = result.competitor_keywords.slice(0, 6);

  return result;
}

// ─── Keyword-based fallback if we have very little data ───
function buildFallbackProfile(company, jobTitle) {
  const jl = (jobTitle || "").toLowerCase();
  const seniority = /head|vp|vice|director|chief|cpo|chro|president|partner/.test(jl)
    ? "strategic" : "operational";
  const fn = /analyt|data|insight/.test(jl) ? "people_analytics"
    : /learn|develop|l&d|train/.test(jl) ? "learning_dev"
    : /compen|reward|pay|total/.test(jl) ? "compensation"
    : "talent_acquisition";

  return {
    industry: "tech",
    function: fn,
    seniority,
    feed_topics: ["talent_intelligence", "ai_in_recruiting", "workforce_planning"],
    company_keywords: company ? [company] : [],
    competitor_keywords: [],
  };
}

// ─── Main handler ───
export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { userId, force = false } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), { status: 400 });
    }

    const supabase = getSupabase();

    // ── Check if profile already exists (skip unless force=true) ──
    if (!force) {
      const { data: existing } = await supabase
        .from("user_profiles")
        .select("id, generated_at, industry, function, seniority, feed_topics, company_keywords, competitor_keywords, profile_source")
        .eq("user_id", userId)
        .single();

      if (existing) {
        // Check staleness — regenerate silently if older than 90 days
        const ageInDays = (Date.now() - new Date(existing.generated_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays < 90) {
          console.log(`[profile] Returning existing profile for ${userId} (${Math.round(ageInDays)}d old)`);
          return new Response(JSON.stringify({ success: true, profile: existing, source: "cached" }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        console.log(`[profile] Profile is ${Math.round(ageInDays)}d old — regenerating`);
      }
    }

    // ── Fetch registration data ──
    const userData = await getUserRegistrationData(supabase, userId);
    const { company, job_title: jobTitle } = userData;

    console.log(`[profile] Generating profile for ${userId}: "${company}" / "${jobTitle}"`);

    // ── Generate via Claude ──
    const profile = await generateProfileWithClaude(company, jobTitle);

    // ── Determine source label ──
    const profileSource = force ? "user_corrected" : "auto_generated";

    // ── Upsert into user_profiles ──
    const { data: saved, error: saveError } = await supabase
      .from("user_profiles")
      .upsert({
        user_id: userId,
        company: company || null,
        industry: profile.industry,
        function: profile.function,
        seniority: profile.seniority,
        feed_topics: profile.feed_topics,
        company_keywords: profile.company_keywords,
        competitor_keywords: profile.competitor_keywords,
        profile_source: profileSource,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (saveError) throw new Error(`Failed to save profile: ${saveError.message}`);

    console.log(`[profile] Profile saved for ${userId}: ${profile.industry} / ${profile.function} / ${profile.seniority}`);

    return new Response(
      JSON.stringify({ success: true, profile: saved, source: profileSource }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );

  } catch (err) {
    console.error("[profile] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}

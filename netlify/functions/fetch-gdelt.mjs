// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — GDELT Fetch + Summarise Pipeline
//  Netlify Scheduled Function (runs every 30 minutes)
//
//  Flow:
//  1. Query GDELT DOC 2.0 API for talent/HR news
//  2. Deduplicate against existing articles in Supabase
//  3. Store new articles
//  4. Summarise unsummarised articles via Claude API
//  5. Update articles with TL;DR, category, and tags
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

// ─── Config ───

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_TIMESPAN = process.env.GDELT_TIMESPAN || "30min";
const GDELT_FETCH_LIMIT = parseInt(process.env.GDELT_FETCH_LIMIT || "50", 10);
const SUMMARISE_BATCH_SIZE = 10; // max articles to summarise per run

// Keyword groups for GDELT queries — broad enough for coverage,
// specific enough to avoid noise. GDELT uses OR within quotes,
// AND between terms.
const GDELT_QUERIES = [
  '"talent acquisition" OR "talent strategy" OR "talent intelligence"',
  '"workforce planning" OR "strategic workforce" OR "headcount planning"',
  '"skills gap" OR "reskilling" OR "upskilling" OR "skills taxonomy"',
  '"CHRO" OR "chief people officer" OR "chief human resources"',
  '"pay transparency" OR "compensation strategy" OR "salary disclosure"',
  '"future of work" OR "agentic AI workforce" OR "automation jobs"',
  '"labour market" OR "labor market" OR "employment trends"',
  '"employer branding" OR "employee experience" OR "talent mobility"',
];

// Valid categories for classification
const VALID_CATEGORIES = [
  "Talent Strategy",
  "Labour Market",
  "Automation",
  "Executive Moves",
  "Compensation",
  "Workforce Planning",
  "Skills",
  "DEI",
];

// ─── Supabase Client (service role — bypasses RLS) ───

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ─── GDELT Fetch ───

async function fetchGdeltArticles() {
  const allArticles = [];
  const seenUrls = new Set();

  for (const query of GDELT_QUERIES) {
    try {
      const params = new URLSearchParams({
        query: `${query} sourcelang:eng`,
        mode: "ArtList",
        maxrecords: String(Math.ceil(GDELT_FETCH_LIMIT / GDELT_QUERIES.length)),
        format: "json",
        sort: "DateDesc",
        timespan: GDELT_TIMESPAN,
      });

      const response = await fetch(`${GDELT_API}?${params}`, {
        headers: { "User-Agent": "TIC-Pulse/1.0" },
        signal: AbortSignal.timeout(15000), // 15s timeout per query
      });

      if (!response.ok) {
        console.warn(`GDELT query failed (${response.status}): ${query.slice(0, 50)}...`);
        continue;
      }

      const data = await response.json();

      if (!data.articles || !Array.isArray(data.articles)) {
        console.warn(`GDELT returned no articles for: ${query.slice(0, 50)}...`);
        continue;
      }

      for (const article of data.articles) {
        // Skip duplicates within this batch
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);

        allArticles.push({
          gdelt_url: article.url,
          title: cleanTitle(article.title),
          source_name: extractSourceName(article.domain),
          source_domain: article.domain,
          image_url: article.socialimage || null,
          gdelt_tone: parseTone(article.tone),
          language: article.language || "English",
          published_at: parseGdeltDate(article.seendate),
        });
      }
    } catch (err) {
      // Log but don't fail the entire run for one bad query
      console.error(`GDELT fetch error for query "${query.slice(0, 40)}...":`, err.message);
    }
  }

  console.log(`Fetched ${allArticles.length} articles from GDELT`);
  return allArticles;
}

// ─── Dedup & Store ───

async function storeNewArticles(supabase, articles) {
  if (articles.length === 0) return 0;

  // Get existing URLs in one query
  const urls = articles.map((a) => a.gdelt_url);
  const { data: existing, error: lookupErr } = await supabase
    .from("articles")
    .select("gdelt_url")
    .in("gdelt_url", urls);

  if (lookupErr) {
    console.error("Supabase lookup error:", lookupErr.message);
    return 0;
  }

  const existingUrls = new Set((existing || []).map((r) => r.gdelt_url));
  const newArticles = articles.filter((a) => !existingUrls.has(a.gdelt_url));

  if (newArticles.length === 0) {
    console.log("No new articles to store");
    return 0;
  }

  // Insert in batches of 20 to avoid payload limits
  let inserted = 0;
  for (let i = 0; i < newArticles.length; i += 20) {
    const batch = newArticles.slice(i, i + 20);
    const { error: insertErr } = await supabase.from("articles").insert(batch);

    if (insertErr) {
      console.error(`Insert batch error (${i}-${i + batch.length}):`, insertErr.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Stored ${inserted} new articles`);
  return inserted;
}

// ─── Claude Summarisation ───

async function summariseArticles(supabase) {
  if (!ANTHROPIC_KEY) {
    console.warn("No ANTHROPIC_API_KEY — skipping summarisation");
    return 0;
  }

  // Fetch unsummarised articles (oldest first, so they get processed in order)
  const { data: unsummarised, error: fetchErr } = await supabase
    .from("articles")
    .select("id, title, source_name, source_domain, gdelt_url, gdelt_tone")
    .eq("summarised", false)
    .order("created_at", { ascending: true })
    .limit(SUMMARISE_BATCH_SIZE);

  if (fetchErr) {
    console.error("Fetch unsummarised error:", fetchErr.message);
    return 0;
  }

  if (!unsummarised || unsummarised.length === 0) {
    console.log("No articles to summarise");
    return 0;
  }

  console.log(`Summarising ${unsummarised.length} articles...`);
  let summarised = 0;

  for (const article of unsummarised) {
    try {
      // Try to extract a description from the article's page
      const pageContext = await fetchArticleContext(article.gdelt_url);

      const result = await callClaude(article, pageContext);

      if (result) {
        const { error: updateErr } = await supabase
          .from("articles")
          .update({
            tldr: result.tldr,
            category: result.category,
            tags: result.tags,
            read_time_min: result.readTime,
            summarised: true,
          })
          .eq("id", article.id);

        if (updateErr) {
          console.error(`Update error for ${article.id}:`, updateErr.message);
        } else {
          // Create engagement row
          await supabase
            .from("article_engagement")
            .insert({ article_id: article.id })
            .select()
            // Ignore conflict if already exists
            .maybeSingle();

          summarised++;
        }
      }
    } catch (err) {
      console.error(`Summarise error for "${article.title.slice(0, 50)}":`, err.message);
      // Mark as summarised with a fallback to prevent retrying broken articles forever
      await supabase
        .from("articles")
        .update({
          tldr: `${article.title}. From ${article.source_name || article.source_domain}.`,
          category: classifyByKeyword(article.title),
          tags: extractHashtags(article.title),
          summarised: true,
        })
        .eq("id", article.id);
    }
  }

  console.log(`Summarised ${summarised}/${unsummarised.length} articles`);
  return summarised;
}

// ─── Article Context Extraction ───

async function fetchArticleContext(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TIC-Pulse/1.0; +https://tic-pulse.netlify.app)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract meta description and og:description
    const ogDesc = extractMeta(html, 'property="og:description"') ||
                   extractMeta(html, 'name="description"') ||
                   extractMeta(html, 'name="twitter:description"');

    // Extract first few paragraphs of article body
    const bodyText = extractBodyText(html);

    return [ogDesc, bodyText].filter(Boolean).join("\n\n").slice(0, 2000);
  } catch {
    return null;
  }
}

function extractMeta(html, attr) {
  // Match both content="..." and content='...' patterns
  const pattern = new RegExp(`<meta\\s+[^>]*${attr}[^>]*content=["']([^"']{10,500})["']`, "i");
  const altPattern = new RegExp(`<meta\\s+[^>]*content=["']([^"']{10,500})["'][^>]*${attr}`, "i");
  const match = html.match(pattern) || html.match(altPattern);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractBodyText(html) {
  // Strip scripts, styles, and nav elements
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  // Extract paragraph content
  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(text)) !== null && paragraphs.length < 5) {
    const clean = match[1].replace(/<[^>]+>/g, "").trim();
    if (clean.length > 40) {
      paragraphs.push(clean);
    }
  }

  return paragraphs.join(" ").slice(0, 1500) || null;
}

// ─── Claude API Call ───

async function callClaude(article, pageContext) {
  const contextBlock = pageContext
    ? `\n\nArticle context extracted from the page:\n${pageContext}`
    : "";

  const prompt = `You are a talent intelligence analyst. Analyse this news article and provide a structured summary.

Article headline: ${article.title}
Source: ${article.source_name || article.source_domain}
GDELT tone score: ${article.gdelt_tone ?? "unknown"} (negative = critical, positive = optimistic)${contextBlock}

Respond with ONLY valid JSON (no markdown fences, no preamble):
{
  "tldr": "A 2-3 sentence TL;DR summary for talent intelligence professionals. Be specific with numbers and findings where available. Write in British English.",
  "category": "One of: ${VALID_CATEGORIES.join(", ")}",
  "tags": ["#Tag1", "#Tag2", "#Tag3"],
  "readTime": 4
}

Rules:
- The TL;DR should be genuinely informative, not a restatement of the headline
- If you lack article context, infer a reasonable summary from the headline and source credibility
- Tags should be relevant hashtags a talent intelligence professional would search for
- readTime should be an integer estimate in minutes (2-10)
- Category MUST be exactly one of the listed options`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "unknown");
    throw new Error(`Claude API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) throw new Error("Empty Claude response");

  // Parse JSON response — strip any accidental markdown fencing
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const result = JSON.parse(cleaned);

  // Validate the response structure
  if (!result.tldr || typeof result.tldr !== "string") {
    throw new Error("Invalid tldr in Claude response");
  }

  // Validate category
  if (!VALID_CATEGORIES.includes(result.category)) {
    result.category = classifyByKeyword(article.title);
  }

  // Validate tags
  if (!Array.isArray(result.tags)) {
    result.tags = extractHashtags(article.title);
  } else {
    // Ensure tags are properly formatted
    result.tags = result.tags
      .slice(0, 5)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
  }

  // Validate readTime
  result.readTime = Math.min(10, Math.max(2, parseInt(result.readTime, 10) || 4));

  return result;
}

// ─── Utility Functions ───

function cleanTitle(title) {
  if (!title) return "Untitled";
  return decodeHtmlEntities(title)
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—|]\s*$/, "") // Remove trailing source attributions
    .trim();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractSourceName(domain) {
  if (!domain) return null;

  // Map common domains to readable names
  const domainMap = {
    "ft.com": "Financial Times",
    "hbr.org": "Harvard Business Review",
    "bloomberg.com": "Bloomberg",
    "reuters.com": "Reuters",
    "economist.com": "The Economist",
    "wsj.com": "Wall Street Journal",
    "nytimes.com": "New York Times",
    "bbc.co.uk": "BBC",
    "bbc.com": "BBC",
    "theguardian.com": "The Guardian",
    "forbes.com": "Forbes",
    "cnbc.com": "CNBC",
    "techcrunch.com": "TechCrunch",
    "wired.com": "Wired",
    "technologyreview.com": "MIT Technology Review",
    "shrm.org": "SHRM",
    "peoplemanagement.co.uk": "People Management",
    "linkedin.com": "LinkedIn",
    "mckinsey.com": "McKinsey",
    "bcg.com": "BCG",
    "deloitte.com": "Deloitte",
    "pwc.com": "PwC",
  };

  const clean = domain.replace(/^www\./, "");
  if (domainMap[clean]) return domainMap[clean];

  // Capitalise the domain name as a fallback
  return clean
    .replace(/\.[a-z]+$/, "")
    .split(/[.-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseTone(toneStr) {
  if (toneStr === undefined || toneStr === null) return null;
  // GDELT tone can be a comma-separated string: "overall,pos,neg,polarity,..."
  const parts = String(toneStr).split(",");
  const val = parseFloat(parts[0]);
  return isNaN(val) ? null : Math.round(val * 100) / 100;
}

function parseGdeltDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  // GDELT dates are YYYYMMDDHHMMSS format
  try {
    if (/^\d{14}$/.test(dateStr)) {
      const iso = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(8, 10)}:${dateStr.slice(10, 12)}:${dateStr.slice(12, 14)}Z`;
      return new Date(iso).toISOString();
    }
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function classifyByKeyword(title) {
  const lower = (title || "").toLowerCase();
  const rules = [
    [["chro", "chief people", "chief human", "executive appoint", "ceo", "c-suite"], "Executive Moves"],
    [["pay transpar", "compensation", "salary", "wage", "benefits", "remuneration"], "Compensation"],
    [["automat", "agentic", "robot", "ai replac", "future of work", "ai workforce"], "Automation"],
    [["skill", "reskill", "upskill", "taxonomy", "credential"], "Skills"],
    [["diversity", "inclusion", "equity", "dei", "belonging"], "DEI"],
    [["workforce plan", "headcount", "strategic workforce", "capacity plan"], "Workforce Planning"],
    [["labour market", "labor market", "unemploy", "job market", "vacancy", "employment"], "Labour Market"],
    [["talent", "recruit", "hiring", "candidate", "employer brand"], "Talent Strategy"],
  ];

  for (const [keywords, category] of rules) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "Talent Strategy"; // default
}

function extractHashtags(title) {
  const lower = (title || "").toLowerCase();
  const tagMap = {
    ai: "#AI", "artificial intelligence": "#AI",
    talent: "#TalentStrategy", recruit: "#Recruitment",
    skill: "#Skills", chro: "#CHRO",
    automat: "#Automation", workforce: "#Workforce",
    salary: "#Compensation", pay: "#PayTransparency",
    divers: "#DEI", inclusion: "#Inclusion",
    remote: "#RemoteWork", hybrid: "#HybridWork",
  };

  const tags = [];
  for (const [keyword, tag] of Object.entries(tagMap)) {
    if (lower.includes(keyword) && !tags.includes(tag)) {
      tags.push(tag);
    }
    if (tags.length >= 3) break;
  }
  return tags.length > 0 ? tags : ["#TalentIntelligence"];
}

// ─── Main Handler ───

export default async function handler(req) {
  const startTime = Date.now();
  console.log("═══ TIC Pulse: GDELT Fetch Started ═══");

  try {
    const supabase = getSupabase();

    // Step 1: Fetch from GDELT
    const articles = await fetchGdeltArticles();

    // Step 2: Deduplicate & store
    const stored = await storeNewArticles(supabase, articles);

    // Step 3: Summarise unsummarised articles
    const summarised = await summariseArticles(supabase);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`═══ Complete: ${stored} stored, ${summarised} summarised in ${elapsed}s ═══`);

    return new Response(
      JSON.stringify({
        ok: true,
        fetched: articles.length,
        stored,
        summarised,
        elapsed: `${elapsed}s`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Pipeline error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Netlify scheduled function config
export const config = {
  schedule: "*/30 * * * *",
};

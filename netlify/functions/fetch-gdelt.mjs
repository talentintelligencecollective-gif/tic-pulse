// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — News Fetch + Summarise Pipeline (v3.2)
//  Drip-feed: runs every 5 minutes, fetches 3 RSS feeds
//  and summarises 5 articles per run.
//  v3.2: REBALANCED queries + CATEGORY-DIVERSE summarisation.
//  ~45 queries × 9 geographies = global coverage.
//  Netlify Scheduled Function — stays well under 60s timeout.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUMMARISE_BATCH_SIZE = 5;
const INGEST_CAP = 15;

// ═══════════════════════════════════════════════
//  QUERIES — ~45, BALANCED across categories
//  Target: no single category > 20% of queries
// ═══════════════════════════════════════════════

const NEWS_QUERIES = [
  // ── Talent strategy & acquisition (10 queries) ──
  "talent acquisition strategy",
  "talent intelligence analytics",
  "talent management strategy",
  "talent mobility internal hiring",
  "employer branding talent attraction",
  "recruitment technology hiring",
  "candidate experience recruiting",
  "talent marketplace internal",
  "employee experience retention",
  "competitor intelligence talent",
  // ── Workforce planning & strategy (7 queries) ──
  "workforce planning strategy",
  "strategic workforce analytics",
  "workforce intelligence insights",
  "workforce transformation strategy",
  "headcount planning forecasting",
  "organisational design restructuring",
  "operating model transformation",
  // ── Skills (5 queries) ──
  "skills based hiring strategy",
  "skills gap reskilling upskilling",
  "skills taxonomy workforce",
  "skills intelligence analytics",
  "credentialing microcredentials workforce",
  // ── People analytics & HR tech (4 queries) ──
  "people analytics HR",
  "people intelligence workforce data",
  "HR technology people analytics",
  "human capital analytics insights",
  // ── Executive & leadership moves (8 queries — consolidated) ──
  "CHRO appointed OR chief people officer OR chief talent officer",
  "CEO appointed OR CFO appointed OR CTO appointed OR CIO appointed",
  "COO appointed OR chief diversity officer OR chief learning officer",
  "VP talent OR VP people OR VP engineering OR VP product appointed",
  "head of talent OR head of people OR head of HR appointed",
  "general manager OR managing director appointed OR hired",
  "board director appointed OR executive hire OR leadership appointment",
  "executive resigns OR CEO departure OR steps down",
  // ── Compensation & pay (5 queries) ──
  "pay transparency compensation",
  "salary benchmarking compensation strategy",
  "executive compensation pay equity",
  "total rewards benefits strategy",
  "gender pay gap reporting",
  // ── Labour market & economics (5 queries) ──
  "labour market trends employment",
  "labor market unemployment jobs",
  "labour economics workforce shortage",
  "jobs report employment data",
  "labour strategy workforce economics",
  // ── Automation & AI (5 queries) ──
  "AI workforce automation",
  "agentic AI future of work",
  "generative AI workplace",
  "AI replacing jobs workforce impact",
  "automation hiring recruitment AI",
  // ── DEI (2 queries) ──
  "diversity equity inclusion workplace",
  "DEI strategy corporate",
  // ── Macro / business strategy (3 queries) ──
  "layoffs restructuring workforce",
  "hiring freeze OR recruitment freeze",
  "return to office hybrid work policy",
];

// ═══════════════════════════════════════════════
//  GEOGRAPHIES — 9 regions for global coverage
// ═══════════════════════════════════════════════

const CORE_GEOS = [
  { code: "US", hl: "en", gl: "US", ceid: "US:en" },
  { code: "GB", hl: "en", gl: "GB", ceid: "GB:en" },
  { code: "AU", hl: "en", gl: "AU", ceid: "AU:en" },
  { code: "IN", hl: "en", gl: "IN", ceid: "IN:en" },
  { code: "SG", hl: "en", gl: "SG", ceid: "SG:en" },
];
const SECONDARY_GEOS = [
  { code: "CA", hl: "en", gl: "CA", ceid: "CA:en" },
  { code: "DE", hl: "en", gl: "DE", ceid: "DE:en" },
  { code: "AE", hl: "en", gl: "AE", ceid: "AE:en" },
  { code: "ZA", hl: "en", gl: "ZA", ceid: "ZA:en" },
];
const ALL_GEOS = [...CORE_GEOS, ...SECONDARY_GEOS];

const VALID_CATEGORIES = [
  "Talent Strategy", "Labour Market", "Automation", "Executive Moves",
  "Compensation", "Workforce Planning", "Skills", "DEI",
];

const DOMAIN_MAP = {
  "ft.com": "Financial Times", "hbr.org": "Harvard Business Review",
  "bloomberg.com": "Bloomberg", "reuters.com": "Reuters",
  "economist.com": "The Economist", "wsj.com": "Wall Street Journal",
  "nytimes.com": "New York Times", "bbc.co.uk": "BBC", "bbc.com": "BBC",
  "theguardian.com": "The Guardian", "forbes.com": "Forbes", "cnbc.com": "CNBC",
  "techcrunch.com": "TechCrunch", "wired.com": "Wired",
  "technologyreview.com": "MIT Technology Review", "shrm.org": "SHRM",
  "peoplemanagement.co.uk": "People Management", "linkedin.com": "LinkedIn",
  "mckinsey.com": "McKinsey", "bcg.com": "BCG", "deloitte.com": "Deloitte",
  "kornferry.com": "Korn Ferry", "mercer.com": "Mercer",
  "heidrick.com": "Heidrick & Struggles", "spencerstuart.com": "Spencer Stuart",
  "gartner.com": "Gartner", "businessinsider.com": "Business Insider",
};

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ═══════════════════════════════════════════════
//  ROTATION — deterministic cycling through
//  (query, geo) pairs across runs
// ═══════════════════════════════════════════════

function getRunPairs(count) {
  const allPairs = [];
  for (const query of NEWS_QUERIES) {
    for (const geo of ALL_GEOS) {
      allPairs.push({ query, geo });
    }
  }
  // Deterministic rotation based on 5-minute windows
  const runIndex = Math.floor(Date.now() / (5 * 60 * 1000)) % allPairs.length;
  const pairs = [];
  for (let i = 0; i < count; i++) {
    pairs.push(allPairs[(runIndex + i) % allPairs.length]);
  }
  return pairs;
}

function buildRssUrl(query, geo) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${geo.hl}&gl=${geo.gl}&ceid=${geo.ceid}`;
}

// ═══════════════════════════════════════════════
//  FRESHNESS FILTER — reject articles older than
//  14 days at ingestion time
// ═══════════════════════════════════════════════

function isFreshEnough(pubDateISO) {
  if (!pubDateISO) return true; // No date = let it through, Claude will handle
  try {
    const age = Date.now() - new Date(pubDateISO).getTime();
    return age < 14 * 24 * 60 * 60 * 1000; // 14 days
  } catch {
    return true;
  }
}

// ═══════════════════════════════════════════════
//  RSS FETCH — pull articles for rotating pairs
// ═══════════════════════════════════════════════

async function fetchRssForPairs(pairs) {
  const allArticles = [];
  const seenUrls = new Set();

  for (const { query, geo } of pairs) {
    try {
      const url = buildRssUrl(query, geo);
      const response = await fetch(url, {
        headers: { "User-Agent": "TIC-Pulse/3.2", "Accept": "application/xml, text/xml" },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) { console.warn(`RSS ${response.status} for: ${query.slice(0, 40)} [${geo.code}]`); continue; }

      const xml = await response.text();
      const items = parseRssXml(xml);

      for (const item of items) {
        if (seenUrls.has(item.url)) continue;
        if (!isFreshEnough(item.pubDate)) continue;
        seenUrls.add(item.url);
        allArticles.push({
          gdelt_url: item.url,
          title: item.title,
          source_name: item.source,
          source_domain: extractDomain(item.url),
          image_url: item.image || null,
          gdelt_tone: null,
          language: "English",
          published_at: item.pubDate || new Date().toISOString(),
          region: geo.code,
        });
      }
      console.log(`Got ${items.length} articles for: ${query.slice(0, 40)} [${geo.code}]`);
    } catch (err) {
      console.error(`RSS error "${query.slice(0, 40)}" [${geo.code}]:`, err.message);
    }
  }
  console.log(`Total: ${allArticles.length} articles`);
  return allArticles;
}

function parseRssXml(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const x = match[1];
    const title = extractTag(x, "title");
    const link = extractTag(x, "link");
    const pubDate = extractTag(x, "pubDate");
    const source = extractTag(x, "source");

    // Try to extract image from RSS media tags
    let image = null;
    const mediaContent = x.match(/<media:content[^>]+url="([^"]+)"/i);
    const mediaThumbnail = x.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
    const enclosure = x.match(/<enclosure[^>]+url="([^"]+)"/i);
    image = mediaContent?.[1] || mediaThumbnail?.[1] || enclosure?.[1] || null;

    if (title && link) {
      const realUrl = extractRealUrl(link);
      items.push({
        title: decodeEntities(title),
        url: realUrl,
        source: source ? decodeEntities(source) : extractSourceFromUrl(realUrl),
        pubDate: pubDate ? new Date(pubDate).toISOString() : null,
        image,
      });
    }
  }
  return items;
}

function extractTag(xml, tag) {
  const cd = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const m1 = xml.match(cd);
  if (m1) return m1[1].trim();
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m2 = xml.match(re);
  return m2 ? m2[1].trim() : null;
}

function extractRealUrl(url) {
  if (!url.includes("news.google.com")) return url;
  const m = url.match(/url=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : url;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function extractSourceFromUrl(url) {
  const d = extractDomain(url);
  if (!d) return "Unknown";
  return DOMAIN_MAP[d] || d.replace(/\.[a-z]+$/, "").split(/[.-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function decodeEntities(t) {
  return t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "");
}

// ═══════════════════════════════════════════════
//  STORAGE — dedup + insert with region tagging
//  Capped at INGEST_CAP newest per run
// ═══════════════════════════════════════════════

async function storeNewArticles(supabase, articles) {
  if (!articles.length) return 0;
  const capped = articles.slice(0, 200);

  // Batch dedup in chunks of 50
  const existingUrls = new Set();
  for (let i = 0; i < capped.length; i += 50) {
    const batch = capped.slice(i, i + 50).map(a => a.gdelt_url);
    const { data, error } = await supabase.from("articles").select("gdelt_url").in("gdelt_url", batch);
    if (error) { console.error("Lookup error:", error.message); continue; }
    (data || []).forEach(r => existingUrls.add(r.gdelt_url));
  }

  let newArticles = capped.filter(a => !existingUrls.has(a.gdelt_url));
  if (!newArticles.length) { console.log("No new articles"); return 0; }

  // Sort by published_at descending and cap at INGEST_CAP
  newArticles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const toInsert = newArticles.slice(0, INGEST_CAP);
  if (newArticles.length > INGEST_CAP) {
    console.log(`Capped: ${newArticles.length} new → storing ${INGEST_CAP} newest`);
  }

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 20) {
    const batch = toInsert.slice(i, i + 20);
    const { error } = await supabase.from("articles").insert(batch);
    if (error) console.error("Insert error:", error.message);
    else inserted += batch.length;
  }
  console.log(`Stored ${inserted} new articles`);
  return inserted;
}

// ═══════════════════════════════════════════════
//  SUMMARISATION — Claude-powered, 5 per run
//  v3.2: CATEGORY-DIVERSE pick to ensure balanced
//  feed output. Groups unsummarised backlog by
//  predicted category, picks across groups.
// ═══════════════════════════════════════════════

async function summariseArticles(supabase) {
  if (!ANTHROPIC_KEY) { console.warn("No ANTHROPIC_API_KEY — skipping summarisation"); return 0; }

  // Fetch a pool of 50 unsummarised articles
  const { data: pool, error } = await supabase.from("articles")
    .select("id, title, source_name, source_domain, gdelt_url")
    .eq("summarised", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error || !pool?.length) { console.log("Nothing to summarise"); return 0; }

  // Group by predicted category using keyword classifier
  const buckets = {};
  for (const article of pool) {
    const predicted = classifyByKeyword(article.title);
    if (!buckets[predicted]) buckets[predicted] = [];
    buckets[predicted].push(article);
  }

  // Round-robin pick across categories to ensure diversity
  const picked = [];
  const catKeys = Object.keys(buckets);
  // Shuffle category order each run for fairness
  for (let i = catKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [catKeys[i], catKeys[j]] = [catKeys[j], catKeys[i]];
  }

  let round = 0;
  while (picked.length < SUMMARISE_BATCH_SIZE) {
    let pickedThisRound = false;
    for (const cat of catKeys) {
      if (picked.length >= SUMMARISE_BATCH_SIZE) break;
      if (buckets[cat].length > round) {
        picked.push(buckets[cat][round]);
        pickedThisRound = true;
      }
    }
    if (!pickedThisRound) break; // All buckets exhausted
    round++;
  }

  const catSummary = {};
  for (const a of picked) {
    const c = classifyByKeyword(a.title);
    catSummary[c] = (catSummary[c] || 0) + 1;
  }
  console.log(`Summarising ${picked.length} articles (from pool of ${pool.length}, cats: ${JSON.stringify(catSummary)})...`);

  let count = 0;

  for (const article of picked) {
    try {
      const ctx = await fetchArticleContext(article.gdelt_url);
      const result = await callClaude(article, ctx?.text);
      const upd = {
        tldr: result.tldr,
        category: result.category,
        tags: result.tags,
        read_time_min: result.readTime,
        summarised: true,
      };
      if (result.industryTags) upd.industry_tags = result.industryTags;
      if (result.functionTags) upd.function_tags = result.functionTags;
      if (ctx?.image) upd.image_url = ctx.image;
      const { error: ue } = await supabase.from("articles").update(upd).eq("id", article.id);
      if (!ue) {
        await supabase.from("article_engagement").insert({ article_id: article.id }).select().maybeSingle();
        count++;
      }
    } catch (err) {
      console.error(`Error "${article.title.slice(0, 50)}":`, err.message);
      await supabase.from("articles").update({
        tldr: `${article.title}. Read the full article for details.`,
        category: classifyByKeyword(article.title),
        tags: extractHashtags(article.title),
        read_time_min: 3,
        summarised: true,
      }).eq("id", article.id);
      count++;
    }
  }
  return count;
}

// ═══════════════════════════════════════════════
//  ARTICLE CONTEXT — scrape og:image + text
// ═══════════════════════════════════════════════

async function fetchArticleContext(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TIC-Pulse/3.2 (news aggregator)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract og:image
    let image = null;
    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    if (ogImage?.[1]) {
      const imgUrl = ogImage[1];
      try {
        const u = new URL(imgUrl);
        if (u.protocol === "https:" || u.protocol === "http:") image = imgUrl;
      } catch {}
    }

    // Extract text content (first 3000 chars of body text)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;
    const text = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    return { image, text: text.length > 100 ? text : null };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
//  CLAUDE — summarise + categorise
// ═══════════════════════════════════════════════

async function callClaude(article, articleText) {
  const contextBlock = articleText
    ? `\n\nArticle text (first 3000 chars):\n${articleText}`
    : "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Summarise this talent/HR/business news article for professionals.

Title: ${article.title}
Source: ${article.source_name || article.source_domain}${contextBlock}

Return JSON only (no markdown fencing):
{
  "tldr": "2-3 sentence summary for talent intelligence professionals",
  "category": "one of: Talent Strategy, Labour Market, Automation, Executive Moves, Compensation, Workforce Planning, Skills, DEI",
  "tags": ["#Tag1", "#Tag2", "#Tag3"],
  "readTime": estimated_minutes_integer,
  "industryTags": ["tech", "finance", "healthcare", "etc"],
  "functionTags": ["talent_acquisition", "people_analytics", "compensation", "etc"]
}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty Claude response");

  const result = JSON.parse(text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  if (!result.tldr) throw new Error("No tldr");
  if (!VALID_CATEGORIES.includes(result.category)) result.category = classifyByKeyword(article.title);
  if (!Array.isArray(result.tags)) result.tags = extractHashtags(article.title);
  else result.tags = result.tags.slice(0, 5).map(t => t.startsWith("#") ? t : `#${t}`);
  result.readTime = Math.min(10, Math.max(2, parseInt(result.readTime, 10) || 4));
  return result;
}

function classifyByKeyword(title) {
  const l = (title || "").toLowerCase();
  const rules = [
    [["chro", "chief people", "chief human", "chief talent", "chief diversity", "chief learning",
      "ceo appointed", "ceo hired", "new ceo", "cfo appointed", "cfo hired", "new cfo",
      "cto appointed", "cto hired", "cio appointed", "coo appointed",
      "executive appoint", "c-suite", "vp hired", "vp appointed", "svp appointed", "svp hired",
      "head of talent", "head of people", "head of hr", "head of human",
      "president appointed", "president hired", "gm appointed", "managing director",
      "board director", "non-executive director",
      "leadership appoint", "promoted to vp", "promoted to svp",
      "named as", "steps down", "resigns as", "departure"], "Executive Moves"],
    [["pay transpar", "compensation", "salary", "wage", "benefits", "total rewards", "pay equity", "gender pay"], "Compensation"],
    [["automat", "agentic", "robot", "ai replac", "future of work", "generative ai", "ai workforce", "ai displac", "ai job"], "Automation"],
    [["skill", "reskill", "upskill", "taxonomy", "credential", "microcredential", "skills gap", "skills short", "skills first", "skills based"], "Skills"],
    [["diversity", "inclusion", "equity", "dei", "belonging"], "DEI"],
    [["workforce plan", "headcount", "strategic workforce", "org design", "org restructur",
      "organisational design", "operating model", "restructur", "layoff", "redundanc", "hiring freeze"], "Workforce Planning"],
    [["labour market", "labor market", "unemploy", "job market", "vacancy", "jobs report",
      "employment data", "employment trend", "workforce shortage", "talent shortage"], "Labour Market"],
    [["talent", "recruit", "hiring", "candidate", "employer brand", "people analytics",
      "people intelligence", "workforce intelligence", "talent intelligence",
      "internal mobility", "talent marketplace", "employee experience",
      "retention", "attrition", "competitor intelligence", "osint", "hr tech"], "Talent Strategy"],
  ];
  for (const [kws, cat] of rules) { if (kws.some(k => l.includes(k))) return cat; }
  return "Talent Strategy";
}

function extractHashtags(title) {
  const l = (title || "").toLowerCase();
  const m = {
    ai: "#AI", talent: "#TalentStrategy", recruit: "#Recruitment", skill: "#Skills",
    chro: "#CHRO", automat: "#Automation", workforce: "#Workforce", salary: "#Compensation",
    pay: "#PayTransparency", divers: "#DEI", remote: "#RemoteWork", hybrid: "#HybridWork",
    ceo: "#Leadership", cfo: "#Leadership", layoff: "#Restructuring",
  };
  const tags = [];
  for (const [k, v] of Object.entries(m)) {
    if (l.includes(k) && !tags.includes(v)) tags.push(v);
    if (tags.length >= 3) break;
  }
  return tags.length ? tags : ["#TalentIntelligence"];
}

// ═══════════════════════════════════════════════
//  HANDLER — orchestrates fetch + summarise each run
// ═══════════════════════════════════════════════

export default async function handler(req) {
  const start = Date.now();
  const runId = Math.floor(Date.now() / (5 * 60 * 1000)) % 1000;
  console.log(`═══ TIC Pulse v3.2: Run #${runId} Started ═══`);

  try {
    const supabase = getSupabase();

    // Step 1: Fetch RSS from 3 rotating (query, geo) pairs
    const pairs = getRunPairs(3);
    console.log(`Fetching: ${pairs.map(p => `${p.query.slice(0, 30)}… [${p.geo.code}]`).join(", ")}`);
    const articles = await fetchRssForPairs(pairs);
    const stored = await storeNewArticles(supabase, articles);

    // Step 2: Summarise 5 unsummarised articles (CATEGORY-DIVERSE pick)
    const summarised = await summariseArticles(supabase);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`═══ Run #${runId} Done: ${stored} stored, ${summarised} summarised in ${elapsed}s ═══`);

    return new Response(JSON.stringify({
      ok: true,
      run: runId,
      pairs: pairs.map(p => ({ query: p.query.slice(0, 40), geo: p.geo.code })),
      fetched: articles.length,
      stored,
      summarised,
      elapsed: `${elapsed}s`,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Pipeline error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// ─── Run every 5 minutes ───
export const config = { schedule: "*/5 * * * *" };

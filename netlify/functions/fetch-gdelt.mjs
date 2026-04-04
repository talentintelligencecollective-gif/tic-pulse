// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — News Fetch + Summarise Pipeline (v3)
//  Drip-feed: runs every 5 minutes, fetches 2-3 RSS feeds
//  and summarises 3 articles per run.
//  ~50 queries × 5 core geographies = global coverage.
//  Netlify Scheduled Function — stays well under 60s timeout.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUMMARISE_BATCH_SIZE = 3; // Only 3 per run — stays well under 60s

// ═══════════════════════════════════════════════
//  QUERIES — ~50 covering all TI domains
// ═══════════════════════════════════════════════

const NEWS_QUERIES = [
  // Talent strategy & acquisition
  "talent acquisition strategy",
  "talent intelligence analytics",
  "talent management strategy",
  "talent mobility internal hiring",
  "employer branding talent attraction",
  "recruitment technology hiring",
  "candidate experience recruiting",
  // Workforce planning & strategy
  "workforce planning strategy",
  "strategic workforce analytics",
  "workforce intelligence insights",
  "workforce transformation strategy",
  "headcount planning forecasting",
  // Skills
  "skills based hiring strategy",
  "skills gap reskilling upskilling",
  "skills taxonomy workforce",
  "skills intelligence analytics",
  "credentialing microcredentials workforce",
  // People analytics & HR tech
  "people analytics HR",
  "people intelligence workforce data",
  "HR technology people analytics",
  "human capital analytics insights",
  // Executive & leadership moves
  "CHRO chief people officer appointed",
  "chief human resources officer",
  "VP talent acquisition appointed",
  "head of people appointed",
  "SVP president human resources appointed",
  "leadership appointment executive moves",
  // Compensation & pay
  "pay transparency compensation",
  "salary benchmarking compensation strategy",
  "executive compensation pay equity",
  "total rewards benefits strategy",
  // Labour market & economics
  "labour market trends employment",
  "labor market unemployment jobs",
  "labour economics workforce shortage",
  "jobs report employment data",
  "labour strategy workforce economics",
  // Automation & AI
  "AI workforce automation",
  "agentic AI future of work",
  "AI replacing jobs automation",
  "generative AI HR workforce",
  "automation productivity workforce",
  // DEI
  "diversity equity inclusion workplace",
  "DEI strategy workforce",
  "belonging inclusion workforce",
  // Competitor & market intelligence
  "competitor intelligence business strategy",
  "market intelligence analysis",
  "OSINT open source intelligence",
  // Remote & hybrid work
  "remote work hybrid return to office",
  "distributed workforce strategy",
  // Organisational design
  "organisational design restructuring",
  "org design workforce transformation",
  // Productivity & performance
  "employee productivity performance management",
  "employee engagement retention strategy",
];

// ═══════════════════════════════════════════════
//  GEOGRAPHIES — 5 core (English), 4 secondary
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

// ═══════════════════════════════════════════════
//  CATEGORIES & CLASSIFICATION
// ═══════════════════════════════════════════════

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
  "livemint.com": "Mint", "economictimes.com": "Economic Times",
  "straitstimes.com": "Straits Times", "smh.com.au": "Sydney Morning Herald",
  "afr.com": "Australian Financial Review", "globeandmail.com": "Globe and Mail",
  "businessinsider.com": "Business Insider", "hrdive.com": "HR Dive",
  "personneltoday.com": "Personnel Today", "cipd.org": "CIPD",
};

// ═══════════════════════════════════════════════
//  RELEVANCE FILTER — reject off-topic articles
// ═══════════════════════════════════════════════

const RELEVANCE_KEYWORDS = [
  "talent", "workforce", "hiring", "recruit", "AI", "agent", "leadership",
  "skill", "automat", "job", "labor", "labour", "human capital", "productiv",
  "transform", "econom", "incentive", "nudge", "bias", "decision", "data",
  "management", "organization", "organisation", "CHRO", "HR", "people",
  "compens", "salary", "wage", "pay", "DEI", "divers", "inclusion",
  "remote", "hybrid", "future of work", "headcount", "reskill", "upskill",
  "employ", "candidate", "retention", "engag", "analytics", "intelligence",
  "OSINT", "competitor", "benchmark", "restructur", "layoff", "retrench",
];

function isRelevant(title) {
  const lower = (title || "").toLowerCase();
  return RELEVANCE_KEYWORDS.some(k => lower.includes(k));
}

// ═══════════════════════════════════════════════
//  DRIP-FEED ROTATION
// ═══════════════════════════════════════════════

function getRunPairs(count) {
  // Create all (query, geo) pairs
  const allPairs = [];
  for (const query of NEWS_QUERIES) {
    for (const geo of CORE_GEOS) {
      allPairs.push({ query, geo });
    }
  }
  // Add secondary geos for a subset of queries (every 3rd query)
  for (let i = 0; i < NEWS_QUERIES.length; i += 3) {
    for (const geo of SECONDARY_GEOS) {
      allPairs.push({ query: NEWS_QUERIES[i], geo });
    }
  }

  // Use time-based index to rotate through pairs
  const runIndex = Math.floor(Date.now() / (5 * 60 * 1000)) % allPairs.length;
  const selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(allPairs[(runIndex + i) % allPairs.length]);
  }
  return selected;
}

// ═══════════════════════════════════════════════
//  RSS FETCHING
// ═══════════════════════════════════════════════

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function buildRssUrl(query, geo) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${geo.hl}&gl=${geo.gl}&ceid=${geo.ceid}`;
}

async function fetchRssForPairs(pairs) {
  const allArticles = [];
  const seenUrls = new Set();

  for (const { query, geo } of pairs) {
    try {
      const response = await fetch(buildRssUrl(query, geo), {
        headers: { "User-Agent": "TIC-Pulse/1.0", "Accept": "application/xml, text/xml" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { console.warn(`RSS ${response.status} for: ${query.slice(0, 30)} [${geo.code}]`); continue; }

      const xml = await response.text();
      const items = parseRssXml(xml);

      for (const item of items) {
        if (seenUrls.has(item.url)) continue;
        if (!isRelevant(item.title)) continue;
        seenUrls.add(item.url);
        allArticles.push({
          gdelt_url: item.url,
          title: item.title,
          source_name: item.source,
          source_domain: extractDomain(item.url),
          image_url: null,
          gdelt_tone: null,
          language: "English",
          region: geo.code,
          published_at: item.pubDate || new Date().toISOString(),
        });
      }
      console.log(`Got ${items.length} items (${allArticles.length} relevant) for: ${query.slice(0, 30)} [${geo.code}]`);
    } catch (err) {
      console.error(`RSS error "${query.slice(0, 30)} [${geo.code}]":`, err.message);
    }
  }
  console.log(`Total fetched: ${allArticles.length} relevant articles`);
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
    if (title && link) {
      const realUrl = extractRealUrl(link);
      items.push({
        title: decodeEntities(title),
        url: realUrl,
        source: source ? decodeEntities(source) : extractSourceFromUrl(realUrl),
        pubDate: pubDate ? new Date(pubDate).toISOString() : null,
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

  const newArticles = capped.filter(a => !existingUrls.has(a.gdelt_url));
  if (!newArticles.length) { console.log("No new articles"); return 0; }

  let inserted = 0;
  for (let i = 0; i < newArticles.length; i += 20) {
    const batch = newArticles.slice(i, i + 20);
    const { error } = await supabase.from("articles").insert(batch);
    if (error) console.error("Insert error:", error.message);
    else inserted += batch.length;
  }
  console.log(`Stored ${inserted} new articles`);
  return inserted;
}

// ═══════════════════════════════════════════════
//  SUMMARISATION — Claude-powered, 3 per run
// ═══════════════════════════════════════════════

async function summariseArticles(supabase) {
  if (!ANTHROPIC_KEY) { console.warn("No ANTHROPIC_API_KEY — skipping summarisation"); return 0; }

  const { data: unsummarised, error } = await supabase.from("articles")
    .select("id, title, source_name, source_domain, gdelt_url")
    .eq("summarised", false)
    .order("created_at", { ascending: true })
    .limit(SUMMARISE_BATCH_SIZE);

  if (error || !unsummarised?.length) { console.log("Nothing to summarise"); return 0; }

  console.log(`Summarising ${unsummarised.length} articles...`);
  let count = 0;

  for (const article of unsummarised) {
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
      if (ctx?.image) upd.image_url = ctx.image;
      const { error: ue } = await supabase.from("articles").update(upd).eq("id", article.id);
      if (!ue) {
        // Ensure article_engagement row exists
        await supabase.from("article_engagement").insert({ article_id: article.id }).select().maybeSingle();
        count++;
      }
    } catch (err) {
      console.error(`Error "${article.title.slice(0, 50)}":`, err.message);
      // Fallback: classify by keyword so article still appears in feed
      await supabase.from("articles").update({
        tldr: `${article.title}. From ${article.source_name || article.source_domain}.`,
        category: classifyByKeyword(article.title),
        tags: extractHashtags(article.title),
        summarised: true,
      }).eq("id", article.id);
    }
  }
  console.log(`Summarised ${count}/${unsummarised.length}`);
  return count;
}

async function fetchArticleContext(url) {
  try {
    if (url.includes("news.google.com")) return null;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TIC-Pulse/1.0)", "Accept": "text/html" },
      redirect: "follow", signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const image = extractMeta(html, 'property="og:image"') || extractMeta(html, 'name="twitter:image"');
    const desc = extractMeta(html, 'property="og:description"') || extractMeta(html, 'name="description"');
    return { image, text: desc };
  } catch { return null; }
}

function extractMeta(html, attr) {
  const p1 = new RegExp(`<meta\\s+[^>]*${attr}[^>]*content=["']([^"']{10,500})["']`, "i");
  const p2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']{10,500})["'][^>]*${attr}`, "i");
  const m = html.match(p1) || html.match(p2);
  return m ? decodeEntities(m[1].trim()) : null;
}

async function callClaude(article, description) {
  const ctx = description ? `\n\nArticle description: ${description}` : "";
  const prompt = `You are a talent intelligence analyst. Analyse this news article and provide a structured summary.

Article headline: ${article.title}
Source: ${article.source_name || article.source_domain}${ctx}

Respond with ONLY valid JSON (no markdown fences, no preamble):
{"tldr":"2-3 sentence summary for talent intel professionals. British English.","category":"One of: ${VALID_CATEGORIES.join(", ")}","tags":["#Tag1","#Tag2","#Tag3"],"readTime":4}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Claude ${response.status}`);
  const data = await response.json();
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

// ═══════════════════════════════════════════════
//  FALLBACK CLASSIFIERS
// ═══════════════════════════════════════════════

function classifyByKeyword(title) {
  const l = (title || "").toLowerCase();
  const rules = [
    [["chro", "chief people", "chief human", "executive appoint", "c-suite", "appointed", "head of people", "vp talent", "svp human"], "Executive Moves"],
    [["pay transpar", "compensation", "salary", "wage", "benefits", "total rewards", "pay equity"], "Compensation"],
    [["automat", "agentic", "robot", "ai replac", "future of work", "generative ai"], "Automation"],
    [["skill", "reskill", "upskill", "taxonomy", "credential", "microcredential"], "Skills"],
    [["diversity", "inclusion", "equity", "dei", "belonging"], "DEI"],
    [["workforce plan", "headcount", "strategic workforce"], "Workforce Planning"],
    [["labour market", "labor market", "unemploy", "job market", "vacancy", "jobs report", "employment data"], "Labour Market"],
    [["talent", "recruit", "hiring", "candidate", "employer brand", "people analytics", "hr tech"], "Talent Strategy"],
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
    analytics: "#Analytics", intelligence: "#TalentIntelligence", leadership: "#Leadership",
  };
  const tags = [];
  for (const [k, v] of Object.entries(m)) { if (l.includes(k) && !tags.includes(v)) tags.push(v); if (tags.length >= 3) break; }
  return tags.length ? tags : ["#TalentIntelligence"];
}

// ═══════════════════════════════════════════════
//  HANDLER — orchestrates fetch + summarise each run
// ═══════════════════════════════════════════════

export default async function handler(req) {
  const start = Date.now();
  const runId = Math.floor(Date.now() / (5 * 60 * 1000)) % 1000;
  console.log(`═══ TIC Pulse v3: Run #${runId} Started ═══`);

  try {
    const supabase = getSupabase();

    // Step 1: Fetch RSS from 3 rotating (query, geo) pairs
    const pairs = getRunPairs(3);
    console.log(`Fetching: ${pairs.map(p => `${p.query.slice(0, 30)}… [${p.geo.code}]`).join(", ")}`);
    const articles = await fetchRssForPairs(pairs);
    const stored = await storeNewArticles(supabase, articles);

    // Step 2: Summarise 3 unsummarised articles from the backlog
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

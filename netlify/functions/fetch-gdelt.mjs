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

// ─── Summarisation: 5 per run keeps us safely under 60s ───
const SUMMARISE_BATCH_SIZE = 5;

// ═══════════════════════════════════════════════
//  SEARCH QUERIES — ~50 queries covering full TI landscape
// ═══════════════════════════════════════════════

const NEWS_QUERIES = [
  // ── Talent Intelligence & Analytics ──
  "talent intelligence OR talent analytics",
  "talent insights OR talent analysis",
  "talent strategy OR talent acquisition",
  "talent management OR talent mobility",

  // ── People Analytics & Intelligence ──
  "people analytics OR people intelligence",
  "people insights OR people strategy",
  "people analytics platform OR people data",

  // ── Workforce Intelligence & Strategy ──
  "workforce intelligence OR workforce analytics",
  "workforce strategy OR workforce insights",
  "workforce planning OR strategic workforce",
  "workforce shortages OR talent shortage",
  "workforce analysis OR workforce transformation",

  // ── Competitive Intelligence & OSINT ──
  "competitor intelligence talent OR competitive intelligence hiring",
  "OSINT workforce OR open source intelligence hiring",
  "competitive talent analysis OR talent benchmarking",

  // ── Labour Market & Economics ──
  "labour market trends OR labor market trends",
  "labour economics OR labor economics",
  "labour strategy OR labor strategy",
  "employment trends OR unemployment data",
  "job market analysis OR jobs report",

  // ── Compensation ──
  "compensation strategy OR compensation analytics",
  "compensation insights OR compensation analysis",
  "pay transparency OR salary transparency",
  "pay equity OR gender pay gap",

  // ── Executive & Leadership Moves (expanded) ──
  "CHRO appointed OR chief people officer hired",
  "chief human resources officer OR chief talent officer",
  "VP talent OR VP people OR VP HR appointed",
  "SVP human resources OR SVP people appointed",
  "head of talent acquisition OR head of people",
  "head of HR appointed OR head of human resources",
  "president human resources OR GM people operations",
  "leadership appointment OR executive hire HR",
  "VP engineering hired OR VP product appointed",
  "chief diversity officer OR chief learning officer",

  // ── Skills ──
  "skills based hiring OR skills first hiring",
  "skills taxonomy OR skills ontology",
  "reskilling OR upskilling workforce",
  "skills shortage OR skills gap",

  // ── AI & Automation ──
  "AI agents workforce OR agentic AI hiring",
  "AI replacing jobs OR AI job displacement",
  "AI workforce automation OR automation jobs",
  "future of work OR future of jobs",

  // ── Employee Experience & Culture ──
  "employee experience strategy OR employee engagement",
  "employer branding OR employee value proposition",
  "internal mobility OR talent marketplace",
  "employee retention OR attrition rate",

  // ── Workplace Policy ──
  "return to office OR RTO policy",
  "hybrid work policy OR remote work policy",
  "four day work week OR flexible working",

  // ── DEI ──
  "DEI strategy workplace OR diversity equity inclusion",
  "equity inclusion OR belonging strategy workplace",

  // ── Organisational Design ──
  "organisational design OR org restructure",
  "organisational transformation OR operating model change",

  // ── HR Technology ──
  "HR technology OR HR tech platform",
  "HR transformation OR digital HR",
  "HRIS implementation OR HCM platform",

  // ── Market Disruption ──
  "layoffs technology OR tech layoffs",
  "restructuring workforce OR redundancies",
  "hiring freeze OR headcount reduction",
  "gig economy OR freelance workforce",
  "contractor workforce OR contingent workforce",
];

// ═══════════════════════════════════════════════
//  GEOGRAPHIES — core (every run) + secondary (periodic)
// ═══════════════════════════════════════════════

const CORE_GEOS = [
  { code: "US", gl: "US", ceid: "US:en" },
  { code: "GB", gl: "GB", ceid: "GB:en" },
  { code: "AU", gl: "AU", ceid: "AU:en" },
  { code: "IN", gl: "IN", ceid: "IN:en" },
  { code: "SG", gl: "SG", ceid: "SG:en" },
];

const SECONDARY_GEOS = [
  { code: "CA", gl: "CA", ceid: "CA:en" },
  { code: "DE", gl: "DE", ceid: "DE:en" },
  { code: "AE", gl: "AE", ceid: "AE:en" },
  { code: "ZA", gl: "ZA", ceid: "ZA:en" },
];

// Map region codes to human-readable labels for the UI
const REGION_LABELS = {
  US: "North America", CA: "North America",
  GB: "Europe", DE: "Europe",
  AU: "Asia Pacific", IN: "Asia Pacific", SG: "Asia Pacific",
  AE: "Middle East", ZA: "Africa",
};

// ═══════════════════════════════════════════════
//  CATEGORIES & DOMAIN MAP
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
  "afr.com": "Australian Financial Review", "smh.com.au": "Sydney Morning Herald",
  "livemint.com": "Mint", "economictimes.com": "Economic Times",
  "straitstimes.com": "Straits Times", "scmp.com": "South China Morning Post",
  "gulfnews.com": "Gulf News", "arabianbusiness.com": "Arabian Business",
  "theglobeandmail.com": "Globe and Mail", "businesslive.co.za": "Business Live",
  "personneltoday.com": "Personnel Today", "hrdive.com": "HR Dive",
  "ere.net": "ERE", "tlnt.com": "TLNT", "workforceai.substack.com": "Workforce AI",
};

// ═══════════════════════════════════════════════
//  ROTATION LOGIC — deterministic cycling through queries × geos
// ═══════════════════════════════════════════════

function buildPairs() {
  const pairs = [];
  // Core geos: every query
  for (const q of NEWS_QUERIES) {
    for (const g of CORE_GEOS) {
      pairs.push({ query: q, geo: g });
    }
  }
  // Secondary geos: top 20 queries only (highest-value topics)
  const topQueries = NEWS_QUERIES.slice(0, 20);
  for (const q of topQueries) {
    for (const g of SECONDARY_GEOS) {
      pairs.push({ query: q, geo: g });
    }
  }
  return pairs;
}

// Deterministic rotation: each 5-min run picks a different slice
function getRunPairs(pairsPerRun = 3) {
  const allPairs = buildPairs();
  const runIndex = Math.floor(Date.now() / (5 * 60 * 1000));
  const start = (runIndex * pairsPerRun) % allPairs.length;
  const selected = [];
  for (let i = 0; i < pairsPerRun; i++) {
    selected.push(allPairs[(start + i) % allPairs.length]);
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
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=${geo.gl}&ceid=${geo.ceid}`;
}

async function fetchRssForPairs(pairs) {
  const allArticles = [];
  const seenUrls = new Set();

  for (const { query, geo } of pairs) {
    try {
      const response = await fetch(buildRssUrl(query, geo), {
        headers: { "User-Agent": "TIC-Pulse/2.0", "Accept": "application/xml, text/xml" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { console.warn(`RSS ${response.status} for: ${query.slice(0, 40)} [${geo.code}]`); continue; }

      const xml = await response.text();
      const items = parseRssXml(xml);

      for (const item of items) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        allArticles.push({
          gdelt_url: item.url,
          title: item.title,
          source_name: item.source,
          source_domain: extractDomain(item.url),
          image_url: null,
          gdelt_tone: null,
          language: "English",
          published_at: item.pubDate || new Date().toISOString(),
          region: geo.code,
        });
      }
      console.log(`[${geo.code}] ${items.length} articles for: ${query.slice(0, 40)}`);
    } catch (err) {
      console.error(`RSS error [${geo.code}] "${query.slice(0, 40)}":`, err.message);
    }
  }
  console.log(`Total fetched: ${allArticles.length} articles`);
  return allArticles;
}

// ═══════════════════════════════════════════════
//  XML PARSING
// ═══════════════════════════════════════════════

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
        // Engagement insert may fail on duplicate — don't let it corrupt the summary
        try {
          await supabase.from("article_engagement").insert({ article_id: article.id }).select().maybeSingle();
        } catch { /* duplicate engagement row is fine */ }
        count++;
      }
    } catch (err) {
      console.error(`Error "${article.title.slice(0, 50)}":`, err.message);
      // Fallback: mark as summarised with basic info so it doesn't block the queue
      await supabase.from("articles").update({
        tldr: `${article.title}. From ${article.source_name || article.source_domain}.`,
        category: classifyByKeyword(article.title),
        tags: extractHashtags(article.title),
        summarised: true,
      }).eq("id", article.id);
      count++; // Still counts — article is now visible in feed
    }
  }
  console.log(`Summarised ${count}/${unsummarised.length}`);
  return count;
}

async function fetchArticleContext(url) {
  try {
    if (url.includes("news.google.com")) return null;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TIC-Pulse/2.0)", "Accept": "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000), // tighter timeout for drip-feed
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
{"tldr":"2-3 sentence summary for talent intel professionals. British English.","category":"One of: ${VALID_CATEGORIES.join(", ")}","tags":["#Tag1","#Tag2","#Tag3"],"readTime":4}

Category guidance:
- "Executive Moves" = any leadership appointment, hire, departure at VP level and above (VP, SVP, EVP, GM, President, Head of, Chief, C-suite)
- "Talent Strategy" = talent acquisition, employer branding, talent intelligence, people analytics, recruitment strategy
- "Labour Market" = employment data, job market, unemployment, labour economics, workforce shortages
- "Automation" = AI, agentic AI, robots, future of work, job displacement, automation
- "Compensation" = pay, salary, benefits, pay equity, pay transparency
- "Workforce Planning" = headcount, org design, workforce strategy, restructuring, layoffs
- "Skills" = skills gaps, reskilling, upskilling, skills taxonomy, skills-based hiring
- "DEI" = diversity, equity, inclusion, belonging`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(20000), // tighter for drip-feed
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
//  KEYWORD CLASSIFICATION (fallback when Claude fails)
// ═══════════════════════════════════════════════

function classifyByKeyword(title) {
  const l = (title || "").toLowerCase();
  const rules = [
    [["chro", "chief people", "chief human", "chief talent", "chief diversity", "chief learning",
      "executive appoint", "c-suite", "vp hired", "vp appointed", "svp appointed", "svp hired",
      "head of talent", "head of people", "head of hr", "head of human",
      "president people", "president hr", "gm people", "gm human",
      "leadership appoint", "promoted to vp", "promoted to svp"], "Executive Moves"],
    [["pay transpar", "compensation", "salary", "wage", "benefits", "pay equity", "gender pay"], "Compensation"],
    [["automat", "agentic", "robot", "ai replac", "future of work", "ai agent", "ai displac", "ai job"], "Automation"],
    [["skill", "reskill", "upskill", "taxonomy", "credential", "skills-based", "skills based", "skills first", "skills gap", "skills short"], "Skills"],
    [["diversity", "inclusion", "equity", "dei", "belonging"], "DEI"],
    [["workforce plan", "headcount", "strategic workforce", "org design", "org restructur",
      "organisational design", "operating model", "restructur", "layoff", "redundanc", "hiring freeze"], "Workforce Planning"],
    [["labour market", "labor market", "unemploy", "job market", "employment trend", "labour econ",
      "labor econ", "jobs report", "workforce shortage", "talent shortage"], "Labour Market"],
    [["talent", "recruit", "hiring", "candidate", "employer brand", "people analytics",
      "people intelligence", "workforce intelligence", "talent intelligence", "talent analytics",
      "internal mobility", "talent marketplace", "employee experience", "employee engagement",
      "retention", "attrition", "competitor intelligence", "osint"], "Talent Strategy"],
  ];
  for (const [kws, cat] of rules) { if (kws.some(k => l.includes(k))) return cat; }
  return "Talent Strategy";
}

function extractHashtags(title) {
  const l = (title || "").toLowerCase();
  const m = {
    "ai": "#AI", "talent intellig": "#TalentIntelligence", "talent acqui": "#TalentAcquisition",
    "people analytics": "#PeopleAnalytics", "recruit": "#Recruitment", "skill": "#Skills",
    "chro": "#CHRO", "automat": "#Automation", "workforce": "#Workforce",
    "salary": "#Compensation", "compensat": "#Compensation", "pay": "#PayTransparency",
    "divers": "#DEI", "remote": "#RemoteWork", "hybrid": "#HybridWork",
    "layoff": "#Layoffs", "restructur": "#Restructuring", "rto": "#ReturnToOffice",
    "gig": "#GigEconomy", "freelanc": "#Freelance", "osint": "#OSINT",
    "competitor": "#CompetitiveIntelligence", "vp": "#Leadership", "svp": "#Leadership",
    "head of": "#Leadership", "appointed": "#ExecutiveMoves", "hired": "#ExecutiveMoves",
    "reskill": "#Reskilling", "upskill": "#Upskilling", "retention": "#Retention",
    "employer brand": "#EmployerBranding", "internal mobil": "#InternalMobility",
  };
  const tags = [];
  for (const [k, v] of Object.entries(m)) {
    if (l.includes(k) && !tags.includes(v)) tags.push(v);
    if (tags.length >= 4) break;
  }
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

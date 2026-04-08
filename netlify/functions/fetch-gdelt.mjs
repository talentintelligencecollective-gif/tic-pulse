// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — News Fetch + Summarise Pipeline (v3)
//  Uses Google News RSS (free, reliable, no API key needed)
//  Netlify Scheduled Function (runs every 30 minutes)
//  v3 adds: industry_tags + function_tags to every article summary
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUMMARISE_BATCH_SIZE = 10;

const NEWS_QUERIES = [
  "talent acquisition OR talent strategy",
  "workforce planning OR strategic workforce",
  "skills gap OR reskilling OR upskilling",
  "CHRO OR chief people officer",
  "pay transparency OR compensation strategy",
  "future of work OR AI workforce automation",
  "labour market trends OR employment trends",
  "employer branding OR talent mobility",
  "skills taxonomy OR skills based hiring",
  "HR technology OR people analytics",
];

const VALID_CATEGORIES = [
  "Talent Strategy", "Labour Market", "Automation", "Executive Moves",
  "Compensation", "Workforce Planning", "Skills", "DEI",
];

// Valid values for audience tagging — kept narrow so scoring is precise
const VALID_INDUSTRIES = [
  "tech", "finance", "healthcare", "retail", "fmcg",
  "consulting", "government", "professional_services", "energy", "media",
];

const VALID_FUNCTIONS = [
  "talent_acquisition", "people_analytics", "hr_ops",
  "learning_dev", "compensation", "executive",
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
};

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function buildRssUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`;
}

async function fetchNewsArticles() {
  const allArticles = [];
  const seenUrls = new Set();

  for (const query of NEWS_QUERIES) {
    try {
      const response = await fetch(buildRssUrl(query), {
        headers: { "User-Agent": "TIC-Pulse/1.0", "Accept": "application/xml, text/xml" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) { console.warn(`RSS ${response.status} for: ${query.slice(0,40)}`); continue; }

      const xml = await response.text();
      const items = parseRssXml(xml);

      for (const item of items) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        allArticles.push({
          gdelt_url: item.url, title: item.title,
          source_name: item.source, source_domain: extractDomain(item.url),
          image_url: null, gdelt_tone: null, language: "English",
          published_at: item.pubDate || new Date().toISOString(),
        });
      }
      console.log(`Got ${items.length} articles for: ${query.slice(0,40)}`);
    } catch (err) {
      console.error(`RSS error "${query.slice(0,40)}":`, err.message);
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
    if (title && link) {
      const realUrl = extractRealUrl(link);
      items.push({
        title: decodeEntities(title), url: realUrl,
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
  return t.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/<[^>]+>/g,"");
}

async function storeNewArticles(supabase, articles) {
  if (!articles.length) return 0;
  const capped = articles.slice(0, 200);
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

async function summariseArticles(supabase) {
  if (!ANTHROPIC_KEY) { console.warn("No ANTHROPIC_API_KEY"); return 0; }
  const { data: unsummarised, error } = await supabase.from("articles")
    .select("id, title, source_name, source_domain, gdelt_url")
    .eq("summarised", false).order("created_at", { ascending: true }).limit(SUMMARISE_BATCH_SIZE);
  if (error || !unsummarised?.length) { console.log("Nothing to summarise"); return 0; }

  console.log(`Summarising ${unsummarised.length} articles...`);
  let count = 0;

  for (const article of unsummarised) {
    try {
      const ctx = await fetchArticleContext(article.gdelt_url);
      const result = await callClaude(article, ctx?.text);

      // ── Build update object — now includes industry_tags + function_tags ──
      const upd = {
        tldr: result.tldr,
        category: result.category,
        tags: result.tags,
        read_time_min: result.readTime,
        industry_tags: result.industry_tags || [],
        function_tags: result.function_tags || [],
        summarised: true,
      };
      if (ctx?.image) upd.image_url = ctx.image;

      const { error: ue } = await supabase.from("articles").update(upd).eq("id", article.id);
      if (!ue) {
        await supabase.from("article_engagement").insert({ article_id: article.id }).select().maybeSingle();
        count++;
      }
    } catch (err) {
      console.error(`Error "${article.title.slice(0,50)}":`, err.message);
      // Fallback — store without tags rather than losing the article
      await supabase.from("articles").update({
        tldr: `${article.title}. From ${article.source_name || article.source_domain}.`,
        category: classifyByKeyword(article.title),
        tags: extractHashtags(article.title),
        industry_tags: inferIndustryTags(article.title),
        function_tags: inferFunctionTags(article.title),
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

// ─── Extended Claude prompt — returns industry_tags + function_tags in addition
//     to existing fields. Same single API call, ~10% more tokens. ───
async function callClaude(article, description) {
  const ctx = description ? `\n\nArticle description: ${description}` : "";
  const prompt = `You are a talent intelligence analyst. Analyse this news article and provide a structured summary.

Article headline: ${article.title}
Source: ${article.source_name || article.source_domain}${ctx}

Respond with ONLY valid JSON (no markdown fences, no preamble):
{
  "tldr": "2-3 sentence summary for talent intel professionals. British English.",
  "category": "One of: ${VALID_CATEGORIES.join(", ")}",
  "tags": ["#Tag1", "#Tag2", "#Tag3"],
  "readTime": 4,
  "industry_tags": ["tech"],
  "function_tags": ["talent_acquisition"]
}

Rules for industry_tags: choose 1-2 from: ${VALID_INDUSTRIES.join(", ")}. Pick industries whose professionals would most care about this article. Use [] if genuinely cross-industry.
Rules for function_tags: choose 1-2 from: ${VALID_FUNCTIONS.join(", ")}. Pick HR/talent functions most relevant to this article's content. Use [] if not function-specific.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Claude ${response.status}`);
  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty Claude response");
  const result = JSON.parse(text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  if (!result.tldr) throw new Error("No tldr");

  // Validate category
  if (!VALID_CATEGORIES.includes(result.category)) result.category = classifyByKeyword(article.title);

  // Validate tags
  if (!Array.isArray(result.tags)) result.tags = extractHashtags(article.title);
  else result.tags = result.tags.slice(0, 5).map(t => t.startsWith("#") ? t : `#${t}`);

  // Validate read time
  result.readTime = Math.min(10, Math.max(2, parseInt(result.readTime, 10) || 4));

  // Validate industry_tags — filter to known values only
  if (!Array.isArray(result.industry_tags)) result.industry_tags = [];
  else result.industry_tags = result.industry_tags.filter(t => VALID_INDUSTRIES.includes(t)).slice(0, 2);

  // Validate function_tags — filter to known values only
  if (!Array.isArray(result.function_tags)) result.function_tags = [];
  else result.function_tags = result.function_tags.filter(t => VALID_FUNCTIONS.includes(t)).slice(0, 2);

  return result;
}

// ─── Keyword-based fallbacks (used when Claude call fails) ───

function classifyByKeyword(title) {
  const l = (title || "").toLowerCase();
  const rules = [
    [["chro","chief people","chief human","executive appoint","c-suite"],"Executive Moves"],
    [["pay transpar","compensation","salary","wage","benefits"],"Compensation"],
    [["automat","agentic","robot","ai replac","future of work"],"Automation"],
    [["skill","reskill","upskill","taxonomy","credential"],"Skills"],
    [["diversity","inclusion","equity","dei","belonging"],"DEI"],
    [["workforce plan","headcount","strategic workforce"],"Workforce Planning"],
    [["labour market","labor market","unemploy","job market","vacancy"],"Labour Market"],
    [["talent","recruit","hiring","candidate","employer brand"],"Talent Strategy"],
  ];
  for (const [kws, cat] of rules) { if (kws.some(k => l.includes(k))) return cat; }
  return "Talent Strategy";
}

function extractHashtags(title) {
  const l = (title || "").toLowerCase();
  const m = { ai:"#AI", talent:"#TalentStrategy", recruit:"#Recruitment", skill:"#Skills",
    chro:"#CHRO", automat:"#Automation", workforce:"#Workforce", salary:"#Compensation",
    pay:"#PayTransparency", divers:"#DEI", remote:"#RemoteWork", hybrid:"#HybridWork" };
  const tags = [];
  for (const [k, v] of Object.entries(m)) { if (l.includes(k) && !tags.includes(v)) tags.push(v); if (tags.length >= 3) break; }
  return tags.length ? tags : ["#TalentIntelligence"];
}

function inferIndustryTags(title) {
  const l = (title || "").toLowerCase();
  const rules = [
    [["tech","software","saas","silicon","google","amazon","microsoft","apple","meta"],"tech"],
    [["bank","financ","invest","fund","hedge","insur","fintech"],"finance"],
    [["health","pharma","hospital","medic","nhs","biotech"],"healthcare"],
    [["retail","ecommerc","shop","consumer","amazon"],"retail"],
    [["consult","deloitte","mckinsey","pwc","accenture","bcg","kpmg"],"consulting"],
    [["government","public sector","civil service","ministry","federal"],"government"],
  ];
  for (const [kws, tag] of rules) { if (kws.some(k => l.includes(k))) return [tag]; }
  return [];
}

function inferFunctionTags(title) {
  const l = (title || "").toLowerCase();
  const rules = [
    [["recruit","hiring","talent acqui","sourcing","candidate"],"talent_acquisition"],
    [["people analyt","hr analyt","workforce analyt","data-driven hr"],"people_analytics"],
    [["learning","development","l&d","training","upskill","reskill"],"learning_dev"],
    [["compensation","pay","salary","reward","benefits","total rewards"],"compensation"],
    [["chro","chief people","chief hr","cpo","executive"],"executive"],
  ];
  for (const [kws, tag] of rules) { if (kws.some(k => l.includes(k))) return [tag]; }
  return ["talent_acquisition"]; // Default — almost all our articles relate to TA in some way
}

export default async function handler(req) {
  const start = Date.now();
  console.log("═══ TIC Pulse: News Fetch Started (v3 — with audience tagging) ═══");
  try {
    const supabase = getSupabase();
    const articles = await fetchNewsArticles();
    const stored = await storeNewArticles(supabase, articles);
    const summarised = await summariseArticles(supabase);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`═══ Done: ${stored} stored, ${summarised} summarised in ${elapsed}s ═══`);
    return new Response(JSON.stringify({ ok: true, fetched: articles.length, stored, summarised, elapsed: `${elapsed}s` }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Pipeline error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export const config = { schedule: "*/30 * * * *" };

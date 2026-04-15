// -----------------------------------------------------------------
// TIC Pulse — Podcast RSS fetcher
// Scheduled via netlify.toml as `fetch-podcast` (daily 06:00 UTC).
// Ingests episodes for active sources: type = podcast, rss_url set.
// De-duplicates on (source_id, episode_guid).
// -----------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const ITEM_CAP = Math.min(
  80,
  Math.max(5, parseInt(process.env.PODCAST_RSS_ITEM_CAP || "40", 10) || 40)
);

/** Many podcast hosts return 403/429 to generic bot UAs; match a normal browser. */
const RSS_FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RSS_FETCH_TIMEOUT_MS = Math.min(
  60000,
  Math.max(8000, parseInt(process.env.PODCAST_RSS_FETCH_TIMEOUT_MS || "25000", 10) || 25000)
);

// ─── RSS helpers ───

function decodeBasicEntities(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function stripTags(s) {
  return decodeBasicEntities(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractFirst(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function extractEnclosureUrl(block) {
  const m = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function extractMediaContentUrl(block) {
  const m = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function extractItunesDuration(block) {
  const raw =
    extractFirst(block, "itunes:duration") ||
    extractFirst(block, "duration");
  return raw ? decodeBasicEntities(raw).trim() : null;
}

function parseDurationSeconds(raw) {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseRssItems(xml) {
  const items = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) items.push(m[0]);
  return items;
}

function parseItem(block) {
  const titleRaw = extractFirst(block, "title");
  const title = titleRaw ? stripTags(titleRaw) : "";
  const guidRaw = extractFirst(block, "guid");
  const guid = guidRaw ? stripTags(guidRaw).slice(0, 500) : null;
  const linkRaw = extractFirst(block, "link");
  const link = linkRaw ? stripTags(linkRaw).slice(0, 2000) : null;
  const pubRaw = extractFirst(block, "pubDate");
  let published_at = null;
  if (pubRaw) {
    const d = new Date(decodeBasicEntities(pubRaw));
    if (!Number.isNaN(d.getTime())) published_at = d.toISOString();
  }
  const descRaw = extractFirst(block, "description") || extractFirst(block, "content:encoded");
  const description = descRaw ? stripTags(descRaw).slice(0, 5000) : null;

  const audio_url =
    extractEnclosureUrl(block) || extractMediaContentUrl(block) || null;
  const durSec = parseDurationSeconds(extractItunesDuration(block));
  const duration = formatDuration(durSec);

  const episode_guid =
    guid ||
    (link ? `link:${link}` : null) ||
    (title ? `title:${title.slice(0, 200)}` : null);

  return {
    episode_guid,
    title,
    description,
    published_at,
    duration,
    duration_seconds: durSec,
    audio_url,
    link,
  };
}

function matchKeywords(text, keywords, threshold) {
  if (!keywords || keywords.length === 0)
    return { matches: [], score: 0, pass: true };
  const lower = text.toLowerCase();
  const matches = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  return {
    matches,
    score: matches.length,
    pass: matches.length >= threshold,
  };
}

// ─── Handler ───

export default async function handler() {
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Supabase URL or service key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log("[fetch-podcast] Starting RSS ingest...");

  try {
    const { data: sources, error: srcErr } = await supabase
      .from("sources")
      .select("*")
      .eq("type", "podcast")
      .eq("active", true)
      .not("rss_url", "is", null);

    if (srcErr) throw srcErr;
    if (!sources?.length) {
      return new Response(
        JSON.stringify({ message: "No active podcast sources with rss_url" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let totalNew = 0;
    let totalSkipped = 0;
    const results = [];

    for (const source of sources) {
      try {
        const feedUrl = source.rss_url;
        console.log(`[fetch-podcast] Fetching RSS: ${source.name} (${feedUrl})`);

        const res = await fetch(feedUrl, {
          headers: {
            "User-Agent": RSS_FETCH_UA,
            Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
            "Accept-Language": "en-US,en;q=0.9",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          const errMsg = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
          console.warn({
            event: "PODCAST_RSS_HTTP_ERROR",
            source: source.name,
            feedUrl: feedUrl.slice(0, 120),
            status: res.status,
          });
          results.push({
            source: source.name,
            error: errMsg,
          });
          continue;
        }

        const xml = await res.text();
        if (/<feed[\s>]/i.test(xml) && /xmlns[^>]*atom/i.test(xml)) {
          results.push({
            source: source.name,
            error: "Atom feed not supported (RSS 2.0 only)",
          });
          continue;
        }
        if (!/<rss[\s>]/i.test(xml)) {
          results.push({
            source: source.name,
            error: "Not an RSS 2.0 feed (missing <rss>)",
          });
          continue;
        }

        const rawItems = parseRssItems(xml).slice(0, ITEM_CAP);
        let sourceNew = 0;
        let sourceSkipped = 0;

        for (const block of rawItems) {
          const ep = parseItem(block);
          if (!ep.episode_guid || !ep.title) {
            sourceSkipped++;
            continue;
          }
          if (!ep.audio_url) {
            sourceSkipped++;
            continue;
          }

          const { data: existing } = await supabase
            .from("episodes")
            .select("id")
            .eq("source_id", source.id)
            .eq("episode_guid", ep.episode_guid)
            .maybeSingle();

          if (existing) {
            sourceSkipped++;
            continue;
          }

          const searchText = `${ep.title} ${ep.description || ""}`;
          let keyword_matches = [];
          let keyword_score = 0;
          if (source.pull_mode === "keyword" && source.keywords?.length > 0) {
            const kw = matchKeywords(
              searchText,
              source.keywords,
              source.keyword_threshold || 2
            );
            if (!kw.pass) {
              sourceSkipped++;
              continue;
            }
            keyword_matches = kw.matches;
            keyword_score = kw.score;
          }

          const { error: insertErr } = await supabase.from("episodes").insert({
            source_id: source.id,
            episode_guid: ep.episode_guid,
            title: ep.title.slice(0, 500),
            description: ep.description,
            published_at: ep.published_at,
            duration: ep.duration,
            duration_seconds: ep.duration_seconds,
            audio_url: ep.audio_url,
            link: ep.link,
            keyword_matches,
            keyword_score,
          });

          if (insertErr) {
            if (insertErr.code === "23505") sourceSkipped++;
            else
              console.error(
                `[fetch-podcast] Insert error ${source.name}:`,
                insertErr.message
              );
          } else {
            sourceNew++;
          }
        }

        await supabase
          .from("sources")
          .update({ last_fetched_at: new Date().toISOString() })
          .eq("id", source.id);

        totalNew += sourceNew;
        totalSkipped += sourceSkipped;
        results.push({
          source: source.name,
          tier: source.tier,
          new: sourceNew,
          skipped: sourceSkipped,
          itemsSeen: rawItems.length,
        });
        console.log(
          `[fetch-podcast] ${source.name}: ${sourceNew} new, ${sourceSkipped} skipped`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[fetch-podcast] Error ${source.name}:`, msg);
        results.push({ source: source.name, error: msg });
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      sourcesProcessed: sources.length,
      totalNew,
      totalSkipped,
      itemCap: ITEM_CAP,
      results,
    };
    console.log("[fetch-podcast] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fetch-podcast] Fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

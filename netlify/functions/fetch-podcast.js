// ═══════════════════════════════════════════════════════════════
//  TIC PULSE — Podcast RSS Fetcher
//  Scheduled Netlify function: runs daily at 06:00 UTC
//  Fetches new episodes from all active podcast sources,
//  applies keyword filtering for Tier S sources,
//  and stores in Supabase.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── RSS Parser ───
// Lightweight XML parsing without external dependencies
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, "title"),
      description: stripHtml(
        extractTag(block, "description") ||
          extractTag(block, "itunes:summary") ||
          extractTag(block, "content:encoded") ||
          ""
      ),
      guid:
        extractTag(block, "guid") ||
        extractTag(block, "link") ||
        extractTag(block, "enclosure", "url"),
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      duration:
        extractTag(block, "itunes:duration") || null,
      audioUrl: extractTag(block, "enclosure", "url"),
      image:
        extractTag(block, "itunes:image", "href") || null,
    });
  }

  return items;
}

function extractTag(xml, tag, attr) {
  if (attr) {
    // Extract attribute value from self-closing or regular tag
    const regex = new RegExp(
      `<${tag}[^>]*?${attr}=["']([^"']+)["']`,
      "i"
    );
    const m = regex.exec(xml);
    return m ? m[1] : null;
  }
  // Extract tag content, handling CDATA
  const regex = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    "i"
  );
  const m = regex.exec(xml);
  return m ? m[1].trim() : null;
}

function stripHtml(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Duration Parser ───
// Handles "42:15", "1:22:45", "2553" (seconds), "PT42M15S" (ISO 8601)
function parseDuration(raw) {
  if (!raw) return { display: null, seconds: null };

  // ISO 8601: PT1H22M45S
  const iso = raw.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (iso) {
    const h = parseInt(iso[1] || 0);
    const m = parseInt(iso[2] || 0);
    const s = parseInt(iso[3] || 0);
    const total = h * 3600 + m * 60 + s;
    const display = h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
    return { display, seconds: total };
  }

  // HH:MM:SS or MM:SS
  if (raw.includes(":")) {
    const parts = raw.split(":").map(Number);
    if (parts.length === 3) {
      const total = parts[0] * 3600 + parts[1] * 60 + parts[2];
      return { display: raw, seconds: total };
    }
    if (parts.length === 2) {
      const total = parts[0] * 60 + parts[1];
      return { display: raw, seconds: total };
    }
  }

  // Plain seconds
  const secs = parseInt(raw);
  if (!isNaN(secs)) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const display = h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
    return { display, seconds: secs };
  }

  return { display: raw, seconds: null };
}

// ─── Keyword Matcher ───
function matchKeywords(text, keywords, threshold) {
  if (!keywords || keywords.length === 0) return { matches: [], score: 0, pass: true };

  const lower = text.toLowerCase();
  const matches = keywords.filter((kw) =>
    lower.includes(kw.toLowerCase())
  );

  return {
    matches,
    score: matches.length,
    pass: matches.length >= threshold,
  };
}

// ─── Guest Extractor ───
// Attempts to parse guest name from common podcast title formats
// e.g. "Building TI with Kim Bryan (AMS)" → { name: "Kim Bryan", org: "AMS" }
// e.g. "Ep 57: Title — with Guest Name" → { name: "Guest Name" }
function extractGuest(title) {
  // Pattern: "with Guest Name (Org)"
  let m = title.match(/with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)\s*\(([^)]+)\)/i);
  if (m) return { name: m[1].trim(), org: m[2].trim() };

  // Pattern: "with Guest Name, Org"
  m = title.match(/with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+),\s*([^,]+?)(?:\s*[-–|]|$)/i);
  if (m) return { name: m[1].trim(), org: m[2].trim() };

  // Pattern: "with Guest Name" (no org)
  m = title.match(/with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)/i);
  if (m) return { name: m[1].trim(), org: null };

  // Pattern: "Guest Name — Title" or "Guest Name - Title"
  m = title.match(/^(?:Ep\.?\s*\d+:?\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+)+)\s*[-–—]\s*/);
  if (m) return { name: m[1].trim(), org: null };

  return { name: null, org: null };
}

// ─── Main Handler ───
export default async function handler(req) {
  console.log("[fetch-podcasts] Starting podcast fetch...");

  try {
    // Get all active podcast sources
    const { data: sources, error: srcErr } = await supabase
      .from("sources")
      .select("*")
      .eq("type", "podcast")
      .eq("active", true)
      .not("rss_url", "is", null);

    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ message: "No active podcast sources with RSS URLs" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[fetch-podcasts] Processing ${sources.length} podcast sources`);

    let totalNew = 0;
    let totalSkipped = 0;
    let totalFiltered = 0;
    const results = [];

    for (const source of sources) {
      try {
        console.log(`[fetch-podcasts] Fetching: ${source.name}`);

        // Fetch RSS feed
        const response = await fetch(source.rss_url, {
          headers: { "User-Agent": "TIC-Pulse/1.0" },
        });

        if (!response.ok) {
          console.error(`[fetch-podcasts] HTTP ${response.status} for ${source.name}`);
          results.push({ source: source.name, error: `HTTP ${response.status}` });
          continue;
        }

        const xml = await response.text();
        const items = parseRSS(xml);

        console.log(`[fetch-podcasts] ${source.name}: parsed ${items.length} items`);

        let sourceNew = 0;
        let sourceSkipped = 0;
        let sourceFiltered = 0;

        for (const item of items.slice(0, 50)) {
          // Skip if no guid
          if (!item.guid) continue;

          // Check if already exists
          const { data: existing } = await supabase
            .from("episodes")
            .select("id")
            .eq("guid", item.guid)
            .maybeSingle();

          if (existing) {
            sourceSkipped++;
            continue;
          }

          // Keyword filtering for Tier S sources
          if (source.pull_mode === "keyword" && source.keywords?.length > 0) {
            const searchText = `${item.title || ""} ${item.description || ""}`;
            const kwResult = matchKeywords(searchText, source.keywords, source.keyword_threshold || 2);

            if (!kwResult.pass) {
              sourceFiltered++;
              continue;
            }

            // Store match data for included episodes
            item._keywordMatches = kwResult.matches;
            item._keywordScore = kwResult.score;
          }

          // Parse duration
          const dur = parseDuration(item.duration);

          // Extract guest
          const guest = extractGuest(item.title || "");

          // Parse publish date
          let publishedAt = null;
          try {
            publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null;
          } catch (e) {
            publishedAt = null;
          }

          // Insert episode
          const { error: insertErr } = await supabase.from("episodes").insert({
            source_id: source.id,
            guid: item.guid,
            title: item.title || "Untitled Episode",
            description: (item.description || "").substring(0, 5000),
            published_at: publishedAt,
            duration: dur.display,
            duration_seconds: dur.seconds,
            audio_url: item.audioUrl,
            link: item.link,
            image_url: item.image,
            guest_name: guest.name,
            guest_org: guest.org,
            keyword_matches: item._keywordMatches || [],
            keyword_score: item._keywordScore || 0,
          });

          if (insertErr) {
            // Likely duplicate guid race condition — skip
            if (insertErr.code === "23505") {
              sourceSkipped++;
            } else {
              console.error(`[fetch-podcasts] Insert error for ${source.name}:`, insertErr.message);
            }
          } else {
            sourceNew++;
          }
        }

        // Update last_fetched_at
        await supabase
          .from("sources")
          .update({ last_fetched_at: new Date().toISOString() })
          .eq("id", source.id);

        totalNew += sourceNew;
        totalSkipped += sourceSkipped;
        totalFiltered += sourceFiltered;

        results.push({
          source: source.name,
          tier: source.tier,
          new: sourceNew,
          skipped: sourceSkipped,
          filtered: sourceFiltered,
        });

        console.log(
          `[fetch-podcasts] ${source.name}: ${sourceNew} new, ${sourceSkipped} existing, ${sourceFiltered} keyword-filtered`
        );
      } catch (err) {
        console.error(`[fetch-podcasts] Error processing ${source.name}:`, err.message);
        results.push({ source: source.name, error: err.message });
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      sourcesProcessed: sources.length,
      totalNew,
      totalSkipped,
      totalFiltered,
      results,
    };

    console.log("[fetch-podcasts] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[fetch-podcasts] Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── Schedule: daily at 06:00 UTC ───
export const config = {
  schedule: "0 6 * * *",
};

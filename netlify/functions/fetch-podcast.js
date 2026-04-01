// ═══════════════════════════════════════════════════════════════
//  TIC PULSE — YouTube Channel Fetcher
//  Scheduled Netlify function: runs daily at 06:30 UTC
//  Fetches new videos from all active YouTube channel sources
//  via YouTube Data API v3, applies keyword filtering for
//  Tier S sources, and stores in Supabase.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_BASE = "https://www.googleapis.com/youtube/v3";

// ─── YouTube API Helpers ───

// Get the uploads playlist ID for a channel
async function getUploadsPlaylist(channelId) {
  const url = `${YT_BASE}/channels?part=contentDetails&id=${channelId}&key=${YT_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.items || data.items.length === 0) return null;
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

// Get ALL videos from a playlist (paginates through entire history)
async function getPlaylistItems(playlistId) {
  const allItems = [];
  let pageToken = null;

  do {
    let url = `${YT_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${YT_API_KEY}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.items) break;

    for (const item of data.items) {
      allItems.push({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
        thumbnail:
          item.snippet.thumbnails?.maxres?.url ||
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url,
      });
    }

    pageToken = data.nextPageToken || null;
    console.log(`[fetch-youtube] Fetched page, ${allItems.length} videos so far...`);
  } while (pageToken);

  return allItems;
}

// Get video details (duration, stats) for a batch of video IDs
async function getVideoDetails(videoIds) {
  if (videoIds.length === 0) return {};

  // YouTube API accepts max 50 IDs per request
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const details = {};
  for (const chunk of chunks) {
    const url = `${YT_BASE}/videos?part=contentDetails,statistics&id=${chunk.join(",")}&key=${YT_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.items) {
      for (const item of data.items) {
        details[item.id] = {
          duration: item.contentDetails.duration, // ISO 8601
          viewCount: parseInt(item.statistics.viewCount || 0),
          likeCount: parseInt(item.statistics.likeCount || 0),
          commentCount: parseInt(item.statistics.commentCount || 0),
        };
      }
    }
  }

  return details;
}

// ─── Duration Parser (ISO 8601) ───
function parseIsoDuration(iso) {
  if (!iso) return { display: null, seconds: null };

  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return { display: iso, seconds: null };

  const h = parseInt(m[1] || 0);
  const min = parseInt(m[2] || 0);
  const s = parseInt(m[3] || 0);
  const total = h * 3600 + min * 60 + s;

  let display;
  if (h > 0) {
    display = `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  } else {
    display = `${min}:${String(s).padStart(2, "0")}`;
  }

  return { display, seconds: total };
}

// ─── Video Type Detection ───
function detectVideoType(title, durationSeconds) {
  const lower = title.toLowerCase();

  // Shorts: under 61 seconds
  if (durationSeconds && durationSeconds <= 61) return "short";

  // Panel/roundtable
  if (lower.includes("panel") || lower.includes("roundtable") || lower.includes("debate"))
    return "panel";

  // Event/conference recordings
  if (
    lower.includes("jamboree") ||
    lower.includes("keynote") ||
    lower.includes("conference") ||
    lower.includes("summit") ||
    lower.includes("event")
  )
    return "event";

  // Podcast episodes
  if (
    lower.includes("podcast") ||
    lower.includes("episode") ||
    lower.match(/ep\.?\s*\d/) ||
    lower.includes("interview with")
  )
    return "podcast";

  return "video";
}

// ─── Keyword Matcher ───
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

// ─── Main Handler ───
export default async function handler(req) {
  if (!YT_API_KEY) {
    return new Response(
      JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log("[fetch-youtube] Starting YouTube fetch...");

  try {
    // Get all active YouTube sources
    const { data: sources, error: srcErr } = await supabase
      .from("sources")
      .select("*")
      .eq("type", "youtube")
      .eq("active", true)
      .not("youtube_channel_id", "is", null);

    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active YouTube sources with channel IDs" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[fetch-youtube] Processing ${sources.length} YouTube channels`);

    let totalNew = 0;
    let totalSkipped = 0;
    let totalFiltered = 0;
    const results = [];

    for (const source of sources) {
      try {
        console.log(`[fetch-youtube] Fetching: ${source.name}`);

        // Get or resolve uploads playlist
        let playlistId = source.youtube_uploads_playlist;
        if (!playlistId) {
          playlistId = await getUploadsPlaylist(source.youtube_channel_id);
          if (!playlistId) {
            console.error(`[fetch-youtube] No uploads playlist for ${source.name}`);
            results.push({ source: source.name, error: "No uploads playlist found" });
            continue;
          }
          // Cache the playlist ID
          await supabase
            .from("sources")
            .update({ youtube_uploads_playlist: playlistId })
            .eq("id", source.id);
        }

        // Fetch recent videos
        const videos = await getPlaylistItems(playlistId);
        console.log(`[fetch-youtube] ${source.name}: found ${videos.length} videos`);

        // Filter out already-stored videos
        const newVideoIds = [];
        for (const video of videos) {
          const { data: existing } = await supabase
            .from("videos")
            .select("id")
            .eq("youtube_id", video.videoId)
            .maybeSingle();

          if (!existing) {
            newVideoIds.push(video.videoId);
          }
        }

        if (newVideoIds.length === 0) {
          results.push({ source: source.name, new: 0, skipped: videos.length });
          totalSkipped += videos.length;
          continue;
        }

        // Get details for new videos
        const details = await getVideoDetails(newVideoIds);

        let sourceNew = 0;
        let sourceFiltered = 0;

        for (const video of videos) {
          if (!newVideoIds.includes(video.videoId)) continue;

          const detail = details[video.videoId] || {};
          const dur = parseIsoDuration(detail.duration);

          // Keyword filtering for Tier S sources
          if (source.pull_mode === "keyword" && source.keywords?.length > 0) {
            const searchText = `${video.title || ""} ${video.description || ""}`;
            const kwResult = matchKeywords(
              searchText,
              source.keywords,
              source.keyword_threshold || 2
            );

            if (!kwResult.pass) {
              sourceFiltered++;
              totalFiltered++;
              continue;
            }

            video._keywordMatches = kwResult.matches;
            video._keywordScore = kwResult.score;
          }

          // Detect video type
          const videoType = detectVideoType(video.title, dur.seconds);

          // Insert video
          const { error: insertErr } = await supabase.from("videos").insert({
            source_id: source.id,
            youtube_id: video.videoId,
            title: video.title,
            description: (video.description || "").substring(0, 5000),
            published_at: video.publishedAt,
            duration: dur.display,
            duration_seconds: dur.seconds,
            thumbnail_url: video.thumbnail,
            channel_title: video.channelTitle,
            view_count: detail.viewCount || 0,
            like_count: detail.likeCount || 0,
            comment_count: detail.commentCount || 0,
            video_type: videoType,
            keyword_matches: video._keywordMatches || [],
            keyword_score: video._keywordScore || 0,
          });

          if (insertErr) {
            if (insertErr.code === "23505") {
              // Duplicate — race condition
            } else {
              console.error(
                `[fetch-youtube] Insert error for ${video.title}:`,
                insertErr.message
              );
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
        totalSkipped += videos.length - newVideoIds.length;

        results.push({
          source: source.name,
          tier: source.tier,
          new: sourceNew,
          skipped: videos.length - newVideoIds.length,
          filtered: sourceFiltered,
        });

        console.log(
          `[fetch-youtube] ${source.name}: ${sourceNew} new, ${videos.length - newVideoIds.length} existing, ${sourceFiltered} keyword-filtered`
        );
      } catch (err) {
        console.error(`[fetch-youtube] Error processing ${source.name}:`, err.message);
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

    console.log("[fetch-youtube] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[fetch-youtube] Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── Schedule: daily at 06:30 UTC ───
export const config = {
  schedule: "0 6 * * *",
};

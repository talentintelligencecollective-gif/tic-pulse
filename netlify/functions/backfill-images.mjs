// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Image Backfill
//  Scrapes og:image for articles missing images or stuck on Google
//  News placeholder thumbnails. Run via:
//  curl https://your-site.netlify.app/.netlify/functions/backfill-images
//  Processes 50 articles per run to avoid Netlify timeout.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import {
  extractOgImageFromHtml,
  isGoogleNewsBoilerplateImage,
  resolvePublisherArticleUrl,
} from "./lib/article-image.mjs";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = 50;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function isValidImageUrl(url) {
  if (!url || url.length < 20) return false;
  if (url.includes("1x1") || url.includes("pixel") || url.includes("tracking")) return false;
  if (url.includes("favicon") || url.includes("icon-")) return false;
  if (!url.startsWith("http")) return false;
  return true;
}

async function scrapeImageFromPublisherUrl(pageUrl) {
  try {
    if (!pageUrl || pageUrl.includes("news.google.com")) return null;
    const r = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const html = await r.text();

    const image = extractOgImageFromHtml(html);
    if (!image || !isValidImageUrl(image) || isGoogleNewsBoilerplateImage(image)) return null;

    if (!image.startsWith("http")) {
      try {
        return new URL(image, pageUrl).href;
      } catch {
        return null;
      }
    }

    return image;
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const start = Date.now();
  console.log("═══ Image Backfill Started ═══");

  try {
    const supabase = getSupabase();

    // Rows with no image or Google News CDN placeholder thumbnails
    const { data: articles, error } = await supabase
      .from("articles")
      .select("id, gdelt_url, article_url, title")
      .eq("summarised", true)
      .or(
        "image_url.is.null,image_url.ilike.%googleusercontent.com%,image_url.ilike.%ggpht.com%"
      )
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!articles?.length) {
      return new Response(JSON.stringify({ ok: true, message: "No articles to backfill", processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }

    console.log(`Processing ${articles.length} articles needing images...`);
    let found = 0;
    let failed = 0;

    for (const article of articles) {
      let targetUrl = article.article_url || null;
      let resolvedFromDecode = null;
      if (!targetUrl && article.gdelt_url?.includes("news.google.com")) {
        const decoded = await resolvePublisherArticleUrl(article.gdelt_url);
        if (decoded.ok && decoded.url) {
          targetUrl = decoded.url;
          resolvedFromDecode = decoded.url;
        }
      }
      if (!targetUrl) targetUrl = article.gdelt_url;

      if (!targetUrl || targetUrl.includes("news.google.com")) {
        failed++;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const image = await scrapeImageFromPublisherUrl(targetUrl);
      if (image) {
        const row = { image_url: image };
        if (resolvedFromDecode && !article.article_url) row.article_url = resolvedFromDecode;
        const { error: updateErr } = await supabase.from("articles").update(row).eq("id", article.id);
        if (!updateErr) {
          found++;
          console.log(`✓ Found image for: ${article.title.slice(0, 50)}`);
        }
      } else {
        failed++;
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const result = { ok: true, processed: articles.length, imagesFound: found, failed, elapsed: `${elapsed}s` };
    console.log(`═══ Backfill done: ${found} images found out of ${articles.length} articles in ${elapsed}s ═══`);

    return new Response(JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Backfill error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

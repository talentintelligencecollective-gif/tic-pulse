// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Image Backfill (one-time use)
//  Attempts to scrape og:image for articles missing images.
//  Run via: curl https://your-site.netlify.app/.netlify/functions/backfill-images
//  Processes 50 articles per run to avoid Netlify timeout.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

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

function decodeEntities(t) {
  return t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "");
}

function extractMeta(html, attr) {
  const p1 = new RegExp(`<meta\\s+[^>]*${attr}[^>]*content=["']([^"']{10,500})["']`, "i");
  const p2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']{10,500})["'][^>]*${attr}`, "i");
  const m = html.match(p1) || html.match(p2);
  return m ? decodeEntities(m[1].trim()) : null;
}

async function scrapeImage(url) {
  try {
    if (url.includes("news.google.com")) return null;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TIC-Pulse/1.0)", "Accept": "text/html" },
      redirect: "follow", signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const html = await r.text();

    const image = extractMeta(html, 'property="og:image"')
      || extractMeta(html, 'name="twitter:image"')
      || extractMeta(html, 'name="twitter:image:src"')
      || extractMeta(html, 'property="og:image:url"')
      || extractMeta(html, 'itemprop="image"');

    if (!image || !isValidImageUrl(image)) return null;

    // Ensure absolute URL
    if (!image.startsWith("http")) {
      try { return new URL(image, url).href; }
      catch { return null; }
    }

    return image;
  } catch { return null; }
}

export default async function handler(req) {
  const start = Date.now();
  console.log("═══ Image Backfill Started ═══");

  try {
    const supabase = getSupabase();

    // Get articles without images, most recent first
    const { data: articles, error } = await supabase
      .from("articles")
      .select("id, gdelt_url, title")
      .is("image_url", null)
      .eq("summarised", true)
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!articles?.length) {
      return new Response(JSON.stringify({ ok: true, message: "No articles to backfill", processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }

    console.log(`Processing ${articles.length} articles without images...`);
    let found = 0;
    let failed = 0;

    for (const article of articles) {
      const image = await scrapeImage(article.gdelt_url);
      if (image) {
        const { error: updateErr } = await supabase
          .from("articles")
          .update({ image_url: image })
          .eq("id", article.id);
        if (!updateErr) {
          found++;
          console.log(`✓ Found image for: ${article.title.slice(0, 50)}`);
        }
      } else {
        failed++;
      }

      // Small delay to avoid hammering external servers
      await new Promise(r => setTimeout(r, 200));
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

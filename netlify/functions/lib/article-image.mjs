// ═══════════════════════════════════════════════════════════════
//  Shared helpers: Google News image denylist + publisher URL decode
//  Modern RSS uses /rss/articles/<token>; gdelt_url stays on news.google.com
//  until decoded (verified: decoder resolves to publisher article URL).
//
//  Use a static import (not createRequire): Netlify esbuild must see the
//  dependency or it will not ship google-news-url-decoder in the bundle.
// ═══════════════════════════════════════════════════════════════

import { GoogleDecoder } from "google-news-url-decoder";

const decoder = new GoogleDecoder();

/** Thumbnails on these hosts are Google News cards, not publisher og:image (any lh* subdomain). */
export function isGoogleNewsBoilerplateImage(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  if (u.includes("googleusercontent.com")) return true;
  if (u.includes("ggpht.com")) return true;
  return false;
}

/**
 * Decodes a Google News article URL to the publisher article URL when possible.
 * @returns {{ ok: true, url: string } | { ok: false, url: null, message: string }}
 */
export async function resolvePublisherArticleUrl(googleNewsUrl) {
  if (!googleNewsUrl || typeof googleNewsUrl !== "string") {
    return { ok: false, url: null, message: "missing_url" };
  }
  if (!googleNewsUrl.includes("news.google.com")) {
    return { ok: true, url: googleNewsUrl };
  }
  try {
    const result = await decoder.decode(googleNewsUrl);
    if (result.status && result.decoded_url) {
      return { ok: true, url: result.decoded_url };
    }
    const message =
      typeof result.message === "string" ? result.message : "decode_failed";
    return { ok: false, url: null, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, url: null, message };
  }
}

function decodeEntities(t) {
  return t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Extract og:image / twitter:image from raw HTML (order-agnostic meta tags). */
export function extractOgImageFromHtml(html) {
  if (!html) return null;
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      let raw = decodeEntities(m[1].trim());
      if (raw.startsWith("//")) raw = `https:${raw}`;
      if (raw.startsWith("http")) return raw;
    }
  }
  return null;
}

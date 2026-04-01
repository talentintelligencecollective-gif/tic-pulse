// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Substack RSS Proxy
//  Fetches the TIC Substack feed and returns parsed JSON
//  Called by the Discover tab in the frontend
// ═══════════════════════════════════════════════════════════════

const SUBSTACK_FEED = "https://talentintelligencecollective.substack.com/feed";

export default async function handler() {
  try {
    const response = await fetch(SUBSTACK_FEED, {
      headers: {
        "User-Agent": "TIC-Pulse/1.0",
        "Accept": "application/xml, text/xml, application/rss+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `Substack returned ${response.status}` }),
        { status: 502, headers: corsHeaders() }
      );
    }

    const xml = await response.text();
    const articles = parseRss(xml);

    return new Response(
      JSON.stringify({ ok: true, articles }),
      { status: 200, headers: corsHeaders() }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=900", // cache for 15 minutes
  };
}

function parseRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const x = match[1];

    const title = extractTag(x, "title");
    const link = extractTag(x, "link");
    const pubDate = extractTag(x, "pubDate");
    const description = extractTag(x, "description");
    const creator = extractTag(x, "dc:creator");

    // Extract cover image from enclosure or content
    const enclosure = x.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const contentImg = x.match(/<img[^>]+src=["']([^"']+)["']/i);
    const image = enclosure ? enclosure[1] : contentImg ? contentImg[1] : null;

    if (title && link) {
      // Clean the description — strip HTML, truncate
      const cleanDesc = description
        ? description.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)
        : "";

      items.push({
        title: decode(title),
        url: decode(link),
        description: cleanDesc,
        author: creator ? decode(creator) : "TIC",
        image,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      });
    }
  }

  return items;
}

function extractTag(xml, tag) {
  // CDATA
  const cd = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const m1 = xml.match(cd);
  if (m1) return m1[1].trim();
  // Regular
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m2 = xml.match(re);
  return m2 ? m2[1].trim() : null;
}

function decode(t) {
  return t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "");
}

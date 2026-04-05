// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Substack Fetcher (v2)
//  Uses Substack's archive API instead of RSS for full history.
//  On-demand Netlify function (called by the TIC Digest tab).
//
//  The RSS feed (/feed) only returns ~10-20 most recent posts.
//  The archive API (/api/v1/archive) supports pagination and
//  returns the complete post history.
// ═══════════════════════════════════════════════════════════════

const SUBSTACK_URL = "https://talentintelligencecollective.substack.com";
const MAX_POSTS = 200; // Safety cap — adjust if TIC has more than this
const PAGE_SIZE = 25;  // Substack returns up to 25 per request

export default async function handler(req) {
  try {
    const allPosts = [];
    let offset = 0;
    let hasMore = true;

    // Paginate through the archive API
    while (hasMore && offset < MAX_POSTS) {
      const url = `${SUBSTACK_URL}/api/v1/archive?sort=new&search=&offset=${offset}&limit=${PAGE_SIZE}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "TIC-Pulse/1.0",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`Substack API ${response.status} at offset ${offset}`);
        break;
      }

      const posts = await response.json();

      if (!Array.isArray(posts) || posts.length === 0) {
        hasMore = false;
        break;
      }

      for (const post of posts) {
        allPosts.push({
          title: post.title || "",
          description: post.subtitle || post.description || "",
          url: post.canonical_url || `${SUBSTACK_URL}/p/${post.slug}`,
          publishedAt: post.post_date || null,
          coverImage: post.cover_image || null,
          wordCount: post.wordcount || null,
          type: post.type || "newsletter",
          audience: post.audience || "everyone", // "everyone" | "only_paid"
        });
      }

      console.log(`Fetched ${posts.length} posts at offset ${offset} (total: ${allPosts.length})`);

      // If we got fewer than PAGE_SIZE, we've reached the end
      if (posts.length < PAGE_SIZE) {
        hasMore = false;
      }

      offset += PAGE_SIZE;
    }

    // Filter out podcast-only posts if desired (keep all for now)
    // const articles = allPosts.filter(p => p.type !== "podcast");

    console.log(`TIC Digest: ${allPosts.length} total posts fetched from Substack archive`);

    return new Response(
      JSON.stringify({
        ok: true,
        articles: allPosts,
        count: allPosts.length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          // Cache for 1 hour — the archive doesn't change that often
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err) {
    console.error("Substack fetch error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

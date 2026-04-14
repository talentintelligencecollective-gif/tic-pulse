# TIC Pulse — schema inventory (code-derived)

**Generated for agent reuse.** When the Cursor Supabase MCP is linked to a different project, treat this file plus `supabase/migrations/` as the contract for a **fresh** TIC Pulse database.

## MCP / live DB note

`list_tables` against the configured **user-supabase** MCP returned **no TIC Pulse tables** (no `articles`, `profiles`, etc.). Inventory below is **reverse-engineered from this repository** and must be validated against production before cutover.

## Tables referenced in application code

| Table | Referenced from |
|-------|-----------------|
| `articles` | `fetch-gdelt.mjs`, `backfill-images.mjs`, `SearchOverlay.jsx` |
| `articles_feed` | view; `supabase.js`, `SearchOverlay.jsx` |
| `article_engagement` | `supabase-schema.sql`, `fetch-gdelt.mjs` |
| `profiles` | `AuthPage`, `SettingsPage`, `NewsletterBuilder`, `generate-user-profile.js`, `supabase.js` |
| `user_profiles` | `SettingsPage`, `generate-user-profile.js` |
| `user_engagement` | `App.jsx`, `ArticleCard.jsx`, `NewsletterBuilder.jsx` |
| `user_streaks` | `supabase.js` |
| `comments` | `ArticleCard.jsx` |
| `sources` | `fetch-youtube.js`, `useMultimedia.js`, `App.jsx` |
| `videos` | `fetch-youtube.js`, `App.jsx`, `WatchTab`/`SearchOverlay` |
| `episodes` | `useMultimedia.js`, `App.jsx`, `SearchOverlay.jsx`, `ListenTab.jsx` |
| `brand_guidelines` | `NewsletterBuilder.jsx` |
| `audio_briefings` | `generate-audio-briefing.js`, `cleanup-audio.js` |

## Storage buckets

| Bucket | Usage |
|--------|--------|
| `audio-briefings` | MP3 uploads from `generate-audio-briefing.js` (public URLs) |

## RPCs referenced

| RPC | Args (from code) | Call sites |
|-----|------------------|------------|
| `fetch_balanced_feed` | `feed_limit` | `supabase.js` → `fetchArticles` |
| `increment_engagement` | `p_article_id`, `p_field`, `p_delta` | `supabase.js` |
| `update_user_streak` | `p_user_id` | `supabase.js` → `updateStreak` |
| `increment_streak_counter` | `p_user_id`, `p_field`, `p_delta` | `supabase.js` |
| `article_category_counts` | _(none)_ | added in migration for `fetchCategoryCounts` |

## Netlify functions → Supabase

| Function | Tables / storage |
|----------|------------------|
| `fetch-gdelt.mjs` | `articles`, `article_engagement` |
| `fetch-youtube.js` | `sources`, `videos` |
| `fetch-podcast.js` | `sources`, `episodes` (RSS; must not duplicate YouTube) |
| `backfill-images.mjs` | `articles` |
| `generate-user-profile.js` | `profiles`, `user_profiles` |
| `generate-audio-briefing.js` | `audio_briefings`, storage `audio-briefings` |
| `cleanup-audio.js` | `audio_briefings`, storage `audio-briefings` |
| `fetch-substack.mjs` | _(none — returns JSON only)_ |
| `send-newsletter.js` | _(verify — may use external mail only)_ |

## Inferred column shapes (episodes / sources / videos)

Derived from inserts/selects in `fetch-youtube.js`, `ListenTab.jsx`, `useMultimedia.js`, and `generate-user-profile.js`. See `supabase/migrations/00000000000000_initial_schema.sql` for canonical DDL.

## Repository defects discovered during inventory

- `src/useMultimedia.js` and `src/SearchOverlay.jsx` import `./supabaseClient`, which **does not exist** in the repo (build break unless fixed).
- `fetch-podcast.js` was a **duplicate** of `fetch-youtube.js` (wrong filename / wrong scheduled job name in `netlify.toml`).

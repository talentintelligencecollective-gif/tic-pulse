# TIC Pulse — agent technical audit

**Purpose:** Single source of truth for code review, refactors, and parallel agents. **No sugar-coating.**

**Stack:** Vite 6 + React 18 (migrating to TypeScript), Netlify Functions (Node 20), Supabase (Postgres + Auth + Storage), external APIs (Anthropic, OpenAI TTS, YouTube Data API, Brevo, GDELT/RSS).

---

## 1. Executive verdict

The product **can** run in production (there is a live Netlify app), but the repository is **not professionally maintainable** as-is: incomplete schema in git, duplicate serverless code, broken import paths, inconsistent function handlers, aggressive scheduled workloads (cost + timeout risk), and **no automated tests**. The dominant cost and reliability risks are **Anthropic usage in `fetch-gdelt.mjs` (every 5 minutes)** and **unbounded YouTube playlist pagination**. Security posture is **unknown** for RLS on production until compared to `supabase/migrations/00000000000000_initial_schema.sql`.

---

## 2. Repository and reproducibility

| Issue | Detail |
|--------|--------|
| **Schema drift** | Only partial SQL existed in git (`supabase-schema.sql`, `supabase-profiles.sql`). Tables used by the app (`sources`, `videos`, `episodes`, `comments`, `user_engagement`, `user_streaks`, `user_profiles`, `brand_guidelines`, `audio_briefings`) were **not** in repo. **Mitigation:** canonical migration added under `supabase/migrations/`. |
| **MCP mismatch** | Configured Supabase MCP `list_tables` returned a **different product’s** schema (no `articles`). Treat MCP as **untrusted for TIC Pulse** until the correct project is linked. |
| **README lies** | README still describes a 30-minute GDELT cadence; `netlify.toml` and code use **5 minutes**. |
| **Nested directory** | Workspace may appear as `tic-pulse-main/tic-pulse-main/` — standardise repo root for CI. |
| **Newsletter sentinel FK** | `NewsletterBuilder` upserts `user_engagement` with `article_id =00000000-0000-0000-0000-000000000000`. This **requires** a matching `articles` row or no FK. Migration inserts a **non-feed** sentinel article (`active = false`). |

---

## 3. Netlify Functions

| Severity | Finding |
|----------|---------|
| **P0** | `fetch-podcast.js` was a **byte-for-byte duplicate** of the YouTube fetcher (wrong file). Scheduled name in `netlify.toml` was `fetch-podcasts` (plural) vs file `fetch-podcast` → **schedule likely never ran**. **Fixed:** podcast function replaced with RSS ingestion; schedule key aligned. |
| **P1** | `fetch-gdelt.mjs` declared `export const config = { schedule }` **and** `netlify.toml` schedules the same function → redundant. **Fixed:** removed inline schedule from function. |
| **P1** | `send-newsletter.js` uses **named** `export async function handler`; others use **default** → inconsistent for generators/docs. |
| **P1** | `send-newsletter.js` checks `Authorization: Bearer` **exists** but does **not verify JWT** with Supabase — trivially spoofable if endpoint is discovered. |
| **P2** | Server code uses `VITE_SUPABASE_URL` — works but blurs client/server env naming. Prefer `SUPABASE_URL` on server with `VITE_` only on client. |
| **Cost** | `fetch-gdelt.mjs`: RSS + Claude summarisation every5 minutes. **Mitigation:** env-capped batch sizes (see code changes). |
| **Quota** | `getPlaylistItems` paginated **entire** playlists. **Mitigation:** `YT_MAX_PLAYLIST_PAGES` cap (default 5). |

---

## 4. Frontend

| Severity | Finding |
|----------|---------|
| **P0** | `useMultimedia.js` and `SearchOverlay.jsx` imported `./supabaseClient` which **did not exist** → build failure. **Fixed:** `supabaseClient.ts` added. |
| **P1** | `App.jsx` monolith (~1.4k lines) mixes auth, feed, discover, watch, listen, newsletter, audio, settings. Hard to test. **Mitigation:** split into `src/app/` modules (see refactor). |
| **P1** | Loads **many** articles/videos client-side then filters in memory. **Mitigation:** lower default feed limit + `article_category_counts` RPC. |
| **P2** | `fetchCategoryCounts` previously pulled **all** categories from the feed. **Fixed:** RPC `article_category_counts`. |
| **P2** | Stale/duplicate comments (e.g. 7-day vs 14-day freshness). Single constant now in `src/constants/feed.ts`. |
| **P2** | No runtime validation of Supabase rows — **Zod** added at primary boundaries (`env`, article rows from feed). |

---

## 5. Auth and data model

| Issue | Detail |
|--------|--------|
| **Double profile path** | `AuthPage` upserts `profiles` while SQL trigger `handle_new_user` also inserts — race/redundant. Consider client upsert **or** trigger, not both. |
| **Engagement** | Denormalised `article_engagement` + per-user `user_engagement` — invariants must hold when toggling likes (RPC + upsert). |

---

## 6. Observability

Structured logging is **absent** (console only). No correlation IDs. Netlify function logs are the only trail.

---

## 7. Live app checklist (manual)

- [ ] Sign up / email confirmation (depends on Supabase settings)
- [ ] Feed loads after `fetch-gdelt` has populated data
- [ ] Like / bookmark / comment
- [ ] Watch / Listen tabs (sources + multimedia)
- [ ] Newsletter builder + Brevo send (env: `BREVO_*`)
- [ ] Audio briefing (env: `OPENAI_API_KEY`, storage bucket)

---

## 8. Prioritised backlog

| Priority | Item |
|----------|------|
| P0 | Apply migrations to real project; verify RLS matches product intent |
| P0 | Verify JWT on `send-newsletter` |
| P1 | Server-only Supabase URL env rename |
| P1 | Full `App` split + React Router (optional) |
| P2 | Expand Playwright coverage; load tests on functions |

---

## 9. Related artifacts

- Code-derived inventory: [`schema/inventory.md`](../schema/inventory.md)
- Swarm execution plan: [`tic-pulse-refactor-plan.md`](../tic-pulse-refactor-plan.md) (repo root)

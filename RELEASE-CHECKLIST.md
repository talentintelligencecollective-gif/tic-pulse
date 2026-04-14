# Release checklist (handoff / production)

Use this before tagging a release or handing the repo to a new owner.

1. **Environment**
   - [ ] `.env` / Netlify: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - [ ] Functions: `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY` where those features are used
   - [ ] Optional caps documented: `GDELT_RSS_PAIR_COUNT`, `GDELT_INGEST_CAP`, `GDELT_SUMMARISE_BATCH`, `PODCAST_RSS_ITEM_CAP`

2. **Database**
   - [ ] Migrations applied to target project in order (`supabase/migrations/`)
   - [ ] RPCs used by the app exist (`fetch_balanced_feed`, `article_category_counts`, `increment_engagement`, streak helpers, etc.)
   - [ ] RLS policies verified for production (not only defaults in repo)

3. **Build & tests**
   - [ ] `npm run typecheck`
   - [ ] `npm test`
   - [ ] `npm run build` with production `VITE_*` values
   - [ ] `npm run test:e2e` (or smoke in staging)

4. **Netlify**
   - [ ] Scheduled functions named to match `netlify.toml` (`fetch-podcast`, not `fetch-podcasts`)
   - [ ] `fetch-podcast` sources: `type = podcast`, `rss_url` set, `active = true`
   - [ ] `fetch-youtube` sources: `type = youtube`, `youtube_channel_id` set

5. **Smoke (production)**
   - [ ] Sign up / log in
   - [ ] Feed loads
   - [ ] Watch / Listen tabs load (if multimedia configured)

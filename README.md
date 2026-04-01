[README.md](https://github.com/user-attachments/files/26400580/README.md)
# TIC Pulse

**Real-time talent intelligence news feed** by the Talent Intelligence Collective.

A social-first news aggregator that pulls talent/HR/workforce news from GDELT, generates AI summaries via Claude, and serves it in a clean, Instagram-style mobile feed.

## Architecture

```
┌─────────────┐    every 30 min    ┌──────────────────┐
│  GDELT API  │ ─────────────────→ │ Netlify Function  │
│  (free)     │                    │ fetch-gdelt.mjs   │
└─────────────┘                    └────────┬─────────┘
                                            │
                                   ┌────────▼─────────┐
                                   │   Claude API      │
                                   │   (summarise)     │
                                   └────────┬─────────┘
                                            │
                                   ┌────────▼─────────┐
                                   │    Supabase       │
                                   │  (articles DB)    │
                                   └────────┬─────────┘
                                            │
                                   ┌────────▼─────────┐
                                   │  React Frontend   │
                                   │  (Netlify CDN)    │
                                   └──────────────────┘
```

## Setup

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New Query**
3. Paste the contents of `supabase-schema.sql` and run it
4. Go to **Settings → API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 2. Anthropic API

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)

### 3. GitHub

1. Create a new repository
2. Push all files from this project to the repo

### 4. Netlify

1. Create a new site at [netlify.com](https://netlify.com)
2. Connect it to your GitHub repository
3. Build settings should auto-detect from `netlify.toml`:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
4. Set environment variables in **Site settings → Environment variables**:

| Variable | Value | Where used |
|----------|-------|------------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` | Frontend + Functions |
| `VITE_SUPABASE_ANON_KEY` | Your anon key | Frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key | Functions only |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Functions only |

5. Deploy. The scheduled function will start running every 30 minutes automatically.

### 5. First Run

The feed will be empty until the scheduled function runs for the first time. To trigger it manually:

```
curl -X POST https://your-site.netlify.app/.netlify/functions/fetch-gdelt
```

## Local Development

```bash
npm install
npm run dev
```

Create a `.env` file based on `.env.example` with your Supabase credentials. The GDELT fetch function won't run locally (it's a Netlify scheduled function), but the frontend will connect to your Supabase instance.

## Phase Roadmap

- **Phase 1 (current):** GDELT feed, AI summaries, share, bookmarks (localStorage)
- **Phase 2:** Supabase Auth, user profiles, comments, persistent likes
- **Phase 3:** Curated collections, digest emails, admin panel
- **Phase 4:** In-app messaging, contact invites, notifications

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| GDELT API | Free |
| Supabase (Free tier) | £0 |
| Netlify (Free tier) | £0 |
| Claude API (~500 articles/day) | ~£15-20 |
| **Total** | **~£15-20/month** |

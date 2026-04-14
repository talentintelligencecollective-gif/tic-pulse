# Plan: TIC Pulse refactor and handoff

**Generated:** 2026-04-13

## Overview

Dependency-aware tasks to make TIC Pulse reproducible (schema-as-code), type-safe (TypeScript + Zod), cheaper to run (caps), and testable. Execute with the **executing-plans** workflow: review plan, worktree, per-task verification, finish branch.

## Prerequisites

- Node 20+, npm
- Supabase project (apply `supabase/migrations/00000000000000_initial_schema.sql` or use Supabase CLI)
- Netlify env vars (see `.env.example`)

## Dependency graph

```
T0 --> T3 --> T5 --> T6 --> T8 --> T9 --> T10
     |        +--> T7 -------+
     +--> T1 (audit doc)
T2 --> T4 ------------------+
```

## Tasks

### T0: Live / code schema inventory

- **depends_on**: []
- **location**: `schema/inventory.md`, `supabase/migrations/00000000000000_initial_schema.sql`
- **description**: Reverse-engineer all `.from()` / `.rpc()` usages; document MCP caveat; add canonical migration for fresh projects.
- **validation**: Grep shows every table/RPC from code appears in migration or inventory notes.
- **status**: Completed
- **log**: Supabase MCP listed wrong project; inventory is code-derived.
- **files edited/created**: `schema/inventory.md`, `supabase/migrations/00000000000000_initial_schema.sql`

### T1: Agent audit document

- **depends_on**: []
- **location**: `docs/AGENT-TECHNICAL-AUDIT.md`
- **description**: Ruthless, sectioned audit for sub-agents.
- **validation**: File exists; references inventory + migration.
- **status**: Completed

### T2: Repo hygiene

- **depends_on**: []
- **location**: `package.json`, `.env.example`, `README.md`
- **description**: `engines.node`, scripts for `typecheck`, `test`, document env matrix.
- **validation**: `npm run build` succeeds.
- **status**: Not Completed (completed as part of T4/T10)

### T3: Canonical migrations

- **depends_on**: [T0]
- **location**: `supabase/migrations/`
- **description**: Ordered SQL reproducing app contract; sentinel article for newsletter prefs.
- **validation**: Fresh DB apply runs without error (manual or `supabase db push`).
- **status**: Completed

### T4: TypeScript + Zod foundation

- **depends_on**: [T2]
- **location**: `tsconfig.json`, `vite.config.ts`, `src/env.ts`, `src/schemas/*`, `src/supabase.ts`
- **description**: Strict TS; Zod for `import.meta.env` and feed rows; `z.infer` types.
- **validation**: `npm run typecheck` passes.
- **status**: Not Completed

### T5: Netlify functions unify + podcast fix

- **depends_on**: [T3, T4]
- **location**: `netlify/functions/*`
- **description**: Remove duplicate YouTube in `fetch-podcast.js`; implement RSS podcast fetch; shared logger optional; Zod on JSON bodies where high-risk.
- **validation**: `npm run build` bundles; manual POST to podcast function with test RSS.
- **status**: Not Completed

### T6: Schedules and naming

- **depends_on**: [T5]
- **location**: `netlify.toml`, `netlify/functions/fetch-gdelt.mjs`
- **description**: `functions.fetch-podcast` schedule matches filename; remove duplicate `config.schedule` from `fetch-gdelt`.
- **validation**: Netlify UI shows expected schedules after deploy.
- **status**: Not Completed

### T7: Frontend modularisation

- **depends_on**: [T3, T4]
- **location**: `src/app/*`, move views out of `App.tsx`
- **description**: Split Pulse shell vs Feed/Watch/Listen/Saved/Discover; preserve inline styling aesthetic.
- **validation**: Smoke: login, feed render, tab switch.
- **status**: Not Completed

### T8: Performance and cost caps

- **depends_on**: [T6, T7]
- **location**: `src/supabase.ts`, `netlify/functions/fetch-gdelt.mjs`, `fetch-youtube.js`
- **description**: Feed default limit; category counts RPC; YouTube page cap; optional summarisation caps via env.
- **validation**: Network tab shows smaller initial payload; function logs show caps respected.
- **status**: Not Completed

### T9: Tests + CI

- **depends_on**: [T8]
- **location**: `vitest.config.ts`, `e2e/*`, `.github/workflows/ci.yml`
- **description**: Vitest for schemas/helpers; Playwright smoke; CI `typecheck` + `build` + `test`.
- **validation**: CI green on branch.
- **status**: Not Completed

### T10: Handoff package

- **depends_on**: [T1, T9]
- **location**: `README.md`, `RELEASE-CHECKLIST.md`
- **description**: Clone, env, migrate, deploy; no secrets in repo.
- **validation**: Another machine can follow README without DMing you.
- **status**: Not Completed

## Parallel execution groups

| Wave | Tasks | Can start when |
|------|-------|----------------|
| 1 | T0, T1, T2 | Immediately |
| 2 | T3 | T0 done |
| 3 | T4 | T2 done |
| 4 | T5, T7 | T3 + T4 done |
| 5 | T6 | T5 done |
| 6 | T8 | T6 + T7 done |
| 7 | T9 | T8 done |
| 8 | T10 | T1 + T9 done |

## Testing strategy

- **Unit:** Zod schemas, pure helpers (relative time, formatters).
- **E2E:** Playwright — load `/`, auth gate visible (or use `data-testid` when added).

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Migration differs from prod | Diff prod with migration before cutover; use `supabase db diff` if linked |
| Podcast RSS variance | Per-feed smoke test; store `episode_guid` dedupe |
| Anthropic spend | Lower `SUMMARISE_BATCH_SIZE` via env in `fetch-gdelt` |

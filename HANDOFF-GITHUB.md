# GitHub Handoff Runbook

Use this to transfer the refactored app back to the original owner safely.

## Why this approach

Do not scrape and re-upload. It removes useful history and increases deployment mistakes.

A branch + PR handoff keeps:

- full commit history,
- CI visibility,
- rollback ability,
- clear ownership transition.

## Step-by-step transfer

1. Add the original repository as remote (if needed).
2. Push your current refactored branch.
3. Open a PR into the original repository default branch.
4. Include:
   - release notes summary,
   - known environment variables,
   - testing evidence (`typecheck`, `test`, `build`, `test:e2e`),
   - any migration notes.
5. Ask friend to review and merge.
6. Create a release tag after merge.

## Secret safety checklist

- Ensure `.env` is never committed.
- Rotate service keys before handoff.
- Rotate keys again after ownership settles.
- Share secrets only through GitHub/Netlify/Supabase secure settings, not chat.

## Day-1 owner checklist

- Verify Netlify environment variables from `.env.example`.
- Confirm Supabase migration baseline exists.
- Run smoke checks:
  - App opens
  - Login works
  - Feed loads
  - TIC Digest loads
  - Watch/Listen tabs load

## Rollback plan

If issue appears post-handoff:

1. Revert PR or deploy previous release tag.
2. Restore last known good env snapshot.
3. Re-run smoke checks.

-- fetch-podcast inserts require episode_guid. If production was created from an older
-- schema, PostgREST returns: "Could not find the 'episode_guid' column ... in the schema cache"
-- Fix: add column, backfill, enforce NOT NULL, restore uniqueness for dedupe.

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS episode_guid TEXT;

UPDATE public.episodes
SET episode_guid = 'legacy-' || id::text
WHERE episode_guid IS NULL;

ALTER TABLE public.episodes
  ALTER COLUMN episode_guid SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.episodes
    ADD CONSTRAINT episodes_source_id_episode_guid_key UNIQUE (source_id, episode_guid);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

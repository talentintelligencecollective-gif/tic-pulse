-- Safety: never drop image_url in other migrations. If the column was removed by
-- accident or an old DB drifted, restore it (URLs in lost rows cannot be recovered).
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS image_url TEXT;

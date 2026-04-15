-- Claude pipeline writes industry_tags / function_tags; without these columns the
-- whole articles row update fails (including image_url and summarised).
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS industry_tags TEXT[];
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS function_tags TEXT[];

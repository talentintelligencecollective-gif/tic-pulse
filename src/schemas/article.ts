import { z } from "zod";

/** Row shape from `articles_feed` / `fetch_balanced_feed` RPC. */
export const ArticleFeedRowSchema = z.object({
  id: z.string().uuid(),
  gdelt_url: z.string(),
  title: z.string(),
  source_name: z.string().nullable().optional(),
  source_domain: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  tldr: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  gdelt_tone: z.coerce.number().nullable().optional(),
  published_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  read_time_min: z.coerce.number().nullable().optional(),
  like_count: z.coerce.number().nullable().optional(),
  comment_count: z.coerce.number().nullable().optional(),
  share_count: z.coerce.number().nullable().optional(),
  view_count: z.coerce.number().nullable().optional(),
});

export type Article = z.infer<typeof ArticleFeedRowSchema>;

export function parseArticleRows(data: unknown): Article[] {
  if (!Array.isArray(data)) {
    console.error({ event: "ARTICLE_FEED_NOT_ARRAY", sample: typeof data });
    return [];
  }
  const out: Article[] = [];
  for (const row of data) {
    const r = ArticleFeedRowSchema.safeParse(row);
    if (r.success) out.push(r.data);
    else
      console.error({
        event: "ARTICLE_ROW_INVALID",
        issues: r.error.flatten(),
      });
  }
  return out;
}

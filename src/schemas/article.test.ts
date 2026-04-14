import { describe, it, expect } from "vitest";
import { ArticleFeedRowSchema, parseArticleRows } from "./article";

describe("ArticleFeedRowSchema", () => {
  it("accepts a minimal valid feed row", () => {
    const row = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      gdelt_url: "https://example.com/article",
      title: "Example",
    };
    const r = ArticleFeedRowSchema.safeParse(row);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe("Example");
  });

  it("rejects invalid uuid", () => {
    const r = ArticleFeedRowSchema.safeParse({
      id: "not-a-uuid",
      gdelt_url: "https://example.com/a",
      title: "T",
    });
    expect(r.success).toBe(false);
  });
});

describe("parseArticleRows", () => {
  it("returns empty array for non-array input", () => {
    expect(parseArticleRows(null)).toEqual([]);
    expect(parseArticleRows({})).toEqual([]);
  });

  it("keeps valid rows and skips invalid", () => {
    const out = parseArticleRows([
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        gdelt_url: "https://example.com/1",
        title: "Good",
      },
      { id: "bad", gdelt_url: "https://example.com/2", title: "Bad" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("Good");
  });
});

import { describe, it, expect } from "vitest";
import { isGoogleNewsPlaceholderImageUrl } from "./articleImage";

describe("isGoogleNewsPlaceholderImageUrl", () => {
  it("flags Google News CDN thumbnails", () => {
    expect(
      isGoogleNewsPlaceholderImageUrl(
        "https://lh3.googleusercontent.com/abc=s0-w300"
      )
    ).toBe(true);
    expect(
      isGoogleNewsPlaceholderImageUrl("https://lh6.googleusercontent.com/x")
    ).toBe(true);
    expect(isGoogleNewsPlaceholderImageUrl("https://lh3.ggpht.com/x")).toBe(
      true
    );
  });

  it("allows publisher asset URLs", () => {
    expect(
      isGoogleNewsPlaceholderImageUrl(
        "https://assets.citizen.digital/foo/og_image.webp"
      )
    ).toBe(false);
    expect(isGoogleNewsPlaceholderImageUrl(null)).toBe(false);
    expect(isGoogleNewsPlaceholderImageUrl("")).toBe(false);
  });
});

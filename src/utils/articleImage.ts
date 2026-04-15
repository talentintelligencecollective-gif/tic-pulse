/**
 * Google News RSS and Google News HTML often expose thumbnails on these hosts.
 * They are not the publisher's hero image — hide them in the UI even if still in DB.
 */
export function isGoogleNewsPlaceholderImageUrl(
  url: string | null | undefined
): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  return u.includes("googleusercontent.com") || u.includes("ggpht.com");
}

// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Email Newsletter HTML Generator
//
//  Generates email-client-safe HTML using:
//  - Table-based layouts (no flexbox/grid)
//  - Inline styles only (no <style> blocks — Gmail strips them)
//  - MSO conditionals for Outlook
//  - Max-width 600px (email standard)
//  - Web-safe font stacks
// ═══════════════════════════════════════════════════════════════

import { isGoogleNewsPlaceholderImageUrl } from "./utils/articleImage";

export const NEWSLETTER_THEMES = {
  pulse: {
    id: "pulse", name: "TIC Pulse", description: "Default dark editorial",
    bg: "#0a0a0a", cardBg: "#141416", headerBg: "#0a0a0a", accent: "#00e5a0",
    textPrimary: "#e8e8e8", textSecondary: "#999999", textMuted: "#666666",
    border: "#222225", tagBg: "#1a1a1e",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  corporate: {
    id: "corporate", name: "Corporate Light", description: "Clean light theme for professional audiences",
    bg: "#f5f5f5", cardBg: "#ffffff", headerBg: "#1a1a2e", accent: "#0066cc",
    textPrimary: "#1a1a1a", textSecondary: "#555555", textMuted: "#888888",
    border: "#e0e0e0", tagBg: "#f0f0f0",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  midnight: {
    id: "midnight", name: "Midnight Blue", description: "Deep navy with gold accents",
    bg: "#0d1117", cardBg: "#161b22", headerBg: "#0d1117", accent: "#e5a600",
    textPrimary: "#e6edf3", textSecondary: "#8b949e", textMuted: "#6e7681",
    border: "#21262d", tagBg: "#1c2128",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  warmWhite: {
    id: "warmWhite", name: "Warm White", description: "Soft cream with rich typography",
    bg: "#faf8f5", cardBg: "#ffffff", headerBg: "#2c2c2c", accent: "#c0392b",
    textPrimary: "#2c2c2c", textSecondary: "#666666", textMuted: "#999999",
    border: "#e8e4df", tagBg: "#f2efea",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  freshGreen: {
    id: "freshGreen", name: "Fresh Green", description: "Light with green sustainability vibes",
    bg: "#f0f7f0", cardBg: "#ffffff", headerBg: "#1b4332", accent: "#2d6a4f",
    textPrimary: "#1b1b1b", textSecondary: "#555555", textMuted: "#888888",
    border: "#d8e8d8", tagBg: "#e8f5e8",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  custom: {
    id: "custom", name: "Custom Brand", description: "Match your company colours",
    bg: "#ffffff", cardBg: "#ffffff", headerBg: "#1a1a1a", accent: "#0066cc",
    textPrimary: "#1a1a1a", textSecondary: "#555555", textMuted: "#888888",
    border: "#e0e0e0", tagBg: "#f5f5f5",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
};

const CAT_COLORS = {
  "Talent Strategy": "#00e5a0", "Labour Market": "#00b4d8", "Automation": "#ff6b35",
  "Executive Moves": "#a855f7", "Compensation": "#f59e0b", "Workforce Planning": "#ec4899",
  "Skills": "#06b6d4", "DEI": "#8b5cf6",
};

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getSourceAbbr(name) {
  if (!name) return "??";
  const words = name.replace(/^The\s+/i, "").split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function isColorDark(hex) {
  if (!hex || hex.charAt(0) !== "#") return false;
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

// ─── Article card ───
function renderArticle(article, i, t) {
  const catColor = CAT_COLORS[article.category] || t.accent;
  const tags = (article.tags || []).slice(0, 3).map((tag) => esc(tag)).join(" &nbsp;·&nbsp; ");
  const articleUrl = esc(article.article_url || article.gdelt_url || "");
  const rawImg = article.image_url || "";
  const imageUrl = esc(
    rawImg && !isGoogleNewsPlaceholderImageUrl(rawImg) ? rawImg : ""
  );

  return `
  <!-- Article ${i + 1} -->
  <tr>
    <td style="padding: 0 0 20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${t.cardBg}; border: 1px solid ${t.border}; border-radius: 12px; overflow: hidden;">
        ${imageUrl ? `
        <tr><td style="padding: 0; line-height: 0;">
          <a href="${articleUrl}" target="_blank" style="text-decoration: none;">
            <img src="${esc(imageUrl)}" alt="" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border: 0;" />
          </a>
        </td></tr>` : ""}
        <tr>
          <td style="padding: 24px 24px 20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding-bottom: 12px;">
                <span style="display: inline-block; padding: 3px 10px; border-radius: 12px; background-color: ${catColor}18; color: ${catColor}; font-family: ${t.bodyFontStack}; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; border: 1px solid ${catColor}22;">${esc(article.category)}</span>
                <span style="font-family: ${t.bodyFontStack}; font-size: 12px; color: ${t.textMuted}; margin-left: 8px;">${esc(article.source_name || "")} &middot; ${article.read_time_min || 4} min read</span>
              </td></tr>
            </table>
            <a href="${articleUrl}" target="_blank" style="text-decoration: none; color: ${t.textPrimary};">
              <h2 style="font-family: ${t.fontStack}; font-size: 20px; font-weight: 700; line-height: 1.3; color: ${t.textPrimary}; margin: 0 0 12px 0;">${esc(article.title)}</h2>
            </a>
            <p style="font-family: ${t.bodyFontStack}; font-size: 14px; line-height: 1.65; color: ${t.textSecondary}; margin: 0 0 14px 0;">${esc(article.tldr)}</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family: ${t.bodyFontStack}; font-size: 11px; color: ${t.textMuted};">${tags}</td>
                <td align="right"><a href="${articleUrl}" target="_blank" style="font-family: ${t.bodyFontStack}; font-size: 12px; font-weight: 600; color: ${t.accent}; text-decoration: none;">Read full article →</a></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ─── Video card ───
function renderVideo(video, i, t) {
  const videoUrl = esc(`https://www.youtube.com/watch?v=${video.youtube_id}`);
  const thumbUrl = esc(video.thumbnail_url || (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` : ""));
  const typeLabel = ({ podcast: "Podcast", event: "Event", panel: "Panel", short: "Short", video: "Video" }[video.video_type] || "Video").toUpperCase();

  return `
  <!-- Video ${i + 1} -->
  <tr>
    <td style="padding: 0 0 20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${t.cardBg}; border: 1px solid ${t.border}; border-radius: 12px; overflow: hidden;">
        ${thumbUrl ? `
        <tr><td style="padding: 0; line-height: 0; position: relative;">
          <a href="${videoUrl}" target="_blank" style="text-decoration: none; display: block; position: relative;">
            <img src="${thumbUrl}" alt="" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border: 0;" />
          </a>
        </td></tr>` : ""}
        <tr>
          <td style="padding: 20px 24px 20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding-bottom: 10px;">
                <span style="display: inline-block; padding: 3px 10px; border-radius: 12px; background-color: ${t.accent}18; color: ${t.accent}; font-family: ${t.bodyFontStack}; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; border: 1px solid ${t.accent}22;">▶ ${typeLabel}</span>
                ${video.duration ? `<span style="font-family: ${t.bodyFontStack}; font-size: 12px; color: ${t.textMuted}; margin-left: 8px;">⏱ ${esc(video.duration)}</span>` : ""}
              </td></tr>
            </table>
            <a href="${videoUrl}" target="_blank" style="text-decoration: none; color: ${t.textPrimary};">
              <h2 style="font-family: ${t.fontStack}; font-size: 18px; font-weight: 700; line-height: 1.3; color: ${t.textPrimary}; margin: 0 0 10px 0;">${esc(video.title)}</h2>
            </a>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family: ${t.bodyFontStack}; font-size: 12px; color: ${t.textMuted};">${esc(video.channel_title || "")}</td>
                <td align="right"><a href="${videoUrl}" target="_blank" style="font-family: ${t.bodyFontStack}; font-size: 12px; font-weight: 600; color: ${t.accent}; text-decoration: none;">Watch on YouTube →</a></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ─── Podcast episode card ───
function renderEpisode(episode, i, t) {
  const epUrl = esc(episode.link || "");
  const imageUrl = esc(episode.image_url || "");

  return `
  <!-- Episode ${i + 1} -->
  <tr>
    <td style="padding: 0 0 20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${t.cardBg}; border: 1px solid ${t.border}; border-radius: 12px; overflow: hidden;">
        <tr>
          <td style="padding: 20px 24px 20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${imageUrl ? `<td style="width: 56px; padding-right: 16px; vertical-align: top;">
                  <img src="${imageUrl}" alt="" width="56" height="56" style="width: 56px; height: 56px; border-radius: 8px; display: block; object-fit: cover;" />
                </td>` : ""}
                <td style="vertical-align: top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr><td style="padding-bottom: 8px;">
                      <span style="display: inline-block; padding: 3px 10px; border-radius: 12px; background-color: ${t.accent}18; color: ${t.accent}; font-family: ${t.bodyFontStack}; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; border: 1px solid ${t.accent}22;">🎧 PODCAST</span>
                      ${episode.duration ? `<span style="font-family: ${t.bodyFontStack}; font-size: 12px; color: ${t.textMuted}; margin-left: 8px;">⏱ ${esc(episode.duration)}</span>` : ""}
                    </td></tr>
                    <tr><td style="padding-bottom: 6px;">
                      <span style="font-family: ${t.bodyFontStack}; font-size: 11px; font-weight: 700; color: ${t.accent}; text-transform: uppercase; letter-spacing: 0.5px;">${esc(episode.sources?.name || "Podcast")}</span>
                    </td></tr>
                  </table>
                  ${epUrl ? `<a href="${epUrl}" target="_blank" style="text-decoration: none; color: ${t.textPrimary};">` : ""}
                    <h2 style="font-family: ${t.fontStack}; font-size: 17px; font-weight: 700; line-height: 1.35; color: ${t.textPrimary}; margin: 0 0 8px 0;">${esc(episode.title)}</h2>
                  ${epUrl ? `</a>` : ""}
                  ${episode.guest_name ? `<p style="font-family: ${t.bodyFontStack}; font-size: 13px; color: ${t.textSecondary}; margin: 0 0 10px 0;">with ${esc(episode.guest_name)}${episode.guest_org ? `, ${esc(episode.guest_org)}` : ""}</p>` : ""}
                  ${epUrl ? `<a href="${epUrl}" target="_blank" style="font-family: ${t.bodyFontStack}; font-size: 12px; font-weight: 600; color: ${t.accent}; text-decoration: none;">Listen to episode →</a>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ─── Section divider ───
function renderSectionDivider(label, t) {
  return `
  <tr>
    <td style="padding: 8px 0 16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="border-top: 1px solid ${t.border};"></td>
          <td style="white-space: nowrap; padding: 0 12px;">
            <span style="font-family: ${t.bodyFontStack}; font-size: 10px; font-weight: 700; color: ${t.textMuted}; letter-spacing: 1.5px; text-transform: uppercase;">${label}</span>
          </td>
          <td style="border-top: 1px solid ${t.border};"></td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * Generate the full newsletter HTML.
 *
 * @param {Object} options
 * @param {Array}  options.articles   - Selected articles
 * @param {Array}  options.videos     - Selected videos (optional)
 * @param {Array}  options.episodes   - Selected podcast episodes (optional)
 * @param {Object} options.theme      - Theme object from NEWSLETTER_THEMES
 * @param {string} options.introText
 * @param {string} options.senderName
 * @param {string} options.newsletterTitle
 * @param {string} options.dateStr
 */
export function generateNewsletterHtml({
  articles = [],
  videos = [],
  episodes = [],
  theme,
  introText = "",
  senderName = "",
  newsletterTitle = "Talent Intelligence Briefing",
  dateStr = "",
}) {
  const t = theme;
  const today = dateStr || new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const accentText = isColorDark(t.accent) ? "#ffffff" : "#000000";
  const totalItems = articles.length + videos.length + episodes.length;

  // Build content rows
  const articleRows = articles.map((a, i) => renderArticle(a, i, t)).join("\n");
  const videoRows   = videos.map((v, i) => renderVideo(v, i, t)).join("\n");
  const episodeRows = episodes.map((e, i) => renderEpisode(e, i, t)).join("\n");

  // Section dividers only when multiple content types present
  const multiType = [articles.length > 0, videos.length > 0, episodes.length > 0].filter(Boolean).length > 1;

  const articleSection = articles.length > 0
    ? `${multiType ? renderSectionDivider("Articles", t) : ""}${articleRows}`
    : "";
  const videoSection = videos.length > 0
    ? `${multiType ? renderSectionDivider("Watch", t) : ""}${videoRows}`
    : "";
  const episodeSection = episodes.length > 0
    ? `${multiType ? renderSectionDivider("Listen", t) : ""}${episodeRows}`
    : "";

  const introSection = introText.trim() ? `
  <tr><td style="padding: 0 0 28px 0;">
    <p style="font-family: ${t.bodyFontStack}; font-size: 15px; line-height: 1.7; color: ${t.textSecondary}; margin: 0;">${esc(introText)}</p>
  </td></tr>` : "";

  const signOff = senderName.trim() ? `
  <tr><td style="padding: 20px 0 0 0;">
    <p style="font-family: ${t.bodyFontStack}; font-size: 13px; color: ${t.textMuted}; margin: 0;">
      Curated by <strong style="color: ${t.textSecondary};">${esc(senderName)}</strong>
    </p>
  </td></tr>` : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${esc(newsletterTitle)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid-img { width: 100% !important; height: auto !important; }
      .content-padding { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${t.bg}; font-family: ${t.bodyFontStack};">
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: ${t.bg};">
    ${esc(newsletterTitle)} — ${totalItems} curated item${totalItems !== 1 ? "s" : ""} for ${today}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${t.bg};">
    <tr><td align="center" style="padding: 20px 10px;">
      <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; margin: 0 auto;">

        <!-- HEADER -->
        <tr><td style="background-color: ${t.headerBg}; padding: 32px 32px 28px 32px; border-radius: 12px 12px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <h1 style="font-family: ${t.fontStack}; font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 4px 0; letter-spacing: -0.5px;">${esc(newsletterTitle)}</h1>
                <p style="font-family: ${t.bodyFontStack}; font-size: 13px; color: rgba(255,255,255,0.5); margin: 0; letter-spacing: 0.5px;">${today} &middot; ${totalItems} item${totalItems !== 1 ? "s" : ""}</p>
              </td>
              <td align="right" valign="top" style="padding-top: 4px;">
                <span style="display: inline-block; padding: 4px 12px; border-radius: 8px; background-color: ${t.accent}; color: ${accentText}; font-family: ${t.bodyFontStack}; font-size: 11px; font-weight: 700; letter-spacing: 1px;">PULSE</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- BODY -->
        <tr><td class="content-padding" style="background-color: ${t.bg}; padding: 28px 24px 12px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${introSection}
            ${articleSection}
            ${videoSection}
            ${episodeSection}
            ${signOff}
          </table>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding: 24px 32px 32px 32px; border-top: 1px solid ${t.border};">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center">
              <p style="font-family: ${t.bodyFontStack}; font-size: 11px; color: ${t.textMuted}; margin: 0; line-height: 1.6;">
                Curated with <span style="color: ${t.accent};">TIC Pulse</span> by the Talent Intelligence Collective
              </p>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

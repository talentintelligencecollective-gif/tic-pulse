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

/**
 * Theme presets with email-safe colour palettes
 */
export const NEWSLETTER_THEMES = {
  pulse: {
    id: "pulse",
    name: "TIC Pulse",
    description: "Default dark editorial",
    bg: "#0a0a0a",
    cardBg: "#141416",
    headerBg: "#0a0a0a",
    accent: "#00e5a0",
    textPrimary: "#e8e8e8",
    textSecondary: "#999999",
    textMuted: "#666666",
    border: "#222225",
    tagBg: "#1a1a1e",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  corporate: {
    id: "corporate",
    name: "Corporate Light",
    description: "Clean light theme for professional audiences",
    bg: "#f5f5f5",
    cardBg: "#ffffff",
    headerBg: "#1a1a2e",
    accent: "#0066cc",
    textPrimary: "#1a1a1a",
    textSecondary: "#555555",
    textMuted: "#888888",
    border: "#e0e0e0",
    tagBg: "#f0f0f0",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  midnight: {
    id: "midnight",
    name: "Midnight Blue",
    description: "Deep navy with gold accents",
    bg: "#0d1117",
    cardBg: "#161b22",
    headerBg: "#0d1117",
    accent: "#e5a600",
    textPrimary: "#e6edf3",
    textSecondary: "#8b949e",
    textMuted: "#6e7681",
    border: "#21262d",
    tagBg: "#1c2128",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  warmWhite: {
    id: "warmWhite",
    name: "Warm White",
    description: "Soft cream with rich typography",
    bg: "#faf8f5",
    cardBg: "#ffffff",
    headerBg: "#2c2c2c",
    accent: "#c0392b",
    textPrimary: "#2c2c2c",
    textSecondary: "#666666",
    textMuted: "#999999",
    border: "#e8e4df",
    tagBg: "#f2efea",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  freshGreen: {
    id: "freshGreen",
    name: "Fresh Green",
    description: "Light with green sustainability vibes",
    bg: "#f0f7f0",
    cardBg: "#ffffff",
    headerBg: "#1b4332",
    accent: "#2d6a4f",
    textPrimary: "#1b1b1b",
    textSecondary: "#555555",
    textMuted: "#888888",
    border: "#d8e8d8",
    tagBg: "#e8f5e8",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  custom: {
    id: "custom",
    name: "Custom Brand",
    description: "Match your company colours",
    bg: "#ffffff",
    cardBg: "#ffffff",
    headerBg: "#1a1a1a",
    accent: "#0066cc",
    textPrimary: "#1a1a1a",
    textSecondary: "#555555",
    textMuted: "#888888",
    border: "#e0e0e0",
    tagBg: "#f5f5f5",
    fontStack: "Georgia, 'Times New Roman', serif",
    bodyFontStack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
};

/**
 * Category colour mapping (email-safe hex)
 */
const CAT_COLORS = {
  "Talent Strategy": "#00e5a0",
  "Labour Market": "#00b4d8",
  "Automation": "#ff6b35",
  "Executive Moves": "#a855f7",
  "Compensation": "#f59e0b",
  "Workforce Planning": "#ec4899",
  "Skills": "#06b6d4",
  "DEI": "#8b5cf6",
};

/**
 * Escape HTML entities to prevent XSS in generated email
 */
function esc(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate the full newsletter HTML.
 *
 * @param {Object} options
 * @param {Array} options.articles - Selected articles
 * @param {Object} options.theme - Theme object from NEWSLETTER_THEMES
 * @param {string} [options.introText] - Optional personal intro paragraph
 * @param {string} [options.senderName] - Name of the person sending
 * @param {string} [options.newsletterTitle] - Custom title (default: "Talent Intelligence Briefing")
 * @param {string} [options.dateStr] - Date string for the header
 * @returns {string} Complete HTML document string
 */
export function generateNewsletterHtml({
  articles,
  theme,
  introText = "",
  senderName = "",
  newsletterTitle = "Talent Intelligence Briefing",
  dateStr = "",
}) {
  const t = theme;
  const today = dateStr || new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const isDark = isColorDark(t.bg);
  const accentText = isColorDark(t.accent) ? "#ffffff" : "#000000";

  // Build article rows
  const articleRows = articles
    .map((article, i) => {
      const catColor = CAT_COLORS[article.category] || t.accent;
      const tags = (article.tags || []).slice(0, 3).map((tag) => esc(tag)).join(" &nbsp;·&nbsp; ");
      const articleUrl = esc(article.gdelt_url || "");
      const imageUrl = article.image_url || "";
      const sourceAbbr = getSourceAbbr(article.source_name);

      return `
    <!-- Article ${i + 1} -->
    <tr>
      <td style="padding: 0 0 20px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${t.cardBg}; border: 1px solid ${t.border}; border-radius: 12px; overflow: hidden;">
          ${imageUrl ? `
          <!-- Image -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <a href="${articleUrl}" target="_blank" style="text-decoration: none;">
                <img src="${esc(imageUrl)}" alt="" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; border: 0;" />
              </a>
            </td>
          </tr>` : ""}
          <!-- Content -->
          <tr>
            <td style="padding: 24px 24px 20px 24px;">
              <!-- Category + Source -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <span style="display: inline-block; padding: 3px 10px; border-radius: 12px; background-color: ${catColor}18; color: ${catColor}; font-family: ${t.bodyFontStack}; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; border: 1px solid ${catColor}22;">${esc(article.category)}</span>
                    <span style="font-family: ${t.bodyFontStack}; font-size: 12px; color: ${t.textMuted}; margin-left: 8px;">${esc(article.source_name || "")} &middot; ${article.read_time_min || 4} min read</span>
                  </td>
                </tr>
              </table>
              <!-- Headline -->
              <a href="${articleUrl}" target="_blank" style="text-decoration: none; color: ${t.textPrimary};">
                <h2 style="font-family: ${t.fontStack}; font-size: 20px; font-weight: 700; line-height: 1.3; color: ${t.textPrimary}; margin: 0 0 12px 0;">${esc(article.title)}</h2>
              </a>
              <!-- TL;DR -->
              <p style="font-family: ${t.bodyFontStack}; font-size: 14px; line-height: 1.65; color: ${t.textSecondary}; margin: 0 0 14px 0;">${esc(article.tldr)}</p>
              <!-- Tags + Read More -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family: ${t.bodyFontStack}; font-size: 11px; color: ${t.textMuted};">
                    ${tags}
                  </td>
                  <td align="right">
                    <a href="${articleUrl}" target="_blank" style="font-family: ${t.bodyFontStack}; font-size: 12px; font-weight: 600; color: ${t.accent}; text-decoration: none;">Read full article →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
    })
    .join("\n");

  // Intro section
  const introSection = introText.trim()
    ? `
    <tr>
      <td style="padding: 0 0 28px 0;">
        <p style="font-family: ${t.bodyFontStack}; font-size: 15px; line-height: 1.7; color: ${t.textSecondary}; margin: 0;">${esc(introText)}</p>
      </td>
    </tr>`
    : "";

  // Sender sign-off
  const signOff = senderName.trim()
    ? `
    <tr>
      <td style="padding: 20px 0 0 0;">
        <p style="font-family: ${t.bodyFontStack}; font-size: 13px; color: ${t.textMuted}; margin: 0;">
          Curated by <strong style="color: ${t.textSecondary};">${esc(senderName)}</strong>
        </p>
      </td>
    </tr>`
    : "";

  // Full HTML document
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${esc(newsletterTitle)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset for email clients that DO support style blocks */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid-img { width: 100% !important; max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .content-padding { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${t.bg}; font-family: ${t.bodyFontStack};">
  <!-- Preheader text (hidden, shows in email previews) -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: ${t.bg};">
    ${esc(newsletterTitle)} — ${articles.length} curated articles for ${today}
  </div>

  <!-- Full-width wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${t.bg};">
    <tr>
      <td align="center" style="padding: 20px 10px;">

        <!-- Email container (max 600px) -->
        <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; margin: 0 auto;">

          <!-- ═══ HEADER ═══ -->
          <tr>
            <td style="background-color: ${t.headerBg}; padding: 32px 32px 28px 32px; border-radius: 12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <h1 style="font-family: ${t.fontStack}; font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 4px 0; letter-spacing: -0.5px;">${esc(newsletterTitle)}</h1>
                    <p style="font-family: ${t.bodyFontStack}; font-size: 13px; color: rgba(255,255,255,0.5); margin: 0; letter-spacing: 0.5px;">${today} &middot; ${articles.length} article${articles.length !== 1 ? "s" : ""}</p>
                  </td>
                  <td align="right" valign="top" style="padding-top: 4px;">
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 8px; background-color: ${t.accent}; color: ${accentText}; font-family: ${t.bodyFontStack}; font-size: 11px; font-weight: 700; letter-spacing: 1px;">PULSE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ BODY ═══ -->
          <tr>
            <td class="content-padding" style="background-color: ${t.bg}; padding: 28px 24px 12px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${introSection}
                ${articleRows}
                ${signOff}
              </table>
            </td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td style="padding: 24px 32px 32px 32px; border-top: 1px solid ${t.border};">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <p style="font-family: ${t.bodyFontStack}; font-size: 11px; color: ${t.textMuted}; margin: 0; line-height: 1.6;">
                      Curated with <span style="color: ${t.accent};">TIC Pulse</span> by the Talent Intelligence Collective
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Email container -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ───

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
  // Relative luminance formula
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

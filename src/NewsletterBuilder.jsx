import { useState, useRef, useEffect, useMemo } from "react";
import { generateNewsletterHtml, NEWSLETTER_THEMES } from "./emailTemplate.js";
import { CloseIcon } from "./Icons.jsx";

// ─── Theme Swatch Component ───

function ThemeSwatch({ theme, isActive, onClick }) {
  const isDark = isColorDark(theme.bg);

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "12px",
        borderRadius: "12px",
        border: isActive ? `2px solid ${theme.accent}` : "2px solid var(--border)",
        background: "var(--bg-card)",
        cursor: "pointer",
        transition: "all 0.2s",
        textAlign: "left",
      }}
    >
      {/* Colour preview strip */}
      <div style={{ display: "flex", gap: "3px", marginBottom: "8px" }}>
        {[theme.headerBg, theme.bg, theme.cardBg, theme.accent].map((c, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: "20px",
              borderRadius: i === 0 ? "4px 0 0 4px" : i === 3 ? "0 4px 4px 0" : "0",
              backgroundColor: c,
              border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
        {theme.name}
      </div>
      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
        {theme.description}
      </div>
    </button>
  );
}

// ─── Custom Colour Picker Row ───

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "28px",
            height: "28px",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            padding: 0,
            background: "none",
          }}
        />
        <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-muted)", width: "60px" }}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  NEWSLETTER BUILDER
// ═══════════════════════════════════════════════

export default function NewsletterBuilder({ articles, onClose, onToast }) {
  const [activeThemeId, setActiveThemeId] = useState("pulse");
  const [customColors, setCustomColors] = useState({ ...NEWSLETTER_THEMES.custom });
  const [title, setTitle] = useState("Talent Intelligence Briefing");
  const [introText, setIntroText] = useState("");
  const [senderName, setSenderName] = useState("");
  const [activePanel, setActivePanel] = useState("theme"); // "theme" | "content" | "preview"
  const [copied, setCopied] = useState(false);

  const previewRef = useRef(null);

  // Build the active theme object
  const activeTheme = useMemo(() => {
    if (activeThemeId === "custom") return { ...customColors, id: "custom" };
    return NEWSLETTER_THEMES[activeThemeId];
  }, [activeThemeId, customColors]);

  // Generate HTML
  const html = useMemo(() => {
    return generateNewsletterHtml({
      articles,
      theme: activeTheme,
      introText,
      senderName,
      newsletterTitle: title,
    });
  }, [articles, activeTheme, introText, senderName, title]);

  // Update iframe preview when HTML changes
  useEffect(() => {
    if (previewRef.current) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html, activePanel]);

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      onToast("Newsletter HTML copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = html;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      onToast("Newsletter HTML copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tic-pulse-briefing-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast("Newsletter downloaded");
  };

  const handleEmailToSelf = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(
      "Open the attached HTML file in a browser to preview your newsletter.\n\n" +
      "To send as an email: Copy the HTML from TIC Pulse and paste into your email tool's HTML editor."
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  };

  const handlePrintPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      onToast("Please allow pop-ups to export PDF");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    // Wait for images to load before triggering print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  };

  const themeList = Object.values(NEWSLETTER_THEMES);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        maxWidth: "480px",
        margin: "0 auto",
        animation: "fadeSlide 0.3s ease",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-glass)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <CloseIcon size={22} />
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
            Newsletter Builder
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {articles.length} article{articles.length !== 1 ? "s" : ""} selected
          </div>
        </div>
        <div style={{ width: "30px" }} />
      </div>

      {/* ── Tab switcher ── */}
      <div
        style={{
          display: "flex",
          padding: "8px 16px",
          gap: "4px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {[
          { id: "theme", label: "Theme" },
          { id: "content", label: "Content" },
          { id: "preview", label: "Preview" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "10px",
              border: "none",
              fontSize: "12px",
              fontWeight: 700,
              background: activePanel === tab.id ? "var(--accent-muted)" : "transparent",
              color: activePanel === tab.id ? "var(--accent)" : "var(--text-muted)",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Panel content ── */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "none" }}>
        {/* THEME PANEL */}
        {activePanel === "theme" && (
          <div style={{ padding: "16px", animation: "fadeSlide 0.2s ease" }}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Choose a colour theme for your newsletter
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {themeList.map((theme) => (
                <ThemeSwatch
                  key={theme.id}
                  theme={theme}
                  isActive={activeThemeId === theme.id}
                  onClick={() => setActiveThemeId(theme.id)}
                />
              ))}
            </div>

            {/* Custom colour controls */}
            {activeThemeId === "custom" && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "16px",
                  background: "var(--bg-card)",
                  borderRadius: "14px",
                  border: "1px solid var(--border)",
                  animation: "fadeSlide 0.2s ease",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                  Custom Brand Colours
                </div>
                <ColorRow
                  label="Accent"
                  value={customColors.accent}
                  onChange={(v) => setCustomColors((p) => ({ ...p, accent: v }))}
                />
                <ColorRow
                  label="Header Background"
                  value={customColors.headerBg}
                  onChange={(v) => setCustomColors((p) => ({ ...p, headerBg: v }))}
                />
                <ColorRow
                  label="Body Background"
                  value={customColors.bg}
                  onChange={(v) => setCustomColors((p) => ({ ...p, bg: v }))}
                />
                <ColorRow
                  label="Card Background"
                  value={customColors.cardBg}
                  onChange={(v) => setCustomColors((p) => ({ ...p, cardBg: v }))}
                />
                <ColorRow
                  label="Text Colour"
                  value={customColors.textPrimary}
                  onChange={(v) => setCustomColors((p) => ({ ...p, textPrimary: v }))}
                />
                <ColorRow
                  label="Border"
                  value={customColors.border}
                  onChange={(v) => setCustomColors((p) => ({ ...p, border: v }))}
                />
              </div>
            )}
          </div>
        )}

        {/* CONTENT PANEL */}
        {activePanel === "content" && (
          <div style={{ padding: "16px", animation: "fadeSlide 0.2s ease" }}>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                NEWSLETTER TITLE
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: "6px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  fontWeight: 600,
                  outline: "none",
                  fontFamily: "var(--font-display)",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                PERSONAL INTRO
              </label>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 6px" }}>
                Optional opening paragraph — set the context for your audience
              </p>
              <textarea
                value={introText}
                onChange={(e) => setIntroText(e.target.value)}
                placeholder="Good morning team — here are this week's key talent intelligence stories worth your attention..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  lineHeight: 1.6,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "var(--font-body)",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                YOUR NAME
              </label>
              <input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Appears as 'Curated by...'"
                style={{
                  width: "100%",
                  marginTop: "6px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
            </div>

            {/* Article order preview */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                ARTICLE ORDER
              </label>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 8px" }}>
                Articles appear in selection order
              </p>
              {articles.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px",
                    background: "var(--bg-card)",
                    borderRadius: "10px",
                    border: "1px solid var(--border)",
                    marginBottom: "6px",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--text-faint)", width: "18px" }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.title}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {a.source_name} · {a.category}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PREVIEW PANEL */}
        {activePanel === "preview" && (
          <div style={{ padding: "12px", animation: "fadeSlide 0.2s ease" }}>
            <div
              style={{
                borderRadius: "12px",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <iframe
                ref={previewRef}
                title="Newsletter preview"
                sandbox="allow-same-origin"
                style={{
                  width: "100%",
                  height: "500px",
                  border: "none",
                  display: "block",
                }}
              />
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", margin: "8px 0 0" }}>
              Scroll to preview full newsletter
            </p>
          </div>
        )}
      </div>

      {/* ── Export bar ── */}
      <div
        style={{
          padding: "12px 16px env(safe-area-inset-bottom, 16px)",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-glass)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Primary action */}
        <button
          onClick={handleCopyHtml}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "14px",
            border: "none",
            background: copied ? "rgba(0,229,160,0.2)" : "var(--accent)",
            color: copied ? "var(--accent)" : isColorDark(activeTheme.accent) ? "#fff" : "#000",
            fontSize: "14px",
            fontWeight: 700,
            transition: "all 0.2s",
            letterSpacing: "0.2px",
            marginBottom: "8px",
          }}
        >
          {copied ? "✓ HTML Copied to Clipboard" : "Copy HTML for Email"}
        </button>
        {/* Format row */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { label: "HTML", icon: "↓", onClick: handleDownload },
            { label: "PDF", icon: "⎙", onClick: handlePrintPdf },
            { label: "Email", icon: "✉", onClick: handleEmailToSelf },
            { label: "PPTX", icon: "▦", onClick: () => onToast("PowerPoint export coming in Phase 2"), phase2: true },
            { label: "DOCX", icon: "W", onClick: () => onToast("Word export coming in Phase 2"), phase2: true },
          ].map((fmt) => (
            <button
              key={fmt.label}
              onClick={fmt.onClick}
              style={{
                flex: 1,
                padding: "10px 4px",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: fmt.phase2 ? "var(--text-faint)" : "var(--text-primary)",
                fontSize: "10px",
                fontWeight: 700,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                transition: "all 0.2s",
                letterSpacing: "0.3px",
              }}
            >
              <span style={{ fontSize: "14px", lineHeight: 1 }}>{fmt.icon}</span>
              {fmt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Helper ───

function isColorDark(hex) {
  if (!hex || hex.charAt(0) !== "#") return false;
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}

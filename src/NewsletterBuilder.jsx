import { useState, useRef, useEffect, useMemo } from "react";
import { generateNewsletterHtml, NEWSLETTER_THEMES } from "./emailTemplate.js";

// ─── Theme Swatch ───

function ThemeSwatch({ theme, isActive, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "12px", borderRadius: "12px",
      border: isActive ? `2px solid ${theme.accent}` : "2px solid #333",
      background: "#111", cursor: "pointer", textAlign: "left",
    }}>
      <div style={{ display: "flex", gap: "3px", marginBottom: "8px" }}>
        {[theme.headerBg, theme.bg, theme.cardBg, theme.accent].map((c, i) => (
          <div key={i} style={{
            flex: 1, height: "20px", background: c,
            borderRadius: i === 0 ? "4px 0 0 4px" : i === 3 ? "0 4px 4px 0" : "0",
            border: "1px solid #333",
          }} />
        ))}
      </div>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#eee" }}>{theme.name}</div>
      <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>{theme.description}</div>
    </button>
  );
}

// ─── Color Picker Row ───

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ fontSize: "12px", color: "#ccc" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: "28px", height: "28px", border: "none", borderRadius: "6px", cursor: "pointer", padding: 0, background: "none" }} />
        <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#888", width: "60px" }}>{value}</span>
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
  const [activePanel, setActivePanel] = useState("theme");
  const [copied, setCopied] = useState(false);

  const previewRef = useRef(null);

  const activeTheme = useMemo(() => {
    if (activeThemeId === "custom") return { ...customColors, id: "custom" };
    return NEWSLETTER_THEMES[activeThemeId];
  }, [activeThemeId, customColors]);

  const html = useMemo(() => {
    return generateNewsletterHtml({ articles, theme: activeTheme, introText, senderName, newsletterTitle: title });
  }, [articles, activeTheme, introText, senderName, title]);

  useEffect(() => {
    if (previewRef.current && activePanel === "preview") {
      const doc = previewRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(html); doc.close(); }
    }
  }, [html, activePanel]);

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = html; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    onToast("Newsletter HTML copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tic-pulse-briefing-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast("Newsletter downloaded as HTML");
  };

  const handlePrintPdf = () => {
    const w = window.open("", "_blank");
    if (!w) { onToast("Please allow pop-ups to save as PDF"); return; }
    w.document.write(html); w.document.close();
    w.onload = () => setTimeout(() => w.print(), 400);
    onToast("Use 'Save as PDF' in the print dialog");
  };

  const handleEmailWithHtml = () => {
    // Download the file first so they have it
    handleDownloadHtml();
    // Then open email with instructions
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(
      `Hi,\n\nPlease find attached the latest ${title}.\n\n` +
      `The HTML file has been downloaded to your device — attach it to this email, ` +
      `or open it in your browser and copy the content into your email tool.\n\n` +
      `Curated with TIC Pulse\n`
    );
    setTimeout(() => window.open(`mailto:?subject=${subject}&body=${body}`, "_self"), 500);
  };

  const themeList = Object.values(NEWSLETTER_THEMES);
  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: "12px",
    border: "1px solid #333", background: "#111", color: "#eee",
    fontSize: "14px", outline: "none", fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "#000",
      display: "flex", flexDirection: "column", maxWidth: "480px", margin: "0 auto",
    }}>
      <style>{`
        @keyframes nbFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .nb-anim { animation: nbFade 0.2s ease; }
        .nb-input::placeholder { color: #555; }
        .nb-input:focus { border-color: #00e5a0 !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: "1px solid #222", background: "#000",
      }}>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#999", padding: "4px",
          display: "flex", alignItems: "center", fontSize: "24px", lineHeight: 1,
        }}>✕</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>Newsletter Builder</div>
          <div style={{ fontSize: "11px", color: "#666" }}>
            {articles.length} article{articles.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ width: "30px" }} />
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", padding: "8px 16px", gap: "4px", borderBottom: "1px solid #222" }}>
        {[
          { id: "theme", label: "Theme" },
          { id: "content", label: "Content" },
          { id: "preview", label: "Preview" },
          { id: "export", label: "Export" },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActivePanel(tab.id)} style={{
            flex: 1, padding: "8px", borderRadius: "10px", border: "none",
            fontSize: "12px", fontWeight: 700,
            background: activePanel === tab.id ? "rgba(0,229,160,0.12)" : "transparent",
            color: activePanel === tab.id ? "#00e5a0" : "#666",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── Panel Content ── */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "none" }}>

        {/* THEME */}
        {activePanel === "theme" && (
          <div className="nb-anim" style={{ padding: "16px" }}>
            <p style={{ fontSize: "13px", color: "#999", margin: "0 0 16px" }}>
              Choose a colour theme for your newsletter
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {themeList.map((theme) => (
                <ThemeSwatch key={theme.id} theme={theme}
                  isActive={activeThemeId === theme.id}
                  onClick={() => setActiveThemeId(theme.id)} />
              ))}
            </div>
            {activeThemeId === "custom" && (
              <div className="nb-anim" style={{
                marginTop: "20px", padding: "16px", background: "#111",
                borderRadius: "14px", border: "1px solid #333",
              }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#eee", marginBottom: "8px" }}>
                  Custom Brand Colours
                </div>
                <ColorRow label="Accent" value={customColors.accent}
                  onChange={(v) => setCustomColors((p) => ({ ...p, accent: v }))} />
                <ColorRow label="Header" value={customColors.headerBg}
                  onChange={(v) => setCustomColors((p) => ({ ...p, headerBg: v }))} />
                <ColorRow label="Background" value={customColors.bg}
                  onChange={(v) => setCustomColors((p) => ({ ...p, bg: v }))} />
                <ColorRow label="Card" value={customColors.cardBg}
                  onChange={(v) => setCustomColors((p) => ({ ...p, cardBg: v }))} />
                <ColorRow label="Text" value={customColors.textPrimary}
                  onChange={(v) => setCustomColors((p) => ({ ...p, textPrimary: v }))} />
              </div>
            )}
          </div>
        )}

        {/* CONTENT */}
        {activePanel === "content" && (
          <div className="nb-anim" style={{ padding: "16px" }}>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", marginBottom: "6px" }}>
                NEWSLETTER TITLE
              </label>
              <input className="nb-input" value={title} onChange={(e) => setTitle(e.target.value)}
                style={{ ...inputStyle, fontFamily: "Georgia, serif", fontWeight: 600 }} />
            </div>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", marginBottom: "4px" }}>
                PERSONAL INTRO
              </label>
              <p style={{ fontSize: "11px", color: "#555", margin: "0 0 6px" }}>
                Optional opening paragraph for your audience
              </p>
              <textarea className="nb-input" value={introText} onChange={(e) => setIntroText(e.target.value)}
                placeholder="Good morning team — here are this week's key talent intelligence stories..."
                rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", marginBottom: "6px" }}>
                YOUR NAME
              </label>
              <input className="nb-input" value={senderName} onChange={(e) => setSenderName(e.target.value)}
                placeholder="Appears as 'Curated by...'" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", marginBottom: "6px" }}>
                ARTICLE ORDER
              </label>
              {articles.map((a, i) => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
                  background: "#111", borderRadius: "10px", border: "1px solid #222", marginBottom: "6px",
                }}>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#444", width: "18px" }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "12px", fontWeight: 600, color: "#ddd",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{a.title}</div>
                    <div style={{ fontSize: "10px", color: "#666" }}>{a.source_name} · {a.category}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {activePanel === "preview" && (
          <div className="nb-anim" style={{ padding: "12px" }}>
            <div style={{ borderRadius: "12px", overflow: "hidden", border: "1px solid #333", background: "#fff" }}>
              <iframe ref={previewRef} title="Newsletter preview" sandbox="allow-same-origin"
                style={{ width: "100%", height: "500px", border: "none", display: "block" }} />
            </div>
            <p style={{ fontSize: "11px", color: "#666", textAlign: "center", margin: "8px 0 0" }}>
              Scroll to preview the full newsletter
            </p>
          </div>
        )}

        {/* EXPORT */}
        {activePanel === "export" && (
          <div className="nb-anim" style={{ padding: "16px" }}>
            <p style={{ fontSize: "13px", color: "#999", margin: "0 0 20px" }}>
              Choose how to share your briefing
            </p>

            {/* Download options */}
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", marginBottom: "10px" }}>
              DOWNLOAD
            </div>
            {[
              { label: "Download HTML", desc: "Email-ready HTML file. Paste into your email tool's HTML editor.", icon: "📄", onClick: handleDownloadHtml },
              { label: "Save as PDF", desc: "Opens print dialog — choose 'Save as PDF'.", icon: "📑", onClick: handlePrintPdf },
              { label: "PowerPoint", desc: "Coming in Phase 2", icon: "📊", disabled: true },
              { label: "Word Document", desc: "Coming in Phase 2", icon: "📝", disabled: true },
            ].map((opt) => (
              <button key={opt.label} onClick={opt.disabled ? undefined : opt.onClick} style={{
                width: "100%", display: "flex", alignItems: "center", gap: "14px",
                padding: "14px 16px", marginBottom: "8px", borderRadius: "14px",
                border: "1px solid #222", background: "#111", cursor: opt.disabled ? "default" : "pointer",
                textAlign: "left", opacity: opt.disabled ? 0.4 : 1,
              }}>
                <span style={{ fontSize: "22px" }}>{opt.icon}</span>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#eee" }}>{opt.label}</div>
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{opt.desc}</div>
                </div>
              </button>
            ))}

            {/* Share options */}
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", margin: "24px 0 10px" }}>
              SHARE
            </div>
            {[
              { label: "Copy HTML to clipboard", desc: "Paste directly into your email tool's source editor.", icon: "📋", onClick: handleCopyHtml, highlight: true },
              { label: "Email with attachment", desc: "Downloads the file then opens your email client.", icon: "✉️", onClick: handleEmailWithHtml },
            ].map((opt) => (
              <button key={opt.label} onClick={opt.onClick} style={{
                width: "100%", display: "flex", alignItems: "center", gap: "14px",
                padding: "14px 16px", marginBottom: "8px", borderRadius: "14px",
                border: opt.highlight && copied ? "1px solid #00e5a0" : "1px solid #222",
                background: opt.highlight && copied ? "rgba(0,229,160,0.08)" : "#111",
                cursor: "pointer", textAlign: "left",
              }}>
                <span style={{ fontSize: "22px" }}>{opt.icon}</span>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: opt.highlight && copied ? "#00e5a0" : "#eee" }}>
                    {opt.highlight && copied ? "✓ Copied!" : opt.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

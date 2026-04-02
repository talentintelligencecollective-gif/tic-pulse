import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { generateNewsletterHtml, NEWSLETTER_THEMES } from "./emailTemplate.js";
import { supabase, loadUserPreferences, saveUserPreferences, lookupBrandGuidelines } from "./supabase.js";

// ─── Theme Swatch ───

function ThemeSwatch({ theme, isActive, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "12px", borderRadius: "12px",
      border: isActive ? `2px solid ${theme.accent}` : "2px solid #333",
      background: "#111", cursor: "pointer", textAlign: "left", position: "relative",
    }}>
      {badge && (
        <span style={{ position: "absolute", top: 6, right: 6, fontSize: "8px", fontWeight: 700, color: "#000", background: "#00e5a0", padding: "2px 6px", borderRadius: 6, letterSpacing: "0.5px" }}>{badge}</span>
      )}
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
//  NEWSLETTER BUILDER — Phase 3
//  - Auto-loads user preferences + brand guidelines
//  - Pre-populates sender name, intro, theme, colours
//  - Remembers changes (debounced save to Supabase)
//  - Supports media items (videos + episodes)
//  - Improved email export UX
// ═══════════════════════════════════════════════

export default function NewsletterBuilder({ articles, mediaItems = [], onClose, onToast, userId, session }) {
  // ─── State ───
  const [activeThemeId, setActiveThemeId] = useState("pulse");
  const [customColors, setCustomColors] = useState({ ...NEWSLETTER_THEMES.custom });
  const [title, setTitle] = useState("Talent Intelligence Briefing");
  const [introText, setIntroText] = useState("");
  const [senderName, setSenderName] = useState("");
  const [activePanel, setActivePanel] = useState("theme");
  const [copied, setCopied] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [brandMatch, setBrandMatch] = useState(null); // matched brand_guidelines row
  const [showBrandPrompt, setShowBrandPrompt] = useState(false);
  const [emailStep, setEmailStep] = useState(0); // 0=idle, 1=downloaded, 2=opened

  const previewRef = useRef(null);
  const saveTimerRef = useRef(null);

  // ─── Derive user info from session ───
  const userName = session?.user?.user_metadata?.full_name || "";

  // ─── Load preferences + brand guidelines on mount ───
  useEffect(() => {
    if (!userId) { setPrefsLoaded(true); return; }

    async function init() {
      // 1. Load saved preferences
      const prefs = await loadUserPreferences(userId);

      // 2. Load company from profiles table (company is NOT in user_metadata)
      let company = "";
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company, full_name")
          .eq("id", userId)
          .single();
        if (profile) company = profile.company || "";
      } catch {}

      if (prefs) {
        // Restore saved preferences
        if (prefs.newsletter_theme_id) setActiveThemeId(prefs.newsletter_theme_id);
        if (prefs.newsletter_custom_colors) setCustomColors(prefs.newsletter_custom_colors);
        if (prefs.newsletter_intro) setIntroText(prefs.newsletter_intro);
        if (prefs.newsletter_title) setTitle(prefs.newsletter_title);
        // Sender name: saved preference > profile name
        setSenderName(prefs.newsletter_sender_name || userName || "");
      } else {
        // First time: pre-populate from profile
        setSenderName(userName || "");
      }

      // 3. Brand guidelines lookup (if no saved brand preference yet)
      if (company && (!prefs || prefs.brand_source === "none")) {
        try {
          const brand = await lookupBrandGuidelines(company);
          if (brand) {
            setBrandMatch(brand);
            // Auto-apply brand colours to custom theme
            const brandColors = {
              ...NEWSLETTER_THEMES.custom,
              accent: brand.color_primary || NEWSLETTER_THEMES.custom.accent,
              headerBg: brand.color_header_bg || NEWSLETTER_THEMES.custom.headerBg,
              bg: brand.color_body_bg || NEWSLETTER_THEMES.custom.bg,
              cardBg: brand.color_card_bg || NEWSLETTER_THEMES.custom.cardBg,
              textPrimary: brand.color_text_primary || NEWSLETTER_THEMES.custom.textPrimary,
              textSecondary: brand.color_text_secondary || NEWSLETTER_THEMES.custom.textSecondary,
              border: brand.color_divider || NEWSLETTER_THEMES.custom.border,
              name: `${brand.company_name} Brand`,
              description: `Auto-matched from ${brand.company_name} guidelines`,
            };
            setCustomColors(brandColors);
            // Show prompt asking if these are their corporate colours
            if (!prefs || prefs.brand_source === "none") {
              setShowBrandPrompt(true);
            }
          }
        } catch (e) {
          console.error("Brand lookup failed:", e);
        }
      } else if (prefs && prefs.brand_source !== "none" && prefs.newsletter_custom_colors) {
        // Already have saved brand preference, use it
        setCustomColors(prefs.newsletter_custom_colors);
      }

      setPrefsLoaded(true);
    }
    init();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Debounced save preferences ───
  const persistPrefs = useCallback(() => {
    if (!userId || !prefsLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveUserPreferences(userId, {
        newsletter_theme_id: activeThemeId,
        newsletter_custom_colors: customColors,
        newsletter_intro: introText,
        newsletter_sender_name: senderName,
        newsletter_title: title,
      });
    }, 1500);
  }, [userId, prefsLoaded, activeThemeId, customColors, introText, senderName, title]);

  useEffect(() => {
    if (prefsLoaded) persistPrefs();
  }, [activeThemeId, customColors, introText, senderName, title, persistPrefs, prefsLoaded]);

  // Cleanup save timer
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  // ─── Brand prompt handler ───
  const handleBrandChoice = async (choice) => {
    // choice: 'corporate' or 'personal'
    setShowBrandPrompt(false);
    if (choice === "corporate" && brandMatch) {
      // Auto-select custom theme with brand colours
      setActiveThemeId("custom");
      await saveUserPreferences(userId, {
        brand_source: "corporate",
        brand_company_match: brandMatch.company_name,
        newsletter_theme_id: "custom",
        newsletter_custom_colors: customColors,
      });
      onToast?.(`${brandMatch.company_name} brand colours applied`);
    } else {
      await saveUserPreferences(userId, { brand_source: "personal" });
    }
  };

  // ─── Theme + HTML ───
  const activeTheme = useMemo(() => {
    if (activeThemeId === "custom") return { ...customColors, id: "custom" };
    return NEWSLETTER_THEMES[activeThemeId];
  }, [activeThemeId, customColors]);

  const totalItems = articles.length + mediaItems.length;

  const html = useMemo(() => {
    return generateNewsletterHtml({ articles, mediaItems, theme: activeTheme, introText, senderName, newsletterTitle: title });
  }, [articles, mediaItems, activeTheme, introText, senderName, title]);

  useEffect(() => {
    if (previewRef.current && activePanel === "preview") {
      const doc = previewRef.current.contentDocument;
      if (doc) { doc.open(); doc.write(html); doc.close(); }
    }
  }, [html, activePanel]);

  // ─── Export handlers ───
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
    onToast?.("Newsletter HTML copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tic-pulse-briefing-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast?.("Newsletter downloaded as HTML");
  };

  const handlePrintPdf = () => {
    const w = window.open("", "_blank");
    if (!w) { onToast?.("Please allow pop-ups to save as PDF"); return; }
    w.document.write(html); w.document.close();
    w.onload = () => setTimeout(() => w.print(), 400);
    onToast?.("Use 'Save as PDF' in the print dialog");
  };

  const handleEmailWithHtml = () => {
    // Step 1: Download the HTML file
    handleDownloadHtml();
    setEmailStep(1);

    // Step 2: After a short delay, open mailto
    setTimeout(() => {
      const subject = encodeURIComponent(title);
      const body = encodeURIComponent(
        `Hi,\n\nPlease find attached the latest ${title}.\n\n` +
        `The HTML file has been downloaded to your device — please attach it to this email.\n\n` +
        `Curated with TIC Pulse\n`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
      setEmailStep(2);
      // Reset after 5s
      setTimeout(() => setEmailStep(0), 5000);
    }, 800);
  };

  // ─── Render helpers ───
  const themeList = Object.values(NEWSLETTER_THEMES);
  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: "12px",
    border: "1px solid #333", background: "#111", color: "#eee",
    fontSize: "14px", outline: "none", fontFamily: "'DM Sans', sans-serif",
  };

  // All content items for the content panel
  const allItems = [
    ...articles.map((a) => ({ ...a, _type: "article" })),
    ...mediaItems.map((m) => ({ ...m, _type: m._mediaType || "media" })),
  ];

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
            {totalItems} item{totalItems !== 1 ? "s" : ""} selected
          </div>
        </div>
        <div style={{ width: "30px" }} />
      </div>

      {/* ── Brand Prompt Overlay ── */}
      {showBrandPrompt && brandMatch && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
          background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}>
          <div className="nb-anim" style={{
            background: "#111", border: "1px solid #333", borderRadius: "20px",
            padding: "28px 24px", maxWidth: "340px", width: "100%", textAlign: "center",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🎨</div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#eee", margin: "0 0 8px", fontFamily: "Georgia, serif" }}>
              {brandMatch.company_name} colours found
            </h3>
            <p style={{ fontSize: "13px", color: "#888", lineHeight: 1.6, margin: "0 0 6px" }}>
              We matched your company's brand guidelines. Would you like to use these as your newsletter colours?
            </p>
            {/* Preview swatch */}
            <div style={{ display: "flex", gap: "3px", margin: "16px 0", borderRadius: "8px", overflow: "hidden" }}>
              {[brandMatch.color_header_bg, brandMatch.color_body_bg, brandMatch.color_primary, brandMatch.color_accent || brandMatch.color_secondary].filter(Boolean).map((c, i) => (
                <div key={i} style={{ flex: 1, height: "28px", background: c }} />
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "#666", margin: "0 0 20px" }}>
              Are these your corporate colours or a personal preference?
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => handleBrandChoice("corporate")} style={{
                flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid #00e5a0",
                background: "rgba(0,229,160,0.08)", color: "#00e5a0", fontSize: "13px", fontWeight: 700,
              }}>Corporate colours</button>
              <button onClick={() => handleBrandChoice("personal")} style={{
                flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid #444",
                background: "#1a1a1e", color: "#ccc", fontSize: "13px", fontWeight: 600,
              }}>Personal pref</button>
            </div>
            <button onClick={() => setShowBrandPrompt(false)} style={{
              background: "none", border: "none", color: "#666", fontSize: "12px",
              marginTop: "12px", padding: "6px",
            }}>Skip for now</button>
          </div>
        </div>
      )}

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
            color: activePanel === tab.id ? "#00e5a0" : "#888",
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
                <ThemeSwatch key={theme.id} theme={theme.id === "custom" ? { ...theme, ...customColors } : theme}
                  isActive={activeThemeId === theme.id}
                  onClick={() => setActiveThemeId(theme.id)}
                  badge={theme.id === "custom" && brandMatch ? "AUTO" : null} />
              ))}
            </div>
            {activeThemeId === "custom" && (
              <div className="nb-anim" style={{
                marginTop: "20px", padding: "16px", background: "#111",
                borderRadius: "14px", border: "1px solid #333",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#eee" }}>
                    {brandMatch ? `${brandMatch.company_name} Brand Colours` : "Custom Brand Colours"}
                  </div>
                  {brandMatch && (
                    <span style={{ fontSize: "9px", fontWeight: 700, color: "#00e5a0", background: "rgba(0,229,160,0.1)", padding: "2px 8px", borderRadius: "6px" }}>AUTO-MATCHED</span>
                  )}
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
                {introText ? "Your saved intro — edit anytime" : "Optional opening paragraph for your audience"}
              </p>
              <textarea className="nb-input" value={introText} onChange={(e) => setIntroText(e.target.value)}
                placeholder="Good morning team — here are this week's key talent intelligence stories..."
                rows={4} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            </div>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", marginBottom: "6px" }}>
                CREATED BY
              </label>
              <input className="nb-input" value={senderName} onChange={(e) => setSenderName(e.target.value)}
                placeholder="Your name" style={inputStyle} />
              {senderName && senderName !== userName && (
                <p style={{ fontSize: "10px", color: "#555", margin: "4px 0 0" }}>
                  Your preference is saved — we'll remember this
                </p>
              )}
            </div>

            {/* Content items list */}
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#888", letterSpacing: "0.8px", marginBottom: "6px" }}>
                CONTENT ({totalItems} ITEMS)
              </label>
              {allItems.map((item, i) => {
                const typeIcon = item._type === "video" ? "▶" : item._type === "episode" ? "🎧" : "📰";
                const typeLabel = item._type === "video" ? "Video" : item._type === "episode" ? "Podcast" : item.source_name || "Article";
                const subtitle = item._type === "article" ? `${item.source_name || ""} · ${item.category || ""}` :
                  item._type === "video" ? `${item.channel_title || item.sources?.name || ""} · ${item.duration || ""}` :
                  `${item.sources?.name || ""} · ${item.duration || ""}`;
                return (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px",
                    background: "#111", borderRadius: "10px", border: "1px solid #222", marginBottom: "6px",
                  }}>
                    <span style={{ fontSize: "14px", width: "22px", textAlign: "center", flexShrink: 0 }}>{typeIcon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: "12px", fontWeight: 600, color: "#ddd",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{item.title}</div>
                      <div style={{ fontSize: "10px", color: "#666" }}>{subtitle}</div>
                    </div>
                  </div>
                );
              })}
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
              { label: "PowerPoint", desc: "Coming in Phase 4", icon: "📊", disabled: true },
              { label: "Word Document", desc: "Coming in Phase 4", icon: "📝", disabled: true },
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

            {/* Email — improved two-step UX */}
            <button onClick={handleEmailWithHtml} style={{
              width: "100%", display: "flex", alignItems: "center", gap: "14px",
              padding: "14px 16px", marginBottom: "8px", borderRadius: "14px",
              border: emailStep > 0 ? "1px solid #00e5a0" : "1px solid #222",
              background: emailStep > 0 ? "rgba(0,229,160,0.05)" : "#111",
              cursor: "pointer", textAlign: "left",
            }}>
              <span style={{ fontSize: "22px" }}>✉️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: emailStep > 0 ? "#00e5a0" : "#eee" }}>
                  {emailStep === 0 ? "Download & Draft Email" : emailStep === 1 ? "✓ File downloaded…" : "✓ Attach the downloaded file to your email"}
                </div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                  {emailStep === 0
                    ? "Downloads HTML, then opens your email client"
                    : "Attach the .html file from your downloads folder"}
                </div>
                {emailStep > 0 && (
                  <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "#00e5a0", color: "#000", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                      <span style={{ fontSize: "10px", color: "#00e5a0" }}>Downloaded</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: emailStep >= 2 ? "#00e5a0" : "#333", color: emailStep >= 2 ? "#000" : "#888", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{emailStep >= 2 ? "✓" : "2"}</div>
                      <span style={{ fontSize: "10px", color: emailStep >= 2 ? "#00e5a0" : "#888" }}>Attach to email</span>
                    </div>
                  </div>
                )}
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

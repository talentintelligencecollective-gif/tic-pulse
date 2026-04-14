// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Audio Briefing Component
//  Triggered from curation bar alongside Newsletter Builder
//  Stages: configure → generating → ready (player + download)
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";

const MAX_ARTICLES = 10;

// ─── Mic icon ───
function MicIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

// ─── Download icon ───
function DownloadIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ─── Link icon ───
function LinkIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// ─── Step indicator ───
function Steps({ stage }) {
  const steps = ["Articles", "Generating", "Ready"];
  const current = stage === "configure" ? 0 : stage === "generating" ? 1 : 2;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px" }}>
      {steps.map((label, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px", flex: i < 2 ? 1 : "none" }}>
          <div style={{
            width: "24px", height: "24px", borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700,
            flexShrink: 0,
            background: i < current ? "#00e5a0" : i === current ? "transparent" : "#1a1a1a",
            border: i === current ? "1.5px solid #00e5a0" : i < current ? "none" : "1px solid #333",
            color: i < current ? "#000" : i === current ? "#00e5a0" : "#555",
          }}>
            {i < current ? "✓" : i + 1}
          </div>
          {i < 2 && (
            <div style={{
              flex: 1, height: "1px",
              background: i < current ? "#00e5a0" : "#333",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════

export default function AudioBriefing({ articles, userId, onClose, onToast }) {
  const [stage, setStage] = useState("configure"); // configure | generating | ready | error
  const [generatingStep, setGeneratingStep] = useState("script"); // script | audio | uploading
  const [result, setResult] = useState(null); // { url, duration, articleCount }
  const [errorMsg, setErrorMsg] = useState("");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState("0:00");
  const [linkCopied, setLinkCopied] = useState(false);

  const audioRef = useRef(null);
  const cappedArticles = articles.slice(0, MAX_ARTICLES);

  // ─── Cleanup audio on unmount ───
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ─── Generate handler ───
  async function handleGenerate() {
    setStage("generating");
    setGeneratingStep("script");
    setErrorMsg("");

    try {
      // Show "writing script" for a moment before the real wait
      await new Promise((r) => setTimeout(r, 800));
      setGeneratingStep("audio");

      const response = await fetch("/.netlify/functions/generate-audio-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          articles: cappedArticles.map((a) => ({
            title: a.title,
            tldr: a.tldr,
            source_name: a.source_name,
            category: a.category,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Generation failed");
      }

      setResult(data);
      setStage("ready");
      onToast("Audio briefing ready");
    } catch (err) {
      console.error("[AudioBriefing]", err);
      setErrorMsg(err.message || "Something went wrong");
      setStage("error");
    }
  }

  // ─── Audio player handlers ───
  function handlePlayPause() {
    if (!result?.url) return;

    if (!audioRef.current) {
      const audio = new Audio(result.url);
      audioRef.current = audio;

      audio.addEventListener("timeupdate", () => {
        if (audio.duration) {
          setProgress((audio.currentTime / audio.duration) * 100);
          const m = Math.floor(audio.currentTime / 60);
          const s = Math.floor(audio.currentTime % 60);
          setCurrentTime(`${m}:${s.toString().padStart(2, "0")}`);
        }
      });

      audio.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
        setCurrentTime("0:00");
      });

      audio.addEventListener("error", () => {
        onToast("Audio playback failed — try downloading instead");
        setPlaying(false);
      });
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        onToast("Playback blocked — tap again to retry");
        setPlaying(false);
      });
      setPlaying(true);
    }
  }

  function handleScrub(e) {
    if (!audioRef.current || !audioRef.current.duration) return;
    const pct = parseFloat(e.target.value);
    audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
    setProgress(pct);
  }

  // ─── Download handler ───
  function handleDownload() {
    if (!result?.url) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = `tic-pulse-briefing-${new Date().toISOString().slice(0, 10)}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onToast("Downloading MP3...");
  }

  // ─── Copy link handler ───
  async function handleCopyLink() {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.url;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    onToast("Link copied — expires in 24 hours");
    setTimeout(() => setLinkCopied(false), 2500);
  }

  // ─── Shared styles ───
  const s: {
    wrap: CSSProperties;
    header: CSSProperties;
    body: CSSProperties;
    card: CSSProperties;
    sectionLabel: CSSProperties;
    btnPrimary: CSSProperties;
    btnSecondary: CSSProperties;
    actionRow: CSSProperties;
    actionIcon: CSSProperties;
  } = {
    wrap: {
      position: "fixed", inset: 0, zIndex: 2000, background: "#000",
      display: "flex", flexDirection: "column",
      maxWidth: "480px", margin: "0 auto",
      animation: "fadeSlide 0.25s cubic-bezier(0.16,1,0.3,1)",
    },
    header: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderBottom: "1px solid #222",
    },
    body: { flex: 1, overflowY: "auto", padding: "20px 16px 32px" },
    card: {
      background: "#111", borderRadius: "16px", border: "1px solid #222", padding: "16px",
      marginBottom: "12px",
    },
    sectionLabel: {
      fontSize: "11px", fontWeight: 700, color: "#666",
      letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "10px",
    },
    btnPrimary: {
      width: "100%", padding: "14px", borderRadius: "14px", border: "none",
      background: "#00e5a0", color: "#000", fontSize: "14px", fontWeight: 700,
      cursor: "pointer", marginTop: "12px", display: "flex", alignItems: "center",
      justifyContent: "center", gap: "8px",
    },
    btnSecondary: {
      width: "100%", padding: "12px", borderRadius: "14px",
      border: "1px solid #333", background: "transparent",
      color: "#ccc", fontSize: "13px", fontWeight: 600,
      cursor: "pointer", marginTop: "8px",
    },
    actionRow: {
      display: "flex", alignItems: "center", gap: "12px",
      padding: "13px 14px", borderRadius: "12px",
      border: "1px solid #222", background: "#111",
      marginBottom: "8px", cursor: "pointer",
    },
    actionIcon: {
      width: "34px", height: "34px", borderRadius: "10px",
      background: "#1a1a1a", display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
    },
  };

  const generatingStepLabel = {
    script: "Writing your briefing script...",
    audio: "Converting to audio...",
    uploading: "Finalising...",
  }[generatingStep];

  // ═══ RENDER ═══

  return (
    <div style={s.wrap}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{width:18%} 50%{width:88%} }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: "22px", lineHeight: 1, padding: "4px", cursor: "pointer" }}>✕</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>Audio Briefing</div>
          <div style={{ fontSize: "11px", color: "#666" }}>
            {stage === "ready" ? `${result?.articleCount} articles · ${result?.duration}` : `${cappedArticles.length} article${cappedArticles.length !== 1 ? "s" : ""} selected`}
          </div>
        </div>
        <div style={{ width: "30px" }} />
      </div>

      {/* Body */}
      <div style={s.body}>

        {/* ── CONFIGURE ── */}
        {stage === "configure" && (
          <>
            <Steps stage="configure" />

            {/* Article list */}
            <div style={s.sectionLabel}>Selected articles</div>
            <div style={s.card}>
              {cappedArticles.map((a, i) => (
                <div key={a.id || i} style={{
                  display: "flex", alignItems: "flex-start", gap: "10px",
                  padding: "9px 0",
                  borderBottom: i < cappedArticles.length - 1 ? "1px solid #1e1e1e" : "none",
                }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#00e5a0", flexShrink: 0, marginTop: "5px" }} />
                  <div>
                    <div style={{ fontSize: "12px", color: "#ddd", lineHeight: 1.4 }}>{a.title}</div>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
                      {a.source_name || "Unknown"}{a.category ? ` · ${a.category}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {articles.length > MAX_ARTICLES && (
                <div style={{ fontSize: "11px", color: "#555", paddingTop: "8px" }}>
                  First {MAX_ARTICLES} articles used (max per briefing)
                </div>
              )}
            </div>

            {/* Voice style */}
            <div style={{ ...s.sectionLabel, marginTop: "16px" }}>Voice style</div>

            {/* Free option — selected */}
            <div style={{ ...s.card, border: "1px solid rgba(0,229,160,0.3)", background: "rgba(0,229,160,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "rgba(0,229,160,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MicIcon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>Professional narrator</div>
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>Single voice, clear and authoritative</div>
                </div>
                <div style={{ fontSize: "10px", padding: "3px 9px", borderRadius: "20px", background: "rgba(0,229,160,0.12)", color: "#00a070", fontWeight: 700 }}>FREE</div>
              </div>
            </div>

            {/* Premium option — locked */}
            <div style={{ ...s.card, opacity: 0.45 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "rgba(168,85,247,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "18px" }}>🎧</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>Two-host dialogue</div>
                  <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>Conversational podcast format</div>
                </div>
                <div style={{ fontSize: "10px", padding: "3px 9px", borderRadius: "20px", background: "rgba(168,85,247,0.12)", color: "#a855f7", fontWeight: 700 }}>SOON</div>
              </div>
            </div>

            {/* Branding note */}
            <div style={{ fontSize: "11px", color: "#555", background: "#0d0d0d", borderRadius: "10px", padding: "10px 12px", marginTop: "8px", lineHeight: 1.6 }}>
              ℹ All free briefings close with a TIC credit. Premium plans will offer unbranded audio.
            </div>

            <button style={s.btnPrimary} onClick={handleGenerate}>
              <MicIcon size={16} /> Generate audio briefing
            </button>
          </>
        )}

        {/* ── GENERATING ── */}
        {stage === "generating" && (
          <>
            <Steps stage="generating" />

            <div style={{ ...s.card, textAlign: "center", padding: "32px 16px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>🎙</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#eee", marginBottom: "8px" }}>{generatingStepLabel}</div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "20px" }}>
                {generatingStep === "script" ? `Summarising ${cappedArticles.length} articles` : "This takes 10–30 seconds"}
              </div>
              <div style={{ height: "4px", background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#00e5a0", borderRadius: "2px", animation: "pulse 2s ease-in-out infinite" }} />
              </div>
            </div>

            <div style={{ ...s.card, opacity: 0.35 }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>🔊</div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#888" }}>Converting to audio</div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>Waiting for script...</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── ERROR ── */}
        {stage === "error" && (
          <>
            <div style={{ ...s.card, border: "1px solid rgba(239,68,68,0.3)", textAlign: "center", padding: "28px 16px" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#eee", marginBottom: "8px" }}>Generation failed</div>
              <div style={{ fontSize: "12px", color: "#888", lineHeight: 1.5 }}>{errorMsg}</div>
            </div>
            <button style={s.btnPrimary} onClick={() => setStage("configure")}>Try again</button>
            <button style={s.btnSecondary} onClick={onClose}>Close</button>
          </>
        )}

        {/* ── READY ── */}
        {stage === "ready" && result && (
          <>
            <Steps stage="ready" />

            {/* Player */}
            <div style={{ ...s.card, background: "#0d1a14", border: "1px solid rgba(0,229,160,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(0,229,160,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MicIcon size={20} />
                </div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#eee" }}>TIC Intelligence Briefing</div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                    {result.articleCount} articles · {result.duration} · Today
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <input
                type="range" min="0" max="100" value={progress}
                onChange={handleScrub}
                style={{ width: "100%", height: "3px", accentColor: "#00e5a0", marginBottom: "10px", cursor: "pointer" }}
              />

              {/* Controls row */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={handlePlayPause}
                  style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#00e5a0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  {playing
                    ? <svg width="14" height="14" viewBox="0 0 14 14" fill="#000"><rect x="1" y="1" width="4" height="12" rx="1"/><rect x="9" y="1" width="4" height="12" rx="1"/></svg>
                    : <svg width="13" height="15" viewBox="0 0 13 15" fill="#000"><path d="M1.5 1.5l10 6-10 6V1.5z"/></svg>
                  }
                </button>
                <div style={{ flex: 1, fontSize: "12px", color: "#888" }}>{currentTime} / {result.duration}</div>
              </div>
            </div>

            {/* Save & share */}
            <div style={{ ...s.sectionLabel, marginTop: "8px" }}>Save and share</div>

            <div style={s.actionRow} onClick={handleDownload}>
              <div style={s.actionIcon}><DownloadIcon /></div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>Download MP3</div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Save and share with your team</div>
              </div>
            </div>

            <div style={s.actionRow} onClick={handleCopyLink}>
              <div style={s.actionIcon}><LinkIcon /></div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: linkCopied ? "#00e5a0" : "#eee" }}>
                  {linkCopied ? "Link copied!" : "Copy link"}
                </div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Direct audio URL · expires in 24 hours</div>
              </div>
            </div>

            {/* Branding note */}
            <div style={{ fontSize: "11px", color: "#555", background: "#0d0d0d", borderRadius: "10px", padding: "10px 12px", marginTop: "4px", lineHeight: 1.6 }}>
              🎙 Closes with: <em style={{ color: "#666" }}>"With thanks to the Talent Intelligence Collective for this free news roundup."</em>
            </div>

            <button style={s.btnSecondary} onClick={() => { setStage("configure"); setResult(null); setPlaying(false); setProgress(0); setCurrentTime("0:00"); if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } }}>
              Generate new briefing
            </button>
          </>
        )}
      </div>
    </div>
  );
}

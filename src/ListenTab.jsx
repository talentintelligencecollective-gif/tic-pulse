// ═══════════════════════════════════════════════════════════════
//  TIC PULSE — Listen Tab (Podcast Episodes)
//  Episode list with audio playback, source filters,
//  expandable descriptions, and platform links
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo } from "react";
import { useEpisodes, useSources, formatRelativeDate } from "./useMultimedia";

const T = {
  bg0: "#050507", bg1: "#0a0a0e", bg2: "#111116", bg3: "#18181f", bg4: "#222230",
  accent: "#00e5a0", accentDim: "rgba(0,229,160,0.12)",
  red: "#ff4d6a", amber: "#fbbf24", blue: "#60a5fa", purple: "#a78bfa",
  t1: "#f0f0f5", t2: "#b0b0be", t3: "#707080", t4: "#50505e",
  border: "#1e1e2a", borderLight: "#2a2a38",
  font: "'DM Serif Display', Georgia, serif",
  sans: "'Syne', 'Helvetica Neue', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

const tierColors = { "1": T.accent, "2": T.amber, "3": T.blue, S: T.purple };

// ─── Waveform Animation ───
function Waveform({ playing, color = T.accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
      {[12, 18, 8, 16, 10, 14, 6].map((h, i) => (
        <div key={i} style={{
          width: 2.5, borderRadius: 2, background: color,
          height: playing ? undefined : 4,
          animation: playing ? `waveform 0.${4 + (i % 3)}s ease-in-out infinite` : "none",
          animationDelay: playing ? `${i * 0.07}s` : undefined,
          "--h": `${h}px`,
          transition: "height 0.2s",
        }}/>
      ))}
      <style>{`@keyframes waveform{0%,100%{height:4px;}50%{height:var(--h,16px);}}`}</style>
    </div>
  );
}

// ─── Source Header Card ───
function SourceHeader({ source }) {
  const tc = tierColors[source.tier] || T.t3;
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "center",
      padding: "10px 14px", background: T.bg2, borderRadius: 10,
      border: `1px solid ${T.border}`,
    }}>
      {/* Source avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg, ${tc}15, ${tc}08)`,
        border: `1px solid ${tc}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontFamily: T.sans, fontWeight: 700, color: tc,
      }}>{source.name.charAt(0)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.font, fontSize: 14, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {source.name}
        </div>
        {source.host && (
          <div style={{ fontSize: 11, fontFamily: T.sans, color: T.t3 }}>{source.host}</div>
        )}
      </div>
      <div style={{
        padding: "3px 7px", borderRadius: 6, fontSize: 8, fontFamily: T.mono,
        fontWeight: 700, background: `${tc}15`, color: tc,
        textTransform: "uppercase", letterSpacing: 1,
      }}>Tier {source.tier}</div>
    </div>
  );
}

// ─── Episode Card ───
function EpisodeCard({ episode, isPlaying, onPlay, isExpanded, onToggleExpand }) {
  const tc = tierColors[episode.sources?.tier] || T.accent;

  return (
    <div style={{
      background: T.bg2, borderRadius: 12, overflow: "hidden",
      border: `1px solid ${isPlaying ? T.accent : T.border}`,
      transition: "border-color 0.3s",
    }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {/* Play button */}
          <button onClick={onPlay} style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: isPlaying ? T.accent : T.bg4,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s", marginTop: 2,
            border: "none", cursor: "pointer",
          }}>
            {isPlaying ? (
              <div style={{ display: "flex", gap: 3 }}>
                <div style={{ width: 3, height: 14, background: T.bg0, borderRadius: 1 }}/>
                <div style={{ width: 3, height: 14, background: T.bg0, borderRadius: 1 }}/>
              </div>
            ) : (
              <div style={{
                width: 0, height: 0,
                borderLeft: `10px solid ${T.t1}`,
                borderTop: "7px solid transparent",
                borderBottom: "7px solid transparent",
                marginLeft: 2,
              }}/>
            )}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Source + date line */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10, fontFamily: T.mono, fontWeight: 700, color: tc,
                padding: "1px 5px", borderRadius: 3, background: `${tc}12`,
              }}>{episode.sources?.name || "Unknown"}</span>
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.t4 }}>
                {formatRelativeDate(episode.published_at)}
              </span>
              {isPlaying && <Waveform playing={true}/>}
            </div>

            {/* Title */}
            <div style={{ fontFamily: T.font, fontSize: 15, color: T.t1, lineHeight: 1.3, marginBottom: 6 }}>
              {episode.title}
            </div>

            {/* Guest info */}
            {episode.guest_name && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontFamily: T.sans, color: T.t2, fontWeight: 500 }}>
                  {episode.guest_name}
                </span>
                {episode.guest_org && (
                  <>
                    <span style={{ fontSize: 10, color: T.t4 }}>·</span>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.t4 }}>{episode.guest_org}</span>
                  </>
                )}
              </div>
            )}

            {/* Expanded description */}
            {isExpanded && episode.description && (
              <div className="fadeUp" style={{
                marginTop: 8, marginBottom: 8,
                fontSize: 12, fontFamily: T.sans, color: T.t3, lineHeight: 1.6,
                padding: "10px 12px", background: T.bg3, borderRadius: 8,
                maxHeight: 200, overflowY: "auto",
              }}>
                {episode.description}
              </div>
            )}

            {/* Keyword matches (Tier S) */}
            {episode.keyword_matches?.length > 0 && (
              <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
                {episode.keyword_matches.map(kw => (
                  <span key={kw} style={{
                    fontSize: 8, fontFamily: T.mono, padding: "1px 5px", borderRadius: 3,
                    background: `${T.purple}12`, color: T.purple,
                  }}>{kw}</span>
                ))}
              </div>
            )}

            {/* Meta bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {episode.duration && (
                <span style={{ fontSize: 10, fontFamily: T.mono, color: T.t4 }}>⏱ {episode.duration}</span>
              )}
              {episode.listen_count > 0 && (
                <span style={{ fontSize: 10, fontFamily: T.mono, color: T.t4 }}>🎧 {episode.listen_count}</span>
              )}
              {episode.link && (
                <a href={episode.link} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 10, fontFamily: T.mono, color: T.accent, textDecoration: "none" }}
                >↗ Open</a>
              )}
              <button onClick={onToggleExpand}
                style={{
                  fontSize: 10, fontFamily: T.sans, color: T.accent,
                  marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                }}
              >{isExpanded ? "Less ↑" : "More ↓"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ListenTab ───
export default function ListenTab() {
  const [sourceFilter, setSourceFilter] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const audioRef = useRef(null);

  const { episodes, loading } = useEpisodes({ limit: 80, sourceId: sourceFilter });
  const { sources } = useSources("podcast");

  // Handle audio playback
  useEffect(() => {
    if (!playing) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }

    const ep = episodes.find(e => e.id === playing);
    if (ep?.audio_url) {
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(ep.audio_url);
      audioRef.current.play().catch(() => {});
      audioRef.current.onended = () => setPlaying(null);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [playing]);

  return (
    <div>
      {/* Source filter */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 14px", overflowX: "auto", flexWrap: "nowrap" }}>
        <button onClick={() => setSourceFilter(null)} style={{
          padding: "6px 12px", borderRadius: 20, fontSize: 11, fontFamily: T.sans, fontWeight: 600,
          background: !sourceFilter ? T.accent : T.bg3, color: !sourceFilter ? T.bg0 : T.t2,
          border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}>All Shows</button>
        {sources.map(s => {
          const tc = tierColors[s.tier] || T.t3;
          return (
            <button key={s.id} onClick={() => setSourceFilter(sourceFilter === s.id ? null : s.id)} style={{
              padding: "6px 12px", borderRadius: 20, fontSize: 11, fontFamily: T.sans, fontWeight: 600,
              background: sourceFilter === s.id ? tc : T.bg3,
              color: sourceFilter === s.id ? T.bg0 : T.t2,
              border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}>{s.name.length > 22 ? s.name.substring(0, 20) + "…" : s.name}</button>
          );
        })}
      </div>

      {/* Selected source header */}
      {sourceFilter && sources.find(s => s.id === sourceFilter) && (
        <div style={{ padding: "0 16px 12px" }}>
          <SourceHeader source={sources.find(s => s.id === sourceFilter)} />
        </div>
      )}

      {/* Platform links (shown when no source filter or TIC selected) */}
      {(!sourceFilter || sources.find(s => s.id === sourceFilter)?.tier === "1") && (
        <div style={{ display: "flex", gap: 6, padding: "0 16px 14px", justifyContent: "center" }}>
          {["Spotify", "Apple Podcasts", "YouTube", "RSS"].map(p => (
            <button key={p} style={{
              padding: "5px 10px", borderRadius: 16, fontSize: 10, fontFamily: T.sans, fontWeight: 600,
              background: T.bg3, color: T.t3, border: `1px solid ${T.border}`,
              cursor: "pointer", transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.target.style.borderColor = T.accent; e.target.style.color = T.accent; }}
              onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.t3; }}
            >{p}</button>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: T.t4, fontFamily: T.mono, fontSize: 12 }}>
          Loading episodes...
        </div>
      )}

      {/* Episode list */}
      {!loading && (
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {episodes.map(ep => (
            <EpisodeCard
              key={ep.id}
              episode={ep}
              isPlaying={playing === ep.id}
              onPlay={() => setPlaying(playing === ep.id ? null : ep.id)}
              isExpanded={expanded === ep.id}
              onToggleExpand={() => setExpanded(expanded === ep.id ? null : ep.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && episodes.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.t4, fontFamily: T.sans, fontSize: 13 }}>
          No episodes found. Try selecting a different source.
        </div>
      )}

      {/* Stats bar */}
      {!loading && episodes.length > 0 && (
        <div style={{
          margin: "20px 16px 0", padding: "12px 16px",
          background: T.bg2, borderRadius: 8, border: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-around",
        }}>
          {[
            { label: "Shows", value: sources.filter(s => s.active).length },
            { label: "Episodes", value: episodes.length },
            { label: "Total Hours", value: Math.round(episodes.reduce((sum, e) => sum + (e.duration_seconds || 0), 0) / 3600) },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontFamily: T.font, color: T.t1 }}>{s.value}</div>
              <div style={{ fontSize: 9, fontFamily: T.mono, color: T.t4, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

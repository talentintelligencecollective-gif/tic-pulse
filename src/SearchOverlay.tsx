// ═══════════════════════════════════════════════════════════════
//  TIC PULSE — Unified Search Overlay
//  Searches across news, videos, and podcast episodes
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { formatRelativeDate, formatViewCount } from "./useMultimedia";

const T = {
  bg0: "#050507", bg1: "#0a0a0e", bg2: "#111116", bg3: "#18181f", bg4: "#222230",
  accent: "#00e5a0", red: "#ff4d6a", amber: "#fbbf24", blue: "#60a5fa", purple: "#a78bfa",
  t1: "#f0f0f5", t2: "#b0b0be", t3: "#707080", t4: "#50505e",
  border: "#1e1e2a", borderLight: "#2a2a38",
  font: "'DM Serif Display', Georgia, serif",
  sans: "'Syne', 'Helvetica Neue', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

const sentimentColor = (s) => s === "positive" ? T.accent : s === "negative" ? T.red : T.amber;

export default function SearchOverlay({ open, onClose, onSelectVideo, onSelectEpisode, onSelectArticle }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ videos: [], episodes: [], articles: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults({ videos: [], episodes: [], articles: [] });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ videos: [], episodes: [], articles: [] });
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const q = `%${query}%`;

        // Search videos
        const { data: videos } = await supabase
          .from("videos")
          .select("*, sources(name, tier)")
          .or(`title.ilike.${q},channel_title.ilike.${q},description.ilike.${q}`)
          .order("published_at", { ascending: false })
          .limit(5);

        // Search episodes
        const { data: episodes } = await supabase
          .from("episodes")
          .select("*, sources(name, tier)")
          .or(`title.ilike.${q},guest_name.ilike.${q},description.ilike.${q}`)
          .order("published_at", { ascending: false })
          .limit(5);

        // Search articles (existing GDELT table)
        let articles = [];
        try {
          const { data } = await supabase
            .from("articles")
            .select("*")
            .or(`title.ilike.${q},source.ilike.${q},summary.ilike.${q}`)
            .order("published_at", { ascending: false })
            .limit(5);
          articles = data || [];
        } catch (e) {
          // articles table might not exist yet
        }

        setResults({
          videos: videos || [],
          episodes: episodes || [],
          articles: articles || [],
        });
      } catch (e) {
        console.error("[search]", e);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (!open) return null;

  const hasResults = results.videos.length + results.episodes.length + results.articles.length > 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(14px)",
    }}>
      <div className="fadeUp" style={{
        maxWidth: 480, margin: "0 auto", padding: "20px 16px",
        height: "100%", display: "flex", flexDirection: "column",
      }}>
        {/* Search input */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search videos, episodes, articles..."
              style={{
                width: "100%", padding: "12px 16px 12px 40px", fontSize: 15, fontFamily: T.sans,
                background: T.bg2, border: `1px solid ${T.borderLight}`,
                borderRadius: 8, color: T.t1,
              }}
            />
            <span style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              fontSize: 16, color: T.t4,
            }}>⌕</span>
          </div>
          <button onClick={onClose} style={{
            fontSize: 13, fontFamily: T.sans, color: T.t3,
            padding: "8px 12px", background: "none", border: "none", cursor: "pointer",
          }}>Cancel</button>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ textAlign: "center", marginTop: 40, color: T.t4, fontFamily: T.mono, fontSize: 12 }}>
              Searching...
            </div>
          )}

          {query.length >= 2 && !loading && !hasResults && (
            <div style={{ textAlign: "center", marginTop: 60, color: T.t4, fontFamily: T.sans, fontSize: 14 }}>
              No results for "{query}"
            </div>
          )}

          {/* Videos */}
          {results.videos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 10, fontFamily: T.mono, color: T.t4,
                textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, paddingLeft: 4,
              }}>Videos ({results.videos.length})</div>
              {results.videos.map(v => (
                <div key={v.id} onClick={() => { onSelectVideo?.(v); onClose(); }}
                  style={{ display: "flex", gap: 10, padding: "8px 4px", alignItems: "center", cursor: "pointer", borderRadius: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bg3}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.blue, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontFamily: T.sans, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {v.title}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.t4 }}>
                      {v.channel_title} · {formatViewCount(v.view_count)} views · {v.duration}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Episodes */}
          {results.episodes.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 10, fontFamily: T.mono, color: T.t4,
                textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, paddingLeft: 4,
              }}>Podcast Episodes ({results.episodes.length})</div>
              {results.episodes.map(e => (
                <div key={e.id} onClick={() => { onSelectEpisode?.(e); onClose(); }}
                  style={{ display: "flex", gap: 10, padding: "8px 4px", alignItems: "center", cursor: "pointer", borderRadius: 6 }}
                  onMouseEnter={ev => ev.currentTarget.style.background = T.bg3}
                  onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontFamily: T.sans, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.title}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.t4 }}>
                      {e.sources?.name} · {e.guest_name || "No guest"} · {e.duration}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Articles */}
          {results.articles.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontFamily: T.mono, color: T.t4,
                textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, paddingLeft: 4,
              }}>News ({results.articles.length})</div>
              {results.articles.map(a => (
                <div key={a.id} onClick={() => { onSelectArticle?.(a); onClose(); }}
                  style={{ display: "flex", gap: 10, padding: "8px 4px", alignItems: "center", cursor: "pointer", borderRadius: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bg3}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: sentimentColor(a.sentiment), flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontFamily: T.sans, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: T.mono, color: T.t4 }}>
                      {a.source} · {formatRelativeDate(a.published_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Idle state */}
          {query.length < 2 && !loading && (
            <div style={{ textAlign: "center", marginTop: 60, color: T.t4, fontFamily: T.sans, fontSize: 13 }}>
              Search across all TIC Pulse content — news, videos, and podcast episodes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

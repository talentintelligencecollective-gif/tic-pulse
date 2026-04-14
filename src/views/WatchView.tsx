import { useState, useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import { WATCH_TAB_VIDEO_LIMIT } from "../constants/feed";
import { relDate, fmtViews, videoTypeColor, videoTypeLabel } from "../lib/videoDisplay";

export function WatchView({
  selectedVideos,
  onToggleVideo,
}: {
  selectedVideos: { id: string }[];
  onToggleVideo: Dispatch<SetStateAction<unknown[]>>;
}) {

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState(null);

  const selectedVideoIds = useMemo(() => new Set((selectedVideos || []).map(v => v.id)), [selectedVideos]);

  useEffect(() => {
    async function load() {
      try {
        let q = supabase.from("videos").select("*, sources(name, tier)")
          .order("published_at", { ascending: false }).limit(WATCH_TAB_VIDEO_LIMIT);
        if (typeFilter !== "all") q = q.eq("video_type", typeFilter);
        const { data } = await q;
        setVideos(data || []);
      } catch { setVideos([]); }
      setLoading(false);
    }
    setLoading(true); load();
  }, [typeFilter]);

  const topTopics = useMemo(() => {
    const counts = {};
    for (const v of videos) {
      for (const tag of (v.tags || [])) {
        const clean = tag.toLowerCase().trim();
        if (clean.length > 2) counts[clean] = (counts[clean] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }, [videos]);

  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (topicFilter) {
        const hasTopic = (v.tags || []).some(t => t.toLowerCase().trim() === topicFilter);
        if (!hasTopic) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inTitle = (v.title || "").toLowerCase().includes(q);
        const inDesc = (v.description || "").toLowerCase().includes(q);
        const inChannel = (v.channel_title || "").toLowerCase().includes(q);
        const inTags = (v.tags || []).some(t => t.toLowerCase().includes(q));
        return inTitle || inDesc || inChannel || inTags;
      }
      return true;
    });
  }, [videos, searchQuery, topicFilter]);

  if (selected) {
    return (
      <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease", background: "#000", minHeight: "calc(100vh - 120px)" }}>
        <div style={{ background: "#111", borderRadius: "16px", border: "1px solid #333", overflow: "hidden" }}>
          <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
            <iframe src={`https://www.youtube.com/embed/${selected.youtube_id}?rel=0`} style={{ width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={selected.title} />
          </div>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", padding: "3px 8px", borderRadius: 4, background: `${videoTypeColor(selected.video_type)}20`, color: videoTypeColor(selected.video_type), fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{videoTypeLabel(selected.video_type)}</span>
              <span style={{ fontSize: 11, color: "#666", marginLeft: "auto" }}>{relDate(selected.published_at)}</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#eee", margin: "0 0 10px", lineHeight: 1.3, fontFamily: "Georgia, serif" }}>{selected.title}</h3>
            <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#888" }}>▶ {fmtViews(selected.view_count)} views</span>
              <span style={{ fontSize: 12, color: "#888" }}>⏱ {selected.duration}</span>
              {selected.channel_title && <span style={{ fontSize: 12, color: "#00e5a0" }}>{selected.channel_title}</span>}
            </div>
            {selected.tags?.length > 0 && (
              <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
                {selected.tags.slice(0, 8).map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#1a1a1e", color: "#888", border: "1px solid #333" }}>{tag}</span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSelected(null)} style={{ padding: "8px 16px", borderRadius: 10, fontSize: 12, background: "#1a1a1e", color: "#ccc", border: "1px solid #333" }}>← Back</button>
              <a href={`https://www.youtube.com/watch?v=${selected.youtube_id}`} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "#00e5a0", color: "#000", display: "inline-block", textDecoration: "none" }}>Watch on YouTube ↗</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease", background: "#000", minHeight: "calc(100vh - 120px)" }}>
      <div style={{ marginBottom: 12, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#111", borderRadius: 14, padding: "0 14px", border: "1px solid #333" }}>
          <span style={{ fontSize: 14, color: "#666" }}>⌕</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search videos by topic, keyword, channel…"
            style={{ flex: 1, background: "none", border: "none", color: "#eee", padding: "11px 0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#888", width: 20, height: 20, borderRadius: "50%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
        {["all", "podcast", "video", "short", "panel", "event"].map(t => {
          const isActive = typeFilter === t;
          const color = t === "all" ? "#00e5a0" : videoTypeColor(t);
          return (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: "5px 14px", borderRadius: "20px", whiteSpace: "nowrap", fontSize: 11, fontWeight: 700,
              background: isActive ? `${color}18` : "#111", color: isActive ? color : "#888",
              border: `1px solid ${isActive ? color + "40" : "#222"}`, transition: "all 0.2s",
            }}>{t === "all" ? "All" : videoTypeLabel(t)}</button>
          );
        })}
      </div>

      {topTopics.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
          {topicFilter && (
            <button onClick={() => setTopicFilter(null)} style={{
              padding: "4px 10px", borderRadius: 14, fontSize: 10, fontWeight: 600,
              background: "rgba(255,59,92,0.1)", color: "#ff3b5c", border: "1px solid rgba(255,59,92,0.3)",
              whiteSpace: "nowrap",
            }}>✕ Clear</button>
          )}
          {topTopics.map(({ tag, count }) => {
            const isActive = topicFilter === tag;
            return (
              <button key={tag} onClick={() => setTopicFilter(isActive ? null : tag)} style={{
                padding: "4px 10px", borderRadius: 14, fontSize: 10, fontWeight: 600,
                background: isActive ? "rgba(0,229,160,0.12)" : "#0a0a0a",
                color: isActive ? "#00e5a0" : "#777",
                border: `1px solid ${isActive ? "rgba(0,229,160,0.3)" : "#1a1a1a"}`,
                whiteSpace: "nowrap", transition: "all 0.2s",
              }}>{tag} <span style={{ color: "#555", marginLeft: 2 }}>{String(count)}</span></button>
            );
          })}
        </div>
      )}

      {(searchQuery || topicFilter) && !loading && (
        <div style={{ padding: "0 8px 10px", fontSize: 11, color: "#666" }}>
          {filteredVideos.length} video{filteredVideos.length !== 1 ? "s" : ""} found
          {topicFilter && <span> for <span style={{ color: "#00e5a0" }}>{topicFilter}</span></span>}
          {searchQuery && <span> matching <span style={{ color: "#00e5a0" }}>"{searchQuery}"</span></span>}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#666", fontSize: 13 }}>Loading videos…</div>
      ) : filteredVideos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📺</div>
          <p style={{ fontSize: 14, color: "#888" }}>{searchQuery || topicFilter ? "No videos match your search" : "No videos yet — they'll appear once the YouTube fetcher runs"}</p>
          {(searchQuery || topicFilter) && (
            <button onClick={() => { setSearchQuery(""); setTopicFilter(null); }} style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)", color: "#00e5a0", padding: "8px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, marginTop: 12 }}>Clear filters</button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {filteredVideos.map((v, i) => {
            const tc = videoTypeColor(v.video_type);
            const thumbUrl = v.thumbnail_url || (v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg` : null);
            const isVidSelected = selectedVideoIds.has(v.id);
            return (
              <div key={v.id} style={{
                cursor: "pointer", background: "#111", borderRadius: 14, overflow: "hidden",
                border: `1px solid ${isVidSelected ? "#00e5a0" : "#222"}`,
                transition: "border-color 0.2s, transform 0.15s",
                animation: `cardIn 0.3s ease ${i * 0.03}s both`,
                boxShadow: isVidSelected ? "0 0 16px rgba(0,229,160,0.08)" : "none",
              }}
                onMouseEnter={e => { if (!isVidSelected) { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.transform = "translateY(-2px)"; }}}
                onMouseLeave={e => { if (!isVidSelected) { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.transform = "none"; }}}
              >
                <div onClick={() => setSelected(v)} style={{ width: "100%", aspectRatio: "16/9", position: "relative", background: thumbUrl ? `url(${thumbUrl}) center/cover` : "linear-gradient(135deg, #111, #000)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ position: "absolute", top: 6, left: 6, fontSize: 8, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: `${tc}30`, color: tc, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{videoTypeLabel(v.video_type)}</span>
                  {v.duration && <span style={{ position: "absolute", bottom: 6, right: 6, fontSize: 10, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: "rgba(0,0,0,0.8)", color: "#ccc" }}>{v.duration}</span>}
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "1.5px solid rgba(0,229,160,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 0, height: 0, borderLeft: "9px solid #00e5a0", borderTop: "6px solid transparent", borderBottom: "6px solid transparent", marginLeft: 2 }} />
                  </div>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div onClick={() => setSelected(v)} style={{ fontSize: 13, fontWeight: 700, color: "#eee", lineHeight: 1.3, marginBottom: 5, fontFamily: "Georgia, serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#888" }}>{v.channel_title || v.sources?.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVideo((prev) => {
                          const p = prev as { id: string }[];
                          return isVidSelected ? p.filter((x) => x.id !== v.id) : [...p, v];
                        });
                      }}
                      style={{
                        background: isVidSelected ? "#00e5a0" : "none",
                        border: isVidSelected ? "none" : "1.5px solid #333",
                        width: 22, height: 22, borderRadius: 6,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: isVidSelected ? "#000" : "#666", flexShrink: 0, transition: "all 0.2s",
                      }}
                      title={isVidSelected ? "Remove from briefing" : "Add to briefing"}
                    >
                      {isVidSelected
                        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      }
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

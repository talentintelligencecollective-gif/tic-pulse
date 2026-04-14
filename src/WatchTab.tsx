// ═══════════════════════════════════════════════════════════════
//  TIC PULSE — Watch Tab (YouTube Videos)
//  Grid layout with type filters, source badges, and detail view
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import type { VideoRow, SourceRow } from "./useMultimedia";
import { useVideos, useSources, formatRelativeDate, formatViewCount } from "./useMultimedia";

// Design tokens (import from your main tokens file or inline)
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

const typeColors = {
  podcast: T.accent, event: T.amber, panel: T.purple,
  short: T.blue, video: T.t3,
};
const typeLabels = {
  podcast: "Podcast", event: "Event", panel: "Panel",
  short: "Short", video: "Video",
};
const tierColors: Record<string, string> = { "1": T.accent, "2": T.amber, "3": T.blue, S: T.purple };

// ─── Video Thumbnail ───
function VideoThumb({
  video,
  onClick,
}: {
  video: VideoRow;
  onClick: () => void;
}) {
  const vt = String(video.video_type ?? "video");
  const tc = typeColors[vt] || T.t3;
  const gradients = {
    podcast: ["#0a2a1f", "#0d3d2e"], event: ["#2a1a0a", "#3d2e0d"],
    panel: ["#1a0a2a", "#2e0d3d"], short: ["#0a1a2a", "#0d2e3d"],
    video: ["#0a0a1a", "#0d0d2e"],
  };
  const [c1, c2] = gradients[vt] || gradients.video;

  return (
    <div onClick={onClick} style={{
      cursor: "pointer", background: T.bg2, borderRadius: 12,
      overflow: "hidden", border: `1px solid ${T.border}`,
      transition: "border-color 0.2s, transform 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderLight; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Thumbnail */}
      <div style={{
        width: "100%", aspectRatio: "16/9", position: "relative",
        background: video.thumbnail_url
          ? `url(${video.thumbnail_url}) center/cover`
          : `linear-gradient(135deg, ${c1}, ${c2})`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {!video.thumbnail_url && (
          <div style={{ fontSize: 10, fontFamily: T.mono, color: tc, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>
            {typeLabels[vt as keyof typeof typeLabels] || "Video"}
          </div>
        )}
        {/* Duration badge */}
        {video.duration && (
          <div style={{
            position: "absolute", bottom: 6, right: 6,
            background: "rgba(0,0,0,0.85)", borderRadius: 4,
            padding: "2px 6px", fontSize: 10, fontFamily: T.mono, color: T.t2,
          }}>{video.duration}</div>
        )}
        {/* Type badge */}
        <div style={{
          position: "absolute", top: 6, left: 6,
          padding: "2px 6px", borderRadius: 4, fontSize: 9, fontFamily: T.mono,
          fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
          background: `${tc}25`, color: tc,
        }}>{typeLabels[vt as keyof typeof typeLabels] || "Video"}</div>
        {/* Play overlay */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 40, height: 40, borderRadius: "50%",
          background: "rgba(0,0,0,0.5)", border: `2px solid ${T.accent}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: video.thumbnail_url ? 1 : 0.6,
        }}>
          <div style={{ width: 0, height: 0, borderLeft: `10px solid ${T.accent}`, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", marginLeft: 2 }}/>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px" }}>
        <div style={{
          fontFamily: T.font, fontSize: 13, color: T.t1, lineHeight: 1.3, marginBottom: 6,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{video.title}</div>
        <div style={{ fontSize: 11, fontFamily: T.sans, color: T.accent, fontWeight: 600, marginBottom: 2 }}>
          {video.channel_title || video.sources?.name}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.t4 }}>
            {formatViewCount(video.view_count)} views
          </span>
          <span style={{ fontSize: 10, fontFamily: T.mono, color: T.t4 }}>
            {formatRelativeDate(video.published_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Video Detail View ───
function VideoDetail({
  video,
  onBack,
}: {
  video: VideoRow;
  onBack: () => void;
}) {
  const vt = String(video.video_type ?? "video");
  const tc = typeColors[vt] || T.t3;

  return (
    <div className="fadeUp" style={{ padding: "0 16px" }}>
      <div style={{ background: T.bg2, borderRadius: 12, border: `1px solid ${T.accent}40`, overflow: "hidden" }}>
        {/* Embedded YouTube player */}
        <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
          <iframe
            src={`https://www.youtube.com/embed/${video.youtube_id}?rel=0`}
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={video.title}
          />
        </div>

        <div style={{ padding: 16 }}>
          {/* Type + source badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 9, fontFamily: T.mono, padding: "3px 8px", borderRadius: 4,
              background: `${tc}20`, color: tc, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: 1,
            }}>{typeLabels[vt as keyof typeof typeLabels] || "Video"}</span>
            {video.sources?.tier && (
              <span style={{
                fontSize: 9, fontFamily: T.mono, padding: "3px 8px", borderRadius: 4,
                background: `${tierColors[String(video.sources.tier)]}15`,
                color: tierColors[String(video.sources.tier)],
                fontWeight: 600, letterSpacing: 1,
              }}>TIER {video.sources.tier}</span>
            )}
            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.t4, marginLeft: "auto" }}>
              {formatRelativeDate(video.published_at)}
            </span>
          </div>

          {/* Title */}
          <div style={{ fontFamily: T.font, fontSize: 18, color: T.t1, lineHeight: 1.3, marginBottom: 12 }}>
            {video.title}
          </div>

          {/* Channel info */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: T.bg4,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontFamily: T.sans, fontWeight: 700, color: T.accent,
            }}>{(video.channel_title || "?").charAt(0)}</div>
            <div>
              <div style={{ fontSize: 13, fontFamily: T.sans, fontWeight: 600, color: T.t1 }}>
                {video.channel_title || video.sources?.name}
              </div>
              {video.sources?.host && (
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.t3 }}>{video.sources.host}</div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.t3 }}>▶ {formatViewCount(video.view_count)} views</span>
            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.t3 }}>♡ {formatViewCount(video.like_count)}</span>
            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.t3 }}>💬 {formatViewCount(video.comment_count)}</span>
            {video.duration && <span style={{ fontSize: 11, fontFamily: T.mono, color: T.t3 }}>⏱ {video.duration}</span>}
          </div>

          {/* Description (truncated) */}
          {video.description && (
            <div style={{
              fontSize: 12, fontFamily: T.sans, color: T.t3, lineHeight: 1.6,
              maxHeight: 120, overflow: "hidden", position: "relative",
              padding: "10px 12px", background: T.bg3, borderRadius: 8,
            }}>
              {String(video.description).substring(0, 400)}
              {String(video.description).length > 400 && "..."}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: 40,
                background: `linear-gradient(transparent, ${T.bg3})`,
              }}/>
            </div>
          )}

          {/* Keyword matches (for Tier S) */}
          {video.keyword_matches?.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
              {video.keyword_matches.map(kw => (
                <span key={kw} style={{
                  fontSize: 9, fontFamily: T.mono, padding: "2px 6px", borderRadius: 4,
                  background: `${T.purple}15`, color: T.purple,
                }}>{kw}</span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={onBack} style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 12, fontFamily: T.sans,
              background: T.bg4, color: T.t2, border: "none", cursor: "pointer",
            }}>← Back</button>
            <a
              href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 12, fontFamily: T.sans,
                background: T.accent, color: T.bg0, fontWeight: 700,
                textDecoration: "none", display: "inline-block",
              }}
            >Watch on YouTube ↗</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main WatchTab ───
export default function WatchTab() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<VideoRow | null>(null);

  const { videos, loading } = useVideos({ limit: 60, type: typeFilter === "all" ? null : typeFilter, sourceId: sourceFilter });
  const { sources } = useSources("youtube");

  // Unique video types present in data
  const types = useMemo(() => {
    const t = new Set(videos.map((v) => String(v.video_type ?? "video")));
    return ["all", ...Array.from(t)];
  }, [videos]);

  if (selected) {
    return <VideoDetail video={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      {/* Type filter pills */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 12px", overflowX: "auto", flexWrap: "nowrap" }}>
        {["all", "podcast", "video", "short", "panel", "event"].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{
            padding: "6px 12px", borderRadius: 20, fontSize: 11, fontFamily: T.sans, fontWeight: 600,
            background: typeFilter === t ? T.accent : T.bg3,
            color: typeFilter === t ? T.bg0 : T.t2,
            whiteSpace: "nowrap", transition: "all 0.2s", flexShrink: 0,
            border: "none", cursor: "pointer",
          }}>{t === "all" ? "All" : typeLabels[t] || t}</button>
        ))}
      </div>

      {/* Source filter */}
      {sources.length > 1 && (
        <div style={{ display: "flex", gap: 6, padding: "0 16px 14px", overflowX: "auto", flexWrap: "nowrap" }}>
          <button onClick={() => setSourceFilter(null)} style={{
            padding: "4px 10px", borderRadius: 14, fontSize: 10, fontFamily: T.mono,
            background: !sourceFilter ? T.bg4 : T.bg3, color: !sourceFilter ? T.t1 : T.t4,
            border: `1px solid ${!sourceFilter ? T.borderLight : T.border}`,
            whiteSpace: "nowrap", cursor: "pointer",
          }}>All sources</button>
          {sources.map((s: SourceRow) => {
            const sid = String(s.id ?? "");
            const stier = String(s.tier ?? "3");
            const tierC = tierColors[stier] ?? T.t3;
            return (
            <button key={sid} onClick={() => setSourceFilter(sourceFilter === sid ? null : sid)} style={{
              padding: "4px 10px", borderRadius: 14, fontSize: 10, fontFamily: T.mono,
              background: sourceFilter === sid ? `${tierC}20` : T.bg3,
              color: sourceFilter === sid ? tierC : T.t4,
              border: `1px solid ${sourceFilter === sid ? `${tierC}40` : T.border}`,
              whiteSpace: "nowrap", cursor: "pointer",
            }}>{String(s.name ?? "")}</button>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: T.t4, fontFamily: T.mono, fontSize: 12 }}>
          Loading videos...
        </div>
      )}

      {/* Video grid */}
      {!loading && (
        <div style={{
          padding: "0 16px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        }}>
          {videos.map((video, i) => (
            <VideoThumb
              key={video.id}
              video={video}
              onClick={() => setSelected(video)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.t4, fontFamily: T.sans, fontSize: 13 }}>
          No videos found. Try adjusting your filters.
        </div>
      )}

      {/* Channel stats bar */}
      {!loading && videos.length > 0 && (
        <div style={{
          margin: "20px 16px 0", padding: "12px 16px",
          background: T.bg2, borderRadius: 8, border: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-around",
        }}>
          {[
            { label: "Channels", value: sources.filter(s => s.active).length },
            { label: "Videos", value: videos.length },
            {
              label: "Total Views",
              value: formatViewCount(
                videos.reduce((sum, v) => sum + Number(v.view_count ?? 0), 0)
              ),
            },
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

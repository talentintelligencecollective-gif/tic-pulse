import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import { relDate } from "../lib/videoDisplay";

const NOW_PLAYING_KEY = "tic_now_playing";
const LISTENED_KEY = "tic_listened_ids";

export function ListenView({
  selectedEpisodes,
  onToggleEpisode,
}: {
  selectedEpisodes: { id: string }[];
  onToggleEpisode: Dispatch<SetStateAction<unknown[]>>;
}) {
  const [episodes, setEpisodes] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [nowPlayingEp, setNowPlayingEp] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLive, setAudioLive] = useState(false);
  const [listenedIds, setListenedIds] = useState(() => {
    try {
      const stored = localStorage.getItem(LISTENED_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [corsToast, setCorsToast] = useState(null);
  const audioRef = useRef(null);
  const selectedEpisodeIds = useMemo(() => new Set((selectedEpisodes || []).map(e => e.id)), [selectedEpisodes]);
  // If audio is still playing in the background when user re-opens app,
  // we show the mini-player with the correct episode info.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOW_PLAYING_KEY);
      if (stored) {
        const ep = JSON.parse(stored);
        setNowPlayingEp(ep);
        setPlaying(ep.id);
        // Audio itself isn't restored (browser limitation) but UI reflects state.
        // audioLive stays false so we don't show fake progress.
      }
    } catch {}
  }, []);

  useEffect(() => {
    async function load() {
      try {
        let q = supabase.from("episodes").select("*, sources(name, host, tier)")
          .order("published_at", { ascending: false }).limit(100);
        if (sourceFilter) q = q.eq("source_id", sourceFilter);
        const { data } = await q;
        setEpisodes(data || []);
        const { data: srcs } = await supabase.from("sources").select("*").eq("type", "podcast").eq("active", true).not("rss_url", "is", null).order("tier");
        setSources(srcs || []);
      } catch { setEpisodes([]); setSources([]); }
      setLoading(false);
    }
    setLoading(true); load();
  }, [sourceFilter]);

  // ─── Persist listened IDs to localStorage ───
  useEffect(() => {
    try {
      localStorage.setItem(LISTENED_KEY, JSON.stringify([...listenedIds]));
    } catch {}
  }, [listenedIds]);

  // ─── Mark as listened after 60s of playback ───
  const markListened = useCallback((epId) => {
    setListenedIds(prev => {
      const next = new Set(prev);
      next.add(epId);
      return next;
    });
  }, []);

  const handlePlay = useCallback((ep) => {
    // Tapping currently-playing episode pauses it
    if (playing === ep.id && audioLive) {
      audioRef.current?.pause();
      setPlaying(null);
      setNowPlayingEp(null);
      setAudioLive(false);
      setProgress(0);
      try { localStorage.removeItem(NOW_PLAYING_KEY); } catch {}
      return;
    }

    // Stop any existing audio
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    // No audio URL — open link instead
    if (!ep.audio_url) {
      if (ep.link) window.open(ep.link, "_blank");
      return;
    }

    const audio = new Audio(ep.audio_url);
    // Allow CORS where supported (some hosts require it)
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    setPlaying(ep.id);
    setNowPlayingEp(ep);
    setProgress(0);
    setDuration(0);
    setAudioLive(false); // will flip true on loadedmetadata

    // Persist to localStorage so re-open shows mini-player
    try { localStorage.setItem(NOW_PLAYING_KEY, JSON.stringify(ep)); } catch {}

    // Media Session API — lock screen / notification controls
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ep.title || "Podcast",
        artist: ep.sources?.name || ep.guest_name || "TIC Podcast Network",
        album: "TIC Pulse",
        artwork: ep.image_url ? [{ src: ep.image_url, sizes: "512x512", type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        audio.pause();
        setPlaying(null);
        setNowPlayingEp(null);
        setAudioLive(false);
        try { localStorage.removeItem(NOW_PLAYING_KEY); } catch {}
      });
      navigator.mediaSession.setActionHandler("play", () => { audio.play().catch(() => {}); });
    }

    let listenTimer = null;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
      setAudioLive(true);
    });
    audio.addEventListener("timeupdate", () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      // Mark listened after 60s
      if (!listenedIds.has(ep.id) && audio.currentTime >= 60) {
        markListened(ep.id);
      }
    });
    audio.addEventListener("ended", () => {
      setPlaying(null);
      setNowPlayingEp(null);
      setAudioLive(false);
      setProgress(0);
      markListened(ep.id);
      try { localStorage.removeItem(NOW_PLAYING_KEY); } catch {}
      if (listenTimer) clearTimeout(listenTimer);
    });
    audio.addEventListener("error", (e) => {
      // Likely CORS block from host (Buzzsprout/Megaphone etc.)
      setPlaying(null);
      setNowPlayingEp(null);
      setAudioLive(false);
      setProgress(0);
      try { localStorage.removeItem(NOW_PLAYING_KEY); } catch {}
      if (listenTimer) clearTimeout(listenTimer);
      // Show a helpful message + open the episode link
      setCorsToast(`Can't play "${ep.title?.substring(0, 40)}…" directly — opening in browser`);
      setTimeout(() => setCorsToast(null), 4000);
      if (ep.link) setTimeout(() => window.open(ep.link, "_blank"), 500);
    });

    audio.play().catch(() => {
      setPlaying(null);
      setNowPlayingEp(null);
      setAudioLive(false);
      try { localStorage.removeItem(NOW_PLAYING_KEY); } catch {}
      setCorsToast(`Can't play "${ep.title?.substring(0, 40)}…" directly — opening in browser`);
      setTimeout(() => setCorsToast(null), 4000);
      if (ep.link) setTimeout(() => window.open(ep.link, "_blank"), 500);
    });
  }, [playing, audioLive, listenedIds, markListened]);

  const handleStop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
    setNowPlayingEp(null);
    setAudioLive(false);
    setProgress(0);
    setDuration(0);
    try { localStorage.removeItem(NOW_PLAYING_KEY); } catch {}
  }, []);

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  const filteredEpisodes = useMemo(() => {
    if (!searchQuery) return episodes;
    const q = searchQuery.toLowerCase();
    return episodes.filter(ep =>
      (ep.title || "").toLowerCase().includes(q) ||
      (ep.guest_name || "").toLowerCase().includes(q) ||
      (ep.description || "").toLowerCase().includes(q) ||
      (ep.sources?.name || "").toLowerCase().includes(q)
    );
  }, [episodes, searchQuery]);

  const fmtTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  // The episode to show in the mini-player bar
  // Prefer live episode from episodes list (has sources etc.), fall back to stored object
  const miniPlayerEp = useMemo(() => {
    if (!playing) return null;
    return episodes.find(e => e.id === playing) || nowPlayingEp;
  }, [playing, episodes, nowPlayingEp]);

  return (
    <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease", background: "#000", minHeight: "calc(100vh - 120px)" }}>

      {/* CORS error toast */}
      {corsToast && (
        <div style={{
          position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
          zIndex: 300, background: "#1a1a1e", border: "1px solid #ff3b5c",
          borderRadius: 12, padding: "10px 16px", maxWidth: "90vw",
          fontSize: 12, color: "#ff3b5c", fontWeight: 600,
          animation: "fadeSlide 0.2s ease", boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>⚠️</span>
          <span>{corsToast}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: "#111", borderRadius: 16, border: "1px solid #222", marginBottom: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, rgba(0,229,160,0.1), rgba(0,180,216,0.1))", border: "1px solid rgba(0,229,160,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/tic-head.png" alt="TIC" style={{ width: 34, height: 34, objectFit: "contain" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 2px", fontFamily: "Georgia, serif" }}>TIC Podcast Network</h2>
          <div style={{ fontSize: 12, color: "#888" }}>{sources.length} shows · {episodes.length} episodes</div>
        </div>
      </div>

      {(!sourceFilter || sources.find(s => s.id === sourceFilter)?.name === "Talent Intelligence Collective Podcast") && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center" }}>
          {[
            { label: "Spotify", url: "https://open.spotify.com/show/0ozE6GkCJjD6nrurugtHNh" },
            { label: "Apple", url: "https://podcasts.apple.com/us/podcast/talent-intelligence-collective-podcast/id1533634924" },
            { label: "YouTube", url: "https://www.youtube.com/@talentintelligencecollective" },
          ].map(p => (
            <a key={p.label} href={p.url} target="_blank" rel="noopener noreferrer" style={{
              padding: "5px 12px", borderRadius: 16, fontSize: 10, fontWeight: 600,
              background: "#111", color: "#888", border: "1px solid #222",
              transition: "all 0.2s", textDecoration: "none", display: "inline-block",
            }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "#00e5a0";
                el.style.color = "#00e5a0";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "#222";
                el.style.color = "#888";
              }}
            >{p.label} ↗</a>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 12, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#111", borderRadius: 14, padding: "0 14px", border: "1px solid #333" }}>
          <span style={{ fontSize: 14, color: "#666" }}>⌕</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search episodes, guests, topics…"
            style={{ flex: 1, background: "none", border: "none", color: "#eee", padding: "11px 0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#888", width: 20, height: 20, borderRadius: "50%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          )}
        </div>
      </div>

      {sources.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
          <button onClick={() => setSourceFilter(null)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: !sourceFilter ? "rgba(0,229,160,0.12)" : "#111", color: !sourceFilter ? "#00e5a0" : "#888", border: `1px solid ${!sourceFilter ? "rgba(0,229,160,0.3)" : "#222"}`, whiteSpace: "nowrap" }}>All Shows</button>
          {sources.map(s => {
            const isActive = sourceFilter === s.id;
            return <button key={s.id} onClick={() => setSourceFilter(isActive ? null : s.id)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: isActive ? "rgba(0,229,160,0.12)" : "#111", color: isActive ? "#00e5a0" : "#888", border: `1px solid ${isActive ? "rgba(0,229,160,0.3)" : "#222"}`, whiteSpace: "nowrap" }}>{s.name.length > 20 ? s.name.substring(0, 18) + "…" : s.name}</button>;
          })}
        </div>
      )}

      {/* ─── Mini Player Bar ─── */}
      {miniPlayerEp && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "#111", borderRadius: 12, border: "1px solid #00e5a0", animation: "fadeSlide 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: audioLive ? 6 : 0 }}>
            {/* Play/pause button — only functional when audio is live */}
            <button onClick={() => audioLive ? handleStop() : handlePlay(miniPlayerEp)} style={{
              width: 28, height: 28, borderRadius: "50%", background: "#00e5a0", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {audioLive ? (
                <div style={{ display: "flex", gap: 2 }}>
                  <div style={{ width: 2.5, height: 10, background: "#000", borderRadius: 1 }} />
                  <div style={{ width: 2.5, height: 10, background: "#000", borderRadius: 1 }} />
                </div>
              ) : (
                // Resumed from background — show play triangle
                <div style={{ width: 0, height: 0, borderLeft: "9px solid #000", borderTop: "6px solid transparent", borderBottom: "6px solid transparent", marginLeft: 2 }} />
              )}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#eee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {miniPlayerEp.title || "Playing…"}
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{miniPlayerEp.sources?.name || "Podcast"}</span>
                {audioLive && <><span>·</span><span>{fmtTime(duration * progress / 100)} / {fmtTime(duration)}</span></>}
                {!audioLive && <span style={{ color: "#00e5a0" }}>· playing in background</span>}
              </div>
            </div>
            {/* Close/dismiss */}
            <button onClick={handleStop} style={{ background: "none", border: "none", color: "#555", padding: "4px", lineHeight: 1, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {/* Progress bar — only shown when audio is live */}
          {audioLive && (
            <div style={{ height: 3, background: "#222", borderRadius: 2, overflow: "hidden", cursor: "pointer" }}
              onClick={(e) => {
                if (!audioRef.current || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audioRef.current.currentTime = pct * duration;
              }}
            >
              <div style={{ height: "100%", width: `${progress}%`, background: "#00e5a0", borderRadius: 2, transition: "width 0.3s linear" }} />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#666", fontSize: 13 }}>Loading episodes…</div>
      ) : filteredEpisodes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>🎧</div>
          <p style={{ fontSize: 14, color: "#888" }}>{searchQuery ? "No episodes match your search" : "No episodes yet"}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredEpisodes.map((ep, i) => {
            const isPlay = playing === ep.id;
            const isExp = expanded === ep.id;
            const hasAudio = !!ep.audio_url;
            const hasListened = listenedIds.has(ep.id);
            const isEpSelected = selectedEpisodeIds.has(ep.id);
            return (
              <div key={ep.id} style={{
                background: "#111", borderRadius: 14, overflow: "hidden",
                border: `1px solid ${isPlay ? "#00e5a0" : "#222"}`,
                transition: "border-color 0.3s",
                animation: `cardIn 0.3s ease ${i * 0.03}s both`,
                opacity: hasListened && !isPlay ? 0.7 : 1,
              }}>
                {/* Progress bar on card when playing */}
                {isPlay && audioLive && (
                  <div style={{ height: 2, background: "#222" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "#00e5a0", transition: "width 0.3s linear" }} />
                  </div>
                )}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <button onClick={() => handlePlay(ep)} title={hasAudio ? (isPlay ? "Pause" : "Play") : "Open episode"} style={{
                      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: isPlay ? "#00e5a0" : hasListened ? "#0d1f18" : "#1a1a1e",
                      border: hasListened && !isPlay ? "1.5px solid #00e5a020" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s", marginTop: 2,
                    }}>
                      {isPlay ? (
                        <div style={{ display: "flex", gap: 3 }}>
                          <div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} />
                          <div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} />
                        </div>
                      ) : hasListened ? (
                        // Listened indicator — checkmark-ish play
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : (
                        <div style={{ width: 0, height: 0, borderLeft: `10px solid ${hasAudio ? "#eee" : "#666"}`, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", marginLeft: 2 }} />
                      )}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#00e5a0", fontFamily: "monospace" }}>{ep.sources?.name || "Podcast"}</span>
                        <span style={{ fontSize: 10, color: "#666" }}>{relDate(ep.published_at)}</span>
                        {hasListened && !isPlay && (
                          <span style={{ fontSize: 9, color: "#00e5a0", fontWeight: 700, letterSpacing: "0.5px", opacity: 0.6 }}>LISTENED</span>
                        )}
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: hasListened && !isPlay ? "#888" : "#eee", margin: "0 0 5px", lineHeight: 1.3, fontFamily: "Georgia, serif" }}>{ep.title}</h4>
                      {ep.guest_name && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "#aaa" }}>{ep.guest_name}</span>
                          {ep.guest_org && <><span style={{ color: "#444" }}>·</span><span style={{ fontSize: 11, color: "#666" }}>{ep.guest_org}</span></>}
                        </div>
                      )}
                      {isExp && ep.description && (
                        <div style={{ marginTop: 8, marginBottom: 8, fontSize: 13, color: "#999", lineHeight: 1.6, padding: "10px 12px", background: "#0a0a0a", borderRadius: 10, animation: "fadeSlide 0.2s ease" }}>{ep.description}</div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {ep.duration && <span style={{ fontSize: 10, color: "#666" }}>⏱ {ep.duration}</span>}
                        {!hasAudio && ep.link && <a href={ep.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#00e5a0", textDecoration: "none" }}>Open ↗</a>}
                        <button onClick={() => setExpanded(isExp ? null : ep.id)} style={{ fontSize: 11, color: "#00e5a0", marginLeft: "auto", background: "none", border: "none" }}>{isExp ? "Less ↑" : "More ↓"}</button>
                        <button
                          onClick={() =>
                            onToggleEpisode((prev) => {
                              const p = prev as { id: string }[];
                              return isEpSelected ? p.filter((x) => x.id !== ep.id) : [...p, ep];
                            })
                          }
                          style={{
                            background: isEpSelected ? "#00e5a0" : "none",
                            border: isEpSelected ? "none" : "1.5px solid #333",
                            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: isEpSelected ? "#000" : "#666", transition: "all 0.2s",
                          }}
                          title={isEpSelected ? "Remove from briefing" : "Add to briefing"}
                        >
                          {isEpSelected
                            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          }
                        </button>
                      </div>
                    </div>
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


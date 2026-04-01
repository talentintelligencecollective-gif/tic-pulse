import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase, fetchArticles, incrementEngagement } from "./supabase.js";
import AuthPage from "./AuthPage.jsx";
import ArticleCard from "./ArticleCard.jsx";
import ShareSheet from "./ShareSheet.jsx";
import NewsletterBuilder from "./NewsletterBuilder.jsx";
import Toast from "./Toast.jsx";
import {
  SearchIcon, CloseIcon, BellIcon, TrendingIcon, BookmarkIcon,
  FeedIcon, DiscoverIcon, PeopleIcon, NewsletterIcon,
} from "./Icons.jsx";

// ─── Constants ───

const CATEGORIES = [
  "All", "Talent Strategy", "Labour Market", "Automation",
  "Executive Moves", "Compensation", "Workforce Planning", "Skills", "DEI",
];

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

const STORAGE_KEY_LIKES = "tic-pulse-likes";
const STORAGE_KEY_BOOKMARKS = "tic-pulse-bookmarks";

// ─── Local storage helpers ───

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // localStorage might be full or unavailable — degrade gracefully
  }
}

// ─── Inline Icons for Watch / Listen tabs ───

function WatchIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ListenIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

// ─── Multimedia helpers ───

const relDate = (d) => {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), dy = Math.floor(ms / 86400000);
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (dy < 7) return `${dy}d ago`;
  const dt = new Date(d);
  return `${dt.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()]}`;
};

const fmtViews = (n) => !n ? "0" : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : `${n}`;

const videoTypeColor = (t) => t === "podcast" ? "#00e5a0" : t === "event" ? "#f59e0b" : t === "panel" ? "#a855f7" : t === "short" ? "#00b4d8" : "#888";
const videoTypeLabel = (t) => ({ podcast: "Podcast", event: "Event", panel: "Panel", short: "Short", video: "Video" }[t] || "Video");

// ═══════════════════════════════════════════════
//  APP (auth wrapper) — UNCHANGED
// ═══════════════════════════════════════════════

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => setSession(s)
    );

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#000", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: "#00e5a0", animation: "liveDot 1.5s ease infinite",
        }} />
        <style>{`@keyframes liveDot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
      </div>
    );
  }

  if (!session) {
    return <AuthPage onAuth={(s) => setSession(s)} />;
  }

  return <PulseApp session={session} />;
}

// ═══════════════════════════════════════════════
//  PULSE APP (main app, shown after login)
//  v3: adds "watch" and "listen" tabs
// ═══════════════════════════════════════════════

function PulseApp({ session }) {
  // ─── State (existing) ───
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("feed");
  const [shareTarget, setShareTarget] = useState(null);
  const [toast, setToast] = useState({ msg: "", show: false });

  const [selectedIds, setSelectedIds] = useState([]);
  const [showNewsletter, setShowNewsletter] = useState(false);

  const [likedIds, setLikedIds] = useState(() => loadSet(STORAGE_KEY_LIKES));
  const [bookmarkedIds, setBookmarkedIds] = useState(() => loadSet(STORAGE_KEY_BOOKMARKS));

  const likedIdsRef = useRef(likedIds);
  useEffect(() => { likedIdsRef.current = likedIds; }, [likedIds]);

  const searchInputRef = useRef(null);

  // ─── Data Loading (existing) ───

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchArticles({ limit: 100 });
      setArticles(data);
    } catch (err) {
      console.error("Failed to load articles:", err);
      setError("Failed to load articles. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  // ─── Client-side filtering (existing) ───

  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      const matchesCategory = activeCategory === "All" || a.category === activeCategory;
      if (!matchesCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          (a.title || "").toLowerCase().includes(q) ||
          (a.tldr || "").toLowerCase().includes(q) ||
          (a.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          (a.category || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [articles, activeCategory, searchQuery]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  // ─── Toast (existing) ───
  const showToast = useCallback((msg) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }, []);

  // ─── Engagement Handlers (existing) ───

  const handleLike = useCallback((articleId) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      const wasLiked = next.has(articleId);
      if (wasLiked) { next.delete(articleId); incrementEngagement(articleId, "like_count", -1); }
      else { next.add(articleId); incrementEngagement(articleId, "like_count", 1); }
      saveSet(STORAGE_KEY_LIKES, next);
      return next;
    });
    const wasLiked = likedIdsRef.current.has(articleId);
    setArticles((prev) => prev.map((a) => {
      if (a.id !== articleId) return a;
      return { ...a, like_count: a.like_count + (wasLiked ? -1 : 1) };
    }));
  }, []);

  const handleBookmark = useCallback((articleId) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      const wasBookmarked = next.has(articleId);
      if (wasBookmarked) { next.delete(articleId); }
      else { next.add(articleId); showToast("Saved to bookmarks"); }
      saveSet(STORAGE_KEY_BOOKMARKS, next);
      return next;
    });
  }, [showToast]);

  const handleShare = useCallback((article) => {
    setShareTarget(article);
    incrementEngagement(article.id, "share_count", 1);
  }, []);

  // ─── Curate Mode (existing) ───

  const handleToggleSelect = useCallback((articleId) => {
    setSelectedIds((prev) => {
      if (prev.includes(articleId)) return prev.filter((id) => id !== articleId);
      return [...prev, articleId];
    });
  }, []);

  const handleOpenNewsletter = useCallback(() => {
    if (selectedIds.length === 0) return;
    setShowNewsletter(true);
  }, [selectedIds]);

  const selectedArticles = useMemo(() => {
    const articleMap = new Map(articles.map((a) => [a.id, a]));
    return selectedIds.map((id) => articleMap.get(id)).filter(Boolean);
  }, [articles, selectedIds]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ─── Render ───

  return (
    <div style={{ minHeight: "100dvh", maxWidth: "480px", margin: "0 auto", position: "relative" }}>
      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: "-120px", left: "50%", transform: "translateX(-50%)",
        width: "500px", height: "500px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,229,160,0.03) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* ═══ HEADER ═══ */}
      <Header
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        activeCategory={activeCategory}
        searchInputRef={searchInputRef}
        user={session?.user}
        activeTab={activeTab}
        onLogout={async () => { await supabase.auth.signOut(); }}
        onToggleSearch={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}
        onSearchChange={setSearchQuery}
        onCategoryChange={(cat) => { setActiveCategory(cat); setSearchQuery(""); setSearchOpen(false); }}
      />

      {/* ═══ CONTENT ═══ */}
      <main style={{ position: "relative", zIndex: 1 }}>
        {activeTab === "feed" && (
          <FeedView
            articles={filteredArticles} loading={loading} error={error} searchQuery={searchQuery}
            likedIds={likedIds} bookmarkedIds={bookmarkedIds} selectedIds={selectedIdSet}
            onLike={handleLike} onBookmark={handleBookmark} onShare={handleShare}
            onToggleSelect={handleToggleSelect}
            onClearFilters={() => { setActiveCategory("All"); setSearchQuery(""); setSearchOpen(false); }}
            onSearchTag={(tag) => { setSearchQuery(tag); setSearchOpen(true); }}
            onRetry={loadArticles}
          />
        )}

        {activeTab === "watch" && <WatchView />}
        {activeTab === "listen" && <ListenView />}
        {activeTab === "discover" && <DiscoverView />}

        {activeTab === "saved" && (
          <SavedView
            articles={articles} likedIds={likedIds} bookmarkedIds={bookmarkedIds}
            onLike={handleLike} onBookmark={handleBookmark} onShare={handleShare}
          />
        )}
      </main>

      {/* ═══ BOTTOM NAV ═══ */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ═══ CURATE SELECTION BAR ═══ */}
      {selectedIds.length > 0 && (
        <div style={{
          position: "fixed", bottom: "72px", left: "50%", transform: "translateX(-50%)",
          width: "calc(100% - 24px)", maxWidth: "456px", zIndex: 150,
          animation: "fadeSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <div style={{
            background: "#1a1a1e", borderRadius: "18px", border: "1px solid #333",
            padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                {selectedIds.length} article{selectedIds.length !== 1 ? "s" : ""} selected
              </div>
              <div style={{ fontSize: "11px", color: "#999", marginTop: "1px" }}>Ready to build your briefing</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setSelectedIds([])} style={{
                background: "none", border: "1px solid #444", borderRadius: "12px",
                color: "#ccc", padding: "10px 14px", fontSize: "12px", fontWeight: 600,
              }}>Clear</button>
              <button onClick={handleOpenNewsletter} style={{
                background: "#00e5a0", border: "none", borderRadius: "12px",
                color: "#000", padding: "10px 18px", fontSize: "13px", fontWeight: 700,
                display: "flex", alignItems: "center", gap: "6px",
              }}>
                <NewsletterIcon size={16} />
                Build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERLAYS ═══ */}
      <ShareSheet article={shareTarget} onClose={() => setShareTarget(null)} onToast={showToast} />
      <Toast message={toast.msg} visible={toast.show} />

      {showNewsletter && (
        <NewsletterBuilder
          articles={selectedArticles}
          onClose={() => setShowNewsletter(false)}
          onToast={showToast}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  HEADER — existing, passes activeTab for context
// ═══════════════════════════════════════════════

function Header({ searchOpen, searchQuery, activeCategory, searchInputRef, user, activeTab, onLogout, onToggleSearch, onSearchChange, onCategoryChange }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "?").toUpperCase();

  // Only show category scroller on Feed tab
  const showCategories = activeTab === "feed";

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "#000", borderBottom: "1px solid #222",
    }}>
      {/* Top Row */}
      <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/tic-head.png" alt="TIC" style={{ width: "34px", height: "34px", objectFit: "contain" }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <h1 style={{
                fontSize: "22px", fontWeight: 800, margin: 0,
                fontFamily: "var(--font-display)", color: "#fff", letterSpacing: "-0.5px",
                animation: "textPulse 4s ease-in-out infinite",
              }}>Pulse</h1>
              <div style={{
                display: "flex", alignItems: "center", gap: "4px",
                padding: "2px 7px", borderRadius: "6px",
                background: "var(--accent-muted)", border: "1px solid rgba(0,229,160,0.15)",
              }}>
                <div style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: "var(--accent)", animation: "liveDot 2s ease infinite",
                }} />
                <span style={{ fontSize: "9px", fontWeight: 800, color: "var(--accent)", letterSpacing: "1px" }}>LIVE</span>
              </div>
            </div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "2px", marginTop: "-1px" }}>
              TALENT INTELLIGENCE COLLECTIVE
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button onClick={onToggleSearch} aria-label={searchOpen ? "Close search" : "Open search"} style={{
            background: searchOpen ? "var(--accent-muted)" : "none", border: "none",
            color: searchOpen ? "var(--accent)" : "var(--text-muted)",
            padding: "8px", borderRadius: "12px", display: "flex", alignItems: "center", transition: "all 0.2s",
          }}>
            {searchOpen ? <CloseIcon size={18} /> : <SearchIcon />}
          </button>
          <button aria-label="Notifications" style={{
            background: "none", border: "none", color: "var(--text-muted)",
            padding: "8px", borderRadius: "12px", position: "relative", display: "flex", alignItems: "center",
          }}>
            <BellIcon />
            <div style={{
              position: "absolute", top: "5px", right: "5px", width: "7px", height: "7px",
              borderRadius: "50%", background: "var(--red)", border: "2px solid var(--bg)",
            }} />
          </button>
          {/* User avatar */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} aria-label="Account menu" style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: "linear-gradient(135deg, #00e5a0, #00b4d8)",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 800, color: "#000", cursor: "pointer", marginLeft: "2px",
            }}>{userInitials}</button>
            {showUserMenu && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setShowUserMenu(false)} />
                <div style={{
                  position: "absolute", top: "40px", right: 0,
                  background: "#1a1a1e", border: "1px solid var(--border-hover)",
                  borderRadius: "14px", padding: "8px", minWidth: "180px", zIndex: 201,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "fadeSlide 0.15s ease",
                }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {user?.user_metadata?.full_name || "User"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{user?.email}</div>
                  </div>
                  <button onClick={() => { setShowUserMenu(false); onLogout(); }} style={{
                    width: "100%", padding: "10px 12px", background: "none", border: "none",
                    borderRadius: "8px", color: "var(--red)", fontSize: "13px", fontWeight: 600,
                    textAlign: "left", cursor: "pointer", marginTop: "4px", transition: "background 0.2s",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,59,92,0.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >Log out</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div style={{ padding: "10px 16px 0", animation: "fadeSlide 0.2s ease" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "var(--bg-elevated)", borderRadius: "var(--radius-md)",
            padding: "0 14px", border: "1px solid var(--border)",
          }}>
            <SearchIcon size={16} />
            <input ref={searchInputRef} value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search articles, topics, tags..."
              style={{ flex: 1, background: "none", border: "none", color: "#eee", padding: "11px 0", fontSize: "14px", outline: "none" }}
            />
            {searchQuery && (
              <button onClick={() => onSearchChange("")} style={{
                background: "rgba(255,255,255,0.08)", border: "none", color: "#888",
                width: "20px", height: "20px", borderRadius: "50%", fontSize: "12px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            )}
          </div>
        </div>
      )}

      {/* Category Scroller — only on Feed tab */}
      {showCategories && (
        <div style={{
          display: "flex", gap: "7px", padding: "12px 16px 12px",
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            const color = cat === "All" ? "var(--accent)" : (CAT_COLORS[cat] || "var(--accent)");
            return (
              <button key={cat} onClick={() => onCategoryChange(cat)} style={{
                padding: "5px 14px", borderRadius: "var(--radius-pill)", whiteSpace: "nowrap",
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.3px",
                border: isActive ? `1px solid ${typeof color === "string" && color.startsWith("#") ? color + "40" : "var(--accent-border)"}` : "1px solid var(--border)",
                background: isActive ? (typeof color === "string" && color.startsWith("#") ? color + "12" : "var(--accent-muted)") : "var(--bg-card)",
                color: isActive ? color : "var(--text-muted)",
                transition: "all 0.25s ease",
              }}>{cat}</button>
            );
          })}
        </div>
      )}

      {/* Tab-specific subheader for Watch/Listen */}
      {!showCategories && !searchOpen && (
        <div style={{ height: "12px" }} />
      )}
    </header>
  );
}

// ═══════════════════════════════════════════════
//  FEED VIEW — existing, unchanged
// ═══════════════════════════════════════════════

function FeedView({ articles, loading, error, searchQuery, likedIds, bookmarkedIds, selectedIds, onLike, onBookmark, onShare, onToggleSelect, onClearFilters, onSearchTag, onRetry }) {
  const hasSelections = selectedIds.size > 0;
  return (
    <div style={{ padding: hasSelections ? "12px 12px 180px" : "12px 12px 110px" }}>
      <TrendingTicker onTagClick={onSearchTag} />

      {searchQuery && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", marginBottom: "12px", borderRadius: "12px",
          background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)",
          animation: "fadeSlide 0.2s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#888" }}>Filtering by:</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#00e5a0" }}>{searchQuery}</span>
          </div>
          <button onClick={onClearFilters} style={{
            background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px",
            color: "#fff", padding: "4px 12px", fontSize: "12px", fontWeight: 600,
          }}>Clear</button>
        </div>
      )}

      {loading && articles.length === 0 && <SkeletonCards />}

      {error && (
        <div style={{ textAlign: "center", padding: "48px 20px", animation: "fadeIn 0.3s" }}>
          <p style={{ fontSize: "14px", color: "var(--red)", fontWeight: 500 }}>{error}</p>
          <button onClick={onRetry} style={{
            background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
            color: "var(--accent)", padding: "8px 20px", borderRadius: "12px",
            fontSize: "13px", fontWeight: 600, marginTop: "12px",
          }}>Try again</button>
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeIn 0.3s" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px", opacity: 0.5 }}>🔍</div>
          <p style={{ fontSize: "15px", color: "var(--text-muted)", fontWeight: 500 }}>No articles match your filters</p>
          <button onClick={onClearFilters} style={{
            background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
            color: "var(--accent)", padding: "8px 20px", borderRadius: "12px",
            fontSize: "13px", fontWeight: 600, marginTop: "12px",
          }}>Clear filters</button>
        </div>
      )}

      {articles.map((article, i) => (
        <ArticleCard key={article.id} article={article} index={i}
          isLiked={likedIds.has(article.id)} isBookmarked={bookmarkedIds.has(article.id)}
          isSelected={selectedIds.has(article.id)}
          onLike={onLike} onBookmark={onBookmark} onShare={onShare} onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  WATCH VIEW (NEW — YouTube Videos)
// ═══════════════════════════════════════════════

function WatchView() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        let q = supabase.from("videos").select("*, sources(name, tier)")
          .order("published_at", { ascending: false }).limit(60);
        if (typeFilter !== "all") q = q.eq("video_type", typeFilter);
        const { data } = await q;
        setVideos(data || []);
      } catch { setVideos([]); }
      setLoading(false);
    }
    setLoading(true);
    load();
  }, [typeFilter]);

  // ─── Selected video: embedded player ───
  if (selected) {
    const tc = videoTypeColor(selected.video_type);
    const thumbUrl = selected.thumbnail_url || (selected.youtube_id ? `https://img.youtube.com/vi/${selected.youtube_id}/hqdefault.jpg` : null);
    return (
      <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease" }}>
        <div style={{ background: "var(--bg-card, #111)", borderRadius: "16px", border: "1px solid #333", overflow: "hidden" }}>
          <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
            <iframe src={`https://www.youtube.com/embed/${selected.youtube_id}?rel=0`}
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen title={selected.title} />
          </div>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", padding: "3px 8px", borderRadius: 4, background: `${tc}20`, color: tc, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                {videoTypeLabel(selected.video_type)}
              </span>
              <span style={{ fontSize: 11, color: "#666", marginLeft: "auto" }}>{relDate(selected.published_at)}</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#eee", margin: "0 0 10px", lineHeight: 1.3, fontFamily: "Georgia, serif" }}>
              {selected.title}
            </h3>
            <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "#888" }}>▶ {fmtViews(selected.view_count)} views</span>
              <span style={{ fontSize: 12, color: "#888" }}>⏱ {selected.duration}</span>
              {selected.channel_title && <span style={{ fontSize: 12, color: "#00e5a0" }}>{selected.channel_title}</span>}
            </div>
            {selected.description && (
              <p style={{ fontSize: 13, color: "#777", lineHeight: 1.6, margin: "0 0 14px",
                maxHeight: 120, overflow: "hidden", padding: "10px 12px", background: "#0a0a0a", borderRadius: 10 }}>
                {selected.description.substring(0, 400)}{selected.description.length > 400 && "…"}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSelected(null)} style={{
                padding: "8px 16px", borderRadius: 10, fontSize: 12,
                background: "#1a1a1e", color: "#ccc", border: "1px solid #333",
              }}>← Back</button>
              <a href={`https://www.youtube.com/watch?v=${selected.youtube_id}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "#00e5a0", color: "#000", display: "inline-block", textDecoration: "none" }}>
                Watch on YouTube ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Video grid ───
  return (
    <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease" }}>
      {/* Type filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
        {["all", "podcast", "video", "short", "panel", "event"].map(t => {
          const isActive = typeFilter === t;
          const color = t === "all" ? "#00e5a0" : videoTypeColor(t);
          return (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: "5px 14px", borderRadius: "20px", whiteSpace: "nowrap",
              fontSize: 11, fontWeight: 700,
              background: isActive ? `${color}18` : "var(--bg-card, #111)",
              color: isActive ? color : "#888",
              border: `1px solid ${isActive ? color + "40" : "var(--border, #222)"}`,
              transition: "all 0.2s",
            }}>{t === "all" ? "All" : videoTypeLabel(t)}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#666", fontSize: 13 }}>Loading videos…</div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>📺</div>
          <p style={{ fontSize: 14, color: "#888" }}>No videos yet — they'll appear once the YouTube fetcher runs</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {videos.map((v, i) => {
            const tc = videoTypeColor(v.video_type);
            const thumbUrl = v.thumbnail_url || (v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg` : null);
            return (
              <div key={v.id} onClick={() => setSelected(v)} style={{
                cursor: "pointer", background: "var(--bg-card, #111)", borderRadius: 14,
                overflow: "hidden", border: "1px solid var(--border, #222)",
                transition: "border-color 0.2s, transform 0.15s",
                animation: `cardIn 0.3s ease ${i * 0.03}s both`,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border, #222)"; e.currentTarget.style.transform = "none"; }}
              >
                <div style={{
                  width: "100%", aspectRatio: "16/9", position: "relative",
                  background: thumbUrl ? `url(${thumbUrl}) center/cover` : `linear-gradient(135deg, #111, #000)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ position: "absolute", top: 6, left: 6, fontSize: 8, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: `${tc}30`, color: tc, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                    {videoTypeLabel(v.video_type)}
                  </span>
                  {v.duration && <span style={{ position: "absolute", bottom: 6, right: 6, fontSize: 10, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: "rgba(0,0,0,0.8)", color: "#ccc" }}>{v.duration}</span>}
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "1.5px solid rgba(0,229,160,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 0, height: 0, borderLeft: "9px solid #00e5a0", borderTop: "6px solid transparent", borderBottom: "6px solid transparent", marginLeft: 2 }} />
                  </div>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#eee", lineHeight: 1.3, marginBottom: 5, fontFamily: "Georgia, serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: "#888" }}>{v.channel_title || v.sources?.name}</span>
                    <span style={{ fontSize: 10, color: "#666" }}>{fmtViews(v.view_count)}</span>
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

// ═══════════════════════════════════════════════
//  LISTEN VIEW (NEW — Podcast Episodes)
// ═══════════════════════════════════════════════

function ListenView() {
  const [episodes, setEpisodes] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        let q = supabase.from("episodes").select("*, sources(name, host, tier)")
          .order("published_at", { ascending: false }).limit(80);
        if (sourceFilter) q = q.eq("source_id", sourceFilter);
        const { data } = await q;
        setEpisodes(data || []);

        const { data: srcs } = await supabase.from("sources").select("*")
          .eq("type", "podcast").eq("active", true).order("tier");
        setSources(srcs || []);
      } catch { setEpisodes([]); setSources([]); }
      setLoading(false);
    }
    setLoading(true);
    load();
  }, [sourceFilter]);

  return (
    <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease" }}>
      {/* Podcast header */}
      <div style={{
        display: "flex", gap: 14, alignItems: "center", padding: "14px 16px",
        background: "var(--bg-card, #111)", borderRadius: 16,
        border: "1px solid var(--border, #222)", marginBottom: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12, flexShrink: 0,
          background: "linear-gradient(135deg, rgba(0,229,160,0.1), rgba(0,180,216,0.1))",
          border: "1px solid rgba(0,229,160,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img src="/tic-head.png" alt="TIC" style={{ width: 34, height: 34, objectFit: "contain" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 2px", fontFamily: "Georgia, serif" }}>TIC Podcast</h2>
          <div style={{ fontSize: 12, color: "#888" }}>Toby Culshaw · Alison Ettridge · Alan Walker</div>
          <div style={{ fontSize: 11, color: "#00e5a0", marginTop: 2 }}>{episodes.length} episodes</div>
        </div>
      </div>

      {/* Source filter */}
      {sources.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
          <button onClick={() => setSourceFilter(null)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: !sourceFilter ? "rgba(0,229,160,0.12)" : "var(--bg-card, #111)",
            color: !sourceFilter ? "#00e5a0" : "#888",
            border: `1px solid ${!sourceFilter ? "rgba(0,229,160,0.3)" : "var(--border, #222)"}`,
            whiteSpace: "nowrap",
          }}>All Shows</button>
          {sources.map(s => {
            const isActive = sourceFilter === s.id;
            return (
              <button key={s.id} onClick={() => setSourceFilter(isActive ? null : s.id)} style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: isActive ? "rgba(0,229,160,0.12)" : "var(--bg-card, #111)",
                color: isActive ? "#00e5a0" : "#888",
                border: `1px solid ${isActive ? "rgba(0,229,160,0.3)" : "var(--border, #222)"}`,
                whiteSpace: "nowrap",
              }}>{s.name.length > 20 ? s.name.substring(0, 18) + "…" : s.name}</button>
            );
          })}
        </div>
      )}

      {/* Platform links */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, justifyContent: "center" }}>
        {["Spotify", "Apple Podcasts", "YouTube", "RSS"].map(p => (
          <button key={p} style={{
            padding: "5px 10px", borderRadius: 16, fontSize: 10, fontWeight: 600,
            background: "var(--bg-card, #111)", color: "#888",
            border: "1px solid var(--border, #222)", transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.target.style.borderColor = "#00e5a0"; e.target.style.color = "#00e5a0"; }}
            onMouseLeave={e => { e.target.style.borderColor = "var(--border, #222)"; e.target.style.color = "#888"; }}
          >{p}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#666", fontSize: 13 }}>Loading episodes…</div>
      ) : episodes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>🎧</div>
          <p style={{ fontSize: 14, color: "#888" }}>No episodes yet — they'll appear once the RSS fetcher runs</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {episodes.map((ep, i) => {
            const isPlay = playing === ep.id;
            const isExp = expanded === ep.id;
            return (
              <div key={ep.id} style={{
                background: "var(--bg-card, #111)", borderRadius: 14, overflow: "hidden",
                border: `1px solid ${isPlay ? "#00e5a0" : "var(--border, #222)"}`,
                transition: "border-color 0.3s",
                animation: `cardIn 0.3s ease ${i * 0.03}s both`,
              }}>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Play button */}
                    <button onClick={() => setPlaying(isPlay ? null : ep.id)} style={{
                      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: isPlay ? "#00e5a0" : "#1a1a1e",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s", marginTop: 2,
                    }}>
                      {isPlay ? (
                        <div style={{ display: "flex", gap: 3 }}>
                          <div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} />
                          <div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} />
                        </div>
                      ) : (
                        <div style={{ width: 0, height: 0, borderLeft: "10px solid #eee", borderTop: "7px solid transparent", borderBottom: "7px solid transparent", marginLeft: 2 }} />
                      )}
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#00e5a0", fontFamily: "monospace" }}>
                          {ep.sources?.name || "Podcast"}
                        </span>
                        <span style={{ fontSize: 10, color: "#666" }}>{relDate(ep.published_at)}</span>
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: "#eee", margin: "0 0 5px", lineHeight: 1.3, fontFamily: "Georgia, serif" }}>
                        {ep.title}
                      </h4>
                      {ep.guest_name && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: "#aaa" }}>{ep.guest_name}</span>
                          {ep.guest_org && <><span style={{ color: "#444" }}>·</span><span style={{ fontSize: 11, color: "#666" }}>{ep.guest_org}</span></>}
                        </div>
                      )}
                      {isExp && ep.description && (
                        <div style={{ marginTop: 8, marginBottom: 8, fontSize: 13, color: "#999", lineHeight: 1.6, padding: "10px 12px", background: "#0a0a0a", borderRadius: 10, animation: "fadeSlide 0.2s ease" }}>
                          {ep.description}
                        </div>
                      )}
                      {ep.keyword_matches?.length > 0 && (
                        <div style={{ display: "flex", gap: 3, marginBottom: 4, flexWrap: "wrap" }}>
                          {ep.keyword_matches.map(kw => (
                            <span key={kw} style={{ fontSize: 8, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3, background: "rgba(168,85,247,0.1)", color: "#a855f7" }}>{kw}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {ep.duration && <span style={{ fontSize: 10, color: "#666" }}>⏱ {ep.duration}</span>}
                        {ep.link && <a href={ep.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#00e5a0", textDecoration: "none" }}>↗ Open</a>}
                        <button onClick={() => setExpanded(isExp ? null : ep.id)} style={{ fontSize: 11, color: "#00e5a0", marginLeft: "auto" }}>
                          {isExp ? "Less ↑" : "More ↓"}
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

// ═══════════════════════════════════════════════
//  TRENDING TICKER — existing, unchanged
// ═══════════════════════════════════════════════

const TRENDING_TAGS = [
  { tag: "#AgenticAI", count: "2.4k" },
  { tag: "#SkillsTaxonomy", count: "1.8k" },
  { tag: "#CHROTurnover", count: "956" },
  { tag: "#GreenJobs", count: "743" },
  { tag: "#PayTransparency", count: "1.2k" },
];

function TrendingTicker({ onTagClick }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
      marginBottom: "14px", background: "rgba(255,255,255,0.015)",
      borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)",
      overflowX: "auto", scrollbarWidth: "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--accent)", flexShrink: 0 }}>
        <TrendingIcon />
        <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1.2px" }}>TRENDING</span>
      </div>
      <div style={{ width: "1px", height: "14px", background: "var(--border)", flexShrink: 0 }} />
      {TRENDING_TAGS.map((t) => (
        <button key={t.tag} onClick={() => onTagClick(t.tag.slice(1))} style={{
          background: "none", border: "none", color: "var(--text-muted)",
          fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
          padding: "3px 6px", borderRadius: "6px", transition: "all 0.2s",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-muted)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
        >{t.tag}</button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SKELETON LOADING — existing, unchanged
// ═══════════════════════════════════════════════

function SkeletonCards() {
  return (
    <div style={{ animation: "fadeIn 0.3s" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
          overflow: "hidden", marginBottom: "16px", border: "1px solid var(--border)",
        }}>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: "11px" }}>
            <div className="skeleton" style={{ width: "34px", height: "34px", borderRadius: "10px" }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: "120px", height: "12px", marginBottom: "6px" }} />
              <div className="skeleton" style={{ width: "80px", height: "10px" }} />
            </div>
          </div>
          <div className="skeleton" style={{ width: "100%", height: "200px" }} />
          <div style={{ padding: "14px 18px" }}>
            <div className="skeleton" style={{ width: "60px", height: "10px", marginBottom: "10px" }} />
            <div className="skeleton" style={{ width: "100%", height: "12px", marginBottom: "6px" }} />
            <div className="skeleton" style={{ width: "85%", height: "12px", marginBottom: "6px" }} />
            <div className="skeleton" style={{ width: "60%", height: "12px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  DISCOVER VIEW — existing, unchanged
// ═══════════════════════════════════════════════

function DiscoverView() {
  const [substackArticles, setSubstackArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/.netlify/functions/fetch-substack");
        const data = await res.json();
        if (!cancelled && data.ok) { setSubstackArticles(data.articles || []); }
        else if (!cancelled) { setError("Couldn't load TIC content"); }
      } catch { if (!cancelled) setError("Couldn't connect to TIC feed"); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div style={{ padding: "24px 16px 120px", animation: "fadeSlide 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <img src="/tic-head.png" alt="" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: 0, fontFamily: "Georgia, serif" }}>TIC Digest</h2>
      </div>
      <p style={{ fontSize: "13px", color: "#888", margin: "0 0 24px" }}>Articles and insights from the Talent Intelligence Collective</p>

      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00e5a0", margin: "0 auto", animation: "liveDot 1.5s ease infinite" }} />
          <p style={{ fontSize: "13px", color: "#666", marginTop: "12px" }}>Loading TIC content...</p>
        </div>
      )}

      {error && (
        <div style={{ padding: "20px", borderRadius: "14px", background: "#111", border: "1px solid #333", textAlign: "center" }}>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{error}</p>
          <a href="https://talentintelligencecollective.substack.com" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#00e5a0", marginTop: "8px", display: "inline-block" }}>Visit TIC Substack directly →</a>
        </div>
      )}

      {!loading && !error && substackArticles.map((article, i) => (
        <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" style={{
          display: "block", textDecoration: "none", marginBottom: "10px",
          padding: "14px 16px", background: "#0a0a0a", borderRadius: "14px",
          border: "1px solid #1a1a1a", transition: "border-color 0.2s",
          animation: `cardIn 0.3s ease ${i * 0.03}s both`,
        }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#333"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1a1a1a"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#00e5a0", letterSpacing: "1px" }}>TIC</span>
            {article.publishedAt && (<><span style={{ color: "#333" }}>·</span><span style={{ fontSize: "11px", color: "#666" }}>{formatDate(article.publishedAt)}</span></>)}
          </div>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#eee", margin: "0 0 4px", lineHeight: 1.3, fontFamily: "Georgia, serif" }}>{article.title}</h3>
          {article.description && (
            <p style={{ fontSize: "12px", lineHeight: 1.5, color: "#777", margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{article.description}</p>
          )}
        </a>
      ))}

      {!loading && !error && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <a href="https://talentintelligencecollective.substack.com" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "13px", color: "#888", textDecoration: "none", padding: "10px 20px", borderRadius: "12px", border: "1px solid #333", display: "inline-block", transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#00e5a0"; e.currentTarget.style.borderColor = "#00e5a0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; e.currentTarget.style.borderColor = "#333"; }}
          >Subscribe to TIC on Substack</a>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SAVED VIEW — existing, unchanged
// ═══════════════════════════════════════════════

function SavedView({ articles, likedIds, bookmarkedIds, onLike, onBookmark, onShare }) {
  const savedArticles = articles.filter((a) => bookmarkedIds.has(a.id));

  return (
    <div style={{ padding: "24px 12px 120px", animation: "fadeSlide 0.3s ease" }}>
      <div style={{ padding: "0 4px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: "0 0 6px", fontFamily: "var(--font-display)" }}>Saved</h2>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
          {savedArticles.length} article{savedArticles.length !== 1 ? "s" : ""} bookmarked
        </p>
      </div>

      {savedArticles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px", opacity: 0.5 }}>🔖</div>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Bookmark articles to save them here</p>
        </div>
      ) : (
        savedArticles.map((article, i) => (
          <ArticleCard key={article.id} article={article} index={i}
            isLiked={likedIds.has(article.id)} isBookmarked={bookmarkedIds.has(article.id)}
            onLike={onLike} onBookmark={onBookmark} onShare={onShare}
          />
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  BOTTOM NAV — updated with Watch + Listen
// ═══════════════════════════════════════════════

function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "feed", label: "Feed", Icon: FeedIcon },
    { id: "watch", label: "Watch", Icon: WatchIcon },
    { id: "listen", label: "Listen", Icon: ListenIcon },
    { id: "discover", label: "TIC", Icon: DiscoverIcon },
    { id: "saved", label: "Saved", Icon: () => <BookmarkIcon filled={false} size={22} /> },
  ];

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: "480px", zIndex: 100,
      background: "#000", borderTop: "1px solid #222",
      display: "flex", justifyContent: "space-around",
      padding: "8px 0 env(safe-area-inset-bottom, 20px)",
    }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} aria-label={tab.label} style={{
            background: "none", border: "none",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
            color: isActive ? "#00e5a0" : "#888",
            transition: "color 0.2s", padding: "6px 10px", position: "relative",
          }}>
            {isActive && (
              <div style={{
                position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)",
                width: "20px", height: "2px", borderRadius: "1px", background: "#00e5a0",
              }} />
            )}
            <tab.Icon size={22} />
            <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.5px" }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

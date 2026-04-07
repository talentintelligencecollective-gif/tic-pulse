import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase, fetchArticles, incrementEngagement, trackInteraction, fetchUserAffinities } from "./supabase.js";
import AuthPage from "./AuthPage.jsx";
import ArticleCard from "./ArticleCard.jsx";
import ShareSheet from "./ShareSheet.jsx";
import NewsletterBuilder from "./NewsletterBuilder.jsx";
import Toast from "./Toast.jsx";
import {
  SearchIcon, CloseIcon, TrendingIcon, BookmarkIcon,
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
//  APP (auth wrapper)
// ═══════════════════════════════════════════════

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00e5a0", animation: "liveDot 1.5s ease infinite" }} />
        <style>{`@keyframes liveDot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
      </div>
    );
  }

  if (!session) return <AuthPage onAuth={(s) => setSession(s)} />;
  return <PulseApp session={session} />;
}

// ═══════════════════════════════════════════════
//  PULSE APP — with personalisation + sort toggle
// ═══════════════════════════════════════════════

function PulseApp({ session }) {
  const userId = session?.user?.id;

  // ─── State ───
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

  // Server-side engagement (replaces localStorage)
  const [likedIds, setLikedIds] = useState(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [engagementLoaded, setEngagementLoaded] = useState(false);

  // Dynamic trending tags
  const [trendingTags, setTrendingTags] = useState([]);

  // Personalisation: sort mode + affinities
  const [sortMode, setSortMode] = useState("latest");
  const [affinities, setAffinities] = useState({});

  const likedIdsRef = useRef(likedIds);
  useEffect(() => { likedIdsRef.current = likedIds; }, [likedIds]);

  const searchInputRef = useRef(null);

  // ─── Load engagement from Supabase ───
  useEffect(() => {
    if (!userId) return;
    async function loadEngagement() {
      try {
        const { data } = await supabase
          .from("user_engagement")
          .select("article_id, liked, bookmarked")
          .eq("user_id", userId);

        if (data) {
          const liked = new Set();
          const bookmarked = new Set();
          for (const row of data) {
            if (row.liked) liked.add(row.article_id);
            if (row.bookmarked) bookmarked.add(row.article_id);
          }
          setLikedIds(liked);
          setBookmarkedIds(bookmarked);
        }
      } catch (e) {
        console.error("Failed to load engagement:", e);
      }
      setEngagementLoaded(true);
    }
    loadEngagement();
  }, [userId]);

  // ─── Load personalisation affinities ───
  useEffect(() => {
    if (!userId) return;
    fetchUserAffinities(userId).then(setAffinities);
  }, [userId]);

  // ─── Data Loading ───
  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchArticles({ limit: 200 });
      setArticles(data);
    } catch (err) {
      console.error("Failed to load articles:", err);
      setError("Failed to load articles. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  // ─── Dynamic trending tags (from last 48h of articles) ───
  useEffect(() => {
    if (articles.length === 0) return;
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const tagCounts = {};

    for (const a of articles) {
      const pubDate = new Date(a.published_at || a.created_at).getTime();
      if (pubDate < cutoff) continue;
      for (const tag of (a.tags || [])) {
        const clean = tag.replace(/^#/, "");
        if (clean.length > 2) {
          tagCounts[clean] = (tagCounts[clean] || 0) + 1;
        }
      }
    }

    const sorted = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag: `#${tag}`, count: String(count) }));

    if (sorted.length === 0) {
      setTrendingTags([]);
    } else {
      setTrendingTags(sorted);
    }
  }, [articles]);

  // ─── Client-side filtering + personalisation sorting ───
  const filteredArticles = useMemo(() => {
    const freshnessCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const filtered = articles.filter((a) => {
      const pubDate = new Date(a.created_at || a.published_at).getTime();
      if (pubDate < freshnessCutoff) return false;

      // Category filter
      if (activeCategory !== "All" && a.category !== activeCategory) return false;

      // Search filter
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

    // Sort: "foryou" blends recency (60%) with category affinity (40%)
    if (sortMode === "foryou" && Object.keys(affinities).length > 0) {
      const maxAff = Math.max(...Object.values(affinities).map((a) => a.total), 1);
      return filtered.sort((a, b) => {
        const recA = Math.max(0, 1 - (Date.now() - new Date(a.created_at || a.published_at).getTime()) / (7 * 86400000));
        const recB = Math.max(0, 1 - (Date.now() - new Date(b.created_at || b.published_at).getTime()) / (7 * 86400000));
        const affA = (affinities[a.category]?.total || 0) / maxAff;
        const affB = (affinities[b.category]?.total || 0) / maxAff;
        return (recB * 0.6 + affB * 0.4) - (recA * 0.6 + affA * 0.4);
      });
    }

    // Default "latest": pure chronological (newest first)
    return filtered.sort((a, b) =>
      new Date(b.created_at || b.published_at) - new Date(a.created_at || a.published_at)
    );
  }, [articles, activeCategory, searchQuery, sortMode, affinities]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  // ─── Toast ───
  const showToast = useCallback((msg) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }, []);

  // ─── Server-side Like Handler ───
  const handleLike = useCallback((articleId) => {
    const wasLiked = likedIdsRef.current.has(articleId);

    // Optimistic UI
    setLikedIds((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(articleId) : next.add(articleId);
      return next;
    });
    setArticles((prev) => prev.map((a) => {
      if (a.id !== articleId) return a;
      return { ...a, like_count: (a.like_count || 0) + (wasLiked ? -1 : 1) };
    }));

    // Persist to Supabase
    incrementEngagement(articleId, "like_count", wasLiked ? -1 : 1);
    supabase.from("user_engagement").upsert({
      user_id: userId,
      article_id: articleId,
      liked: !wasLiked,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,article_id" }).then(({ error }) => {
      if (error) console.error("Like sync error:", error);
    });

    // Track interaction for personalisation (only on like, not unlike)
    if (!wasLiked) {
      const article = articles.find(a => a.id === articleId);
      trackInteraction(userId, articleId, "like", article);
    }
  }, [userId, articles]);

  // ─── Server-side Bookmark Handler ───
  const handleBookmark = useCallback((articleId) => {
    const wasBookmarked = bookmarkedIds.has(articleId);

    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      wasBookmarked ? next.delete(articleId) : next.add(articleId);
      return next;
    });

    if (!wasBookmarked) showToast("Saved to bookmarks");

    supabase.from("user_engagement").upsert({
      user_id: userId,
      article_id: articleId,
      bookmarked: !wasBookmarked,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,article_id" }).then(({ error }) => {
      if (error) console.error("Bookmark sync error:", error);
    });

    // Track interaction for personalisation (only on bookmark, not unbookmark)
    if (!wasBookmarked) {
      const article = articles.find(a => a.id === articleId);
      trackInteraction(userId, articleId, "bookmark", article);
    }
  }, [userId, bookmarkedIds, showToast, articles]);

  const handleShare = useCallback((article) => {
    setShareTarget(article);
    incrementEngagement(article.id, "share_count", 1);
    trackInteraction(userId, article.id, "share", article);
  }, [userId]);

  // ─── Curate Mode ───
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
      <div style={{
        position: "fixed", top: "-120px", left: "50%", transform: "translateX(-50%)",
        width: "500px", height: "500px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,229,160,0.03) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      <Header
        searchOpen={searchOpen} searchQuery={searchQuery} activeCategory={activeCategory}
        searchInputRef={searchInputRef} user={session?.user} activeTab={activeTab}
        sortMode={sortMode}
        onLogout={async () => { await supabase.auth.signOut(); }}
        onToggleSearch={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}
        onSearchChange={setSearchQuery}
        onCategoryChange={(cat) => { setActiveCategory(cat); setSearchQuery(""); setSearchOpen(false); }}
        onSortModeChange={setSortMode}
      />

      <main style={{ position: "relative", zIndex: 1 }}>
        {activeTab === "feed" && (
          <FeedView
            articles={filteredArticles} loading={loading} error={error} searchQuery={searchQuery}
            likedIds={likedIds} bookmarkedIds={bookmarkedIds} selectedIds={selectedIdSet}
            trendingTags={trendingTags} user={session?.user} sortMode={sortMode}
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
          <SavedView articles={articles} likedIds={likedIds} bookmarkedIds={bookmarkedIds}
            user={session?.user} onLike={handleLike} onBookmark={handleBookmark} onShare={handleShare} />
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

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
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{selectedIds.length} article{selectedIds.length !== 1 ? "s" : ""} selected</div>
              <div style={{ fontSize: "11px", color: "#999", marginTop: "1px" }}>Ready to build your briefing</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setSelectedIds([])} style={{ background: "none", border: "1px solid #444", borderRadius: "12px", color: "#ccc", padding: "10px 14px", fontSize: "12px", fontWeight: 600 }}>Clear</button>
              <button onClick={handleOpenNewsletter} style={{ background: "#00e5a0", border: "none", borderRadius: "12px", color: "#000", padding: "10px 18px", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                <NewsletterIcon size={16} /> Build
              </button>
            </div>
          </div>
        </div>
      )}

      <ShareSheet article={shareTarget} onClose={() => setShareTarget(null)} onToast={showToast} />
      <Toast message={toast.msg} visible={toast.show} />
      {showNewsletter && <NewsletterBuilder articles={selectedArticles} onClose={() => setShowNewsletter(false)} onToast={showToast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  HEADER — with Latest / For You toggle
// ═══════════════════════════════════════════════

function Header({ searchOpen, searchQuery, activeCategory, searchInputRef, user, activeTab, sortMode, onLogout, onToggleSearch, onSearchChange, onCategoryChange, onSortModeChange }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "?").toUpperCase();

  const showCategories = activeTab === "feed";

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 100, background: "#000", borderBottom: "1px solid #222" }}>
      <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/tic-head.png" alt="TIC" style={{ width: "34px", height: "34px", objectFit: "contain" }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0, fontFamily: "Georgia, serif", color: "#fff", letterSpacing: "-0.5px" }}>Pulse</h1>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "2px 7px", borderRadius: "6px", background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.15)" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00e5a0", animation: "liveDot 2s ease infinite" }} />
                <span style={{ fontSize: "9px", fontWeight: 800, color: "#00e5a0", letterSpacing: "1px" }}>LIVE</span>
              </div>
            </div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "#888", letterSpacing: "2px", marginTop: "-1px" }}>TALENT INTELLIGENCE COLLECTIVE</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button onClick={onToggleSearch} aria-label={searchOpen ? "Close search" : "Open search"} style={{
            background: searchOpen ? "rgba(0,229,160,0.08)" : "none", border: "none",
            color: searchOpen ? "#00e5a0" : "#888",
            padding: "8px", borderRadius: "12px", display: "flex", alignItems: "center", transition: "all 0.2s",
          }}>
            {searchOpen ? <CloseIcon size={18} /> : <SearchIcon />}
          </button>
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
                  background: "#1a1a1e", border: "1px solid #444",
                  borderRadius: "14px", padding: "8px", minWidth: "180px", zIndex: 201,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "fadeSlide 0.15s ease",
                }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>{user?.user_metadata?.full_name || "User"}</div>
                    <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{user?.email}</div>
                  </div>
                  <button onClick={() => { setShowUserMenu(false); onLogout(); }} style={{
                    width: "100%", padding: "10px 12px", background: "none", border: "none",
                    borderRadius: "8px", color: "#ff3b5c", fontSize: "13px", fontWeight: 600,
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

      {searchOpen && (
        <div style={{ padding: "10px 16px 0", animation: "fadeSlide 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#111", borderRadius: "14px", padding: "0 14px", border: "1px solid #333" }}>
            <SearchIcon size={16} />
            <input ref={searchInputRef} value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search articles, topics, tags..." style={{ flex: 1, background: "none", border: "none", color: "#eee", padding: "11px 0", fontSize: "14px", outline: "none" }} />
            {searchQuery && (
              <button onClick={() => onSearchChange("")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#888", width: "20px", height: "20px", borderRadius: "50%", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            )}
          </div>
        </div>
      )}

      {showCategories && (
        <>
          {/* Sort toggle + category pills */}
          <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "10px 16px 0", overflowX: "auto", scrollbarWidth: "none" }}>
            {/* Latest / For You toggle */}
            <div style={{ display: "flex", background: "#111", borderRadius: "20px", padding: "2px", flexShrink: 0, border: "1px solid #222" }}>
              {[{ key: "latest", label: "Latest" }, { key: "foryou", label: "For You" }].map(({ key, label }) => (
                <button key={key} onClick={() => onSortModeChange(key)} style={{
                  padding: "4px 12px", borderRadius: "18px", fontSize: "10px", fontWeight: 700,
                  border: "none", transition: "all 0.2s",
                  background: sortMode === key ? "#00e5a0" : "transparent",
                  color: sortMode === key ? "#000" : "#666",
                  letterSpacing: "0.3px",
                }}>{label}</button>
              ))}
            </div>
            <div style={{ width: "1px", height: "16px", background: "#333", flexShrink: 0 }} />
            {/* Category pills */}
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              const color = cat === "All" ? "#00e5a0" : (CAT_COLORS[cat] || "#00e5a0");
              return (
                <button key={cat} onClick={() => onCategoryChange(cat)} style={{
                  padding: "5px 14px", borderRadius: "20px", whiteSpace: "nowrap",
                  fontSize: "11px", fontWeight: 700, letterSpacing: "0.3px",
                  border: isActive ? `1px solid ${color}40` : "1px solid #333",
                  background: isActive ? `${color}12` : "#111",
                  color: isActive ? color : "#999",
                  transition: "all 0.25s ease",
                }}>{cat}</button>
              );
            })}
          </div>
          <div style={{ height: "10px" }} />
        </>
      )}
      {!showCategories && !searchOpen && <div style={{ height: "12px" }} />}
    </header>
  );
}

// ═══════════════════════════════════════════════
//  FEED VIEW — with time grouping + sort mode
// ═══════════════════════════════════════════════

function FeedView({ articles, loading, error, searchQuery, likedIds, bookmarkedIds, selectedIds, trendingTags, user, sortMode, onLike, onBookmark, onShare, onToggleSelect, onClearFilters, onSearchTag, onRetry }) {
  const hasSelections = selectedIds.size > 0;

  // Group articles by time period for "latest" mode
  const groupedArticles = useMemo(() => {
    if (sortMode !== "latest" || searchQuery) {
      // For You mode or search: flat list, no grouping
      return [{ label: null, articles }];
    }

    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const h48 = 48 * 60 * 60 * 1000;

    const today = [];
    const yesterday = [];
    const thisWeek = [];

    for (const a of articles) {
      const age = now - new Date(a.created_at || a.published_at).getTime();
      if (age < h24) today.push(a);
      else if (age < h48) yesterday.push(a);
      else thisWeek.push(a);
    }

    const groups = [];
    if (today.length > 0) groups.push({ label: "Today", articles: today });
    if (yesterday.length > 0) groups.push({ label: "Yesterday", articles: yesterday });
    if (thisWeek.length > 0) groups.push({ label: "Earlier this week", articles: thisWeek });

    // If no articles in any group, just return them flat
    if (groups.length === 0 && articles.length > 0) {
      groups.push({ label: null, articles });
    }

    return groups;
  }, [articles, sortMode, searchQuery]);

  return (
    <div style={{ padding: hasSelections ? "12px 12px 180px" : "12px 12px 110px" }}>
      <TrendingTicker tags={trendingTags} onTagClick={onSearchTag} />

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
          <button onClick={onClearFilters} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px", color: "#fff", padding: "4px 12px", fontSize: "12px", fontWeight: 600 }}>Clear</button>
        </div>
      )}

      {loading && articles.length === 0 && <SkeletonCards />}

      {error && (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ fontSize: "14px", color: "#ff3b5c", fontWeight: 500 }}>{error}</p>
          <button onClick={onRetry} style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)", color: "#00e5a0", padding: "8px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, marginTop: "12px" }}>Try again</button>
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px", opacity: 0.5 }}>🔍</div>
          <p style={{ fontSize: "15px", color: "#888", fontWeight: 500 }}>No articles match your filters</p>
          <button onClick={onClearFilters} style={{ background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)", color: "#00e5a0", padding: "8px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, marginTop: "12px" }}>Clear filters</button>
        </div>
      )}

      {groupedArticles.map((group, gi) => (
        <div key={group.label || "all"}>
          {group.label && (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: gi === 0 ? "4px 4px 10px" : "20px 4px 10px",
            }}>
              <span style={{
                fontSize: "11px", fontWeight: 700, color: "#666",
                letterSpacing: "1.5px", textTransform: "uppercase",
              }}>{group.label}</span>
              <div style={{ flex: 1, height: "1px", background: "#222" }} />
              <span style={{ fontSize: "10px", color: "#555" }}>{group.articles.length}</span>
            </div>
          )}
          {group.articles.map((article, i) => (
            <ArticleCard key={article.id} article={article} index={i} user={user}
              isLiked={likedIds.has(article.id)} isBookmarked={bookmarkedIds.has(article.id)}
              isSelected={selectedIds.has(article.id)}
              onLike={onLike} onBookmark={onBookmark} onShare={onShare} onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  WATCH VIEW
// ═══════════════════════════════════════════════

function WatchView() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        let q = supabase.from("videos").select("*, sources(name, tier)")
          .order("published_at", { ascending: false }).limit(300);
        if (typeFilter !== "all") q = q.eq("video_type", typeFilter);
        const { data } = await q;
        setVideos(data || []);
      } catch { setVideos([]); }
      setLoading(false);
    }
    setLoading(true); load();
  }, [typeFilter]);

  // Derive top topics from video tags
  const topTopics = useMemo(() => {
    const counts = {};
    for (const v of videos) {
      for (const tag of (v.tags || [])) {
        const clean = tag.toLowerCase().trim();
        if (clean.length > 2) counts[clean] = (counts[clean] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }, [videos]);

  // Client-side search + topic filter
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
      {/* Search bar */}
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

      {/* Type filter pills */}
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

      {/* Topic pills from tags */}
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
              }}>{tag} <span style={{ color: "#555", marginLeft: 2 }}>{count}</span></button>
            );
          })}
        </div>
      )}

      {/* Results count when filtering */}
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
            return (
              <div key={v.id} onClick={() => setSelected(v)} style={{
                cursor: "pointer", background: "#111", borderRadius: 14, overflow: "hidden",
                border: "1px solid #222", transition: "border-color 0.2s, transform 0.15s",
                animation: `cardIn 0.3s ease ${i * 0.03}s both`,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.transform = "none"; }}
              >
                <div style={{ width: "100%", aspectRatio: "16/9", position: "relative", background: thumbUrl ? `url(${thumbUrl}) center/cover` : "linear-gradient(135deg, #111, #000)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ position: "absolute", top: 6, left: 6, fontSize: 8, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: `${tc}30`, color: tc, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{videoTypeLabel(v.video_type)}</span>
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
//  LISTEN VIEW
// ═══════════════════════════════════════════════

function ListenView() {
  const [episodes, setEpisodes] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

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

  // Real audio playback
  const handlePlay = useCallback((ep) => {
    if (playing === ep.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    if (!ep.audio_url) {
      if (ep.link) window.open(ep.link, "_blank");
      return;
    }

    const audio = new Audio(ep.audio_url);
    audioRef.current = audio;
    setPlaying(ep.id);
    setProgress(0);
    setDuration(0);

    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    });
    audio.addEventListener("ended", () => { setPlaying(null); setProgress(0); });
    audio.addEventListener("error", () => {
      setPlaying(null);
      if (ep.link) window.open(ep.link, "_blank");
    });
    audio.play().catch(() => {
      setPlaying(null);
      if (ep.link) window.open(ep.link, "_blank");
    });
  }, [playing]);

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

  return (
    <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease", background: "#000", minHeight: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: "#111", borderRadius: 16, border: "1px solid #222", marginBottom: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, rgba(0,229,160,0.1), rgba(0,180,216,0.1))", border: "1px solid rgba(0,229,160,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/tic-head.png" alt="TIC" style={{ width: 34, height: 34, objectFit: "contain" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 2px", fontFamily: "Georgia, serif" }}>TIC Podcast Network</h2>
          <div style={{ fontSize: 12, color: "#888" }}>{sources.length} shows · {episodes.length} episodes</div>
        </div>
      </div>

      {/* Platform links */}
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
              onMouseEnter={e => { e.target.style.borderColor = "#00e5a0"; e.target.style.color = "#00e5a0"; }}
              onMouseLeave={e => { e.target.style.borderColor = "#222"; e.target.style.color = "#888"; }}
            >{p.label} ↗</a>
          ))}
        </div>
      )}

      {/* Search bar */}
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

      {/* Source filter */}
      {sources.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
          <button onClick={() => setSourceFilter(null)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: !sourceFilter ? "rgba(0,229,160,0.12)" : "#111", color: !sourceFilter ? "#00e5a0" : "#888", border: `1px solid ${!sourceFilter ? "rgba(0,229,160,0.3)" : "#222"}`, whiteSpace: "nowrap" }}>All Shows</button>
          {sources.map(s => {
            const isActive = sourceFilter === s.id;
            return <button key={s.id} onClick={() => setSourceFilter(isActive ? null : s.id)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: isActive ? "rgba(0,229,160,0.12)" : "#111", color: isActive ? "#00e5a0" : "#888", border: `1px solid ${isActive ? "rgba(0,229,160,0.3)" : "#222"}`, whiteSpace: "nowrap" }}>{s.name.length > 20 ? s.name.substring(0, 18) + "…" : s.name}</button>;
          })}
        </div>
      )}

      {/* Now Playing bar */}
      {playing && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "#111", borderRadius: 12, border: "1px solid #00e5a0", animation: "fadeSlide 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button onClick={() => { audioRef.current?.pause(); setPlaying(null); setProgress(0); }} style={{
              width: 28, height: 28, borderRadius: "50%", background: "#00e5a0", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <div style={{ display: "flex", gap: 2 }}>
                <div style={{ width: 2.5, height: 10, background: "#000", borderRadius: 1 }} />
                <div style={{ width: 2.5, height: 10, background: "#000", borderRadius: 1 }} />
              </div>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#eee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {episodes.find(e => e.id === playing)?.title || "Playing…"}
              </div>
              <div style={{ fontSize: 10, color: "#666" }}>
                {fmtTime(duration * progress / 100)} / {fmtTime(duration)}
              </div>
            </div>
          </div>
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
            return (
              <div key={ep.id} style={{ background: "#111", borderRadius: 14, overflow: "hidden", border: `1px solid ${isPlay ? "#00e5a0" : "#222"}`, transition: "border-color 0.3s", animation: `cardIn 0.3s ease ${i * 0.03}s both` }}>
                {isPlay && <div style={{ height: 2, background: "#222" }}><div style={{ height: "100%", width: `${progress}%`, background: "#00e5a0", transition: "width 0.3s linear" }} /></div>}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <button onClick={() => handlePlay(ep)} title={hasAudio ? (isPlay ? "Pause" : "Play") : "Open episode"} style={{
                      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: isPlay ? "#00e5a0" : "#1a1a1e",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s", marginTop: 2, border: "none",
                    }}>
                      {isPlay ? (
                        <div style={{ display: "flex", gap: 3 }}><div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} /><div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} /></div>
                      ) : (
                        <div style={{ width: 0, height: 0, borderLeft: `10px solid ${hasAudio ? "#eee" : "#666"}`, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", marginLeft: 2 }} />
                      )}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#00e5a0", fontFamily: "monospace" }}>{ep.sources?.name || "Podcast"}</span>
                        <span style={{ fontSize: 10, color: "#666" }}>{relDate(ep.published_at)}</span>
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: "#eee", margin: "0 0 5px", lineHeight: 1.3, fontFamily: "Georgia, serif" }}>{ep.title}</h4>
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
//  TRENDING TICKER — dynamic
// ═══════════════════════════════════════════════

function TrendingTicker({ tags, onTagClick }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
      marginBottom: "14px", background: "rgba(255,255,255,0.015)",
      borderRadius: "14px", border: "1px solid #1a1a1a",
      overflowX: "auto", scrollbarWidth: "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#00e5a0", flexShrink: 0 }}>
        <TrendingIcon />
        <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1.2px" }}>TRENDING</span>
      </div>
      <div style={{ width: "1px", height: "14px", background: "#333", flexShrink: 0 }} />
      {tags.map((t) => (
        <button key={t.tag} onClick={() => onTagClick(t.tag.slice(1))} style={{
          background: "none", border: "none", color: "#888",
          fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
          padding: "3px 6px", borderRadius: "6px", transition: "all 0.2s",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#00e5a0"; e.currentTarget.style.background = "rgba(0,229,160,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; e.currentTarget.style.background = "none"; }}
        >{t.tag}</button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SKELETON, DISCOVER, SAVED, BOTTOM NAV
// ═══════════════════════════════════════════════

function SkeletonCards() {
  return (
    <div style={{ animation: "fadeIn 0.3s" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: "#111", borderRadius: "20px", overflow: "hidden", marginBottom: "16px", border: "1px solid #222" }}>
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: "11px" }}>
            <div className="skeleton" style={{ width: "34px", height: "34px", borderRadius: "10px" }} />
            <div style={{ flex: 1 }}><div className="skeleton" style={{ width: "120px", height: "12px", marginBottom: "6px" }} /><div className="skeleton" style={{ width: "80px", height: "10px" }} /></div>
          </div>
          <div className="skeleton" style={{ width: "100%", height: "200px" }} />
          <div style={{ padding: "14px 18px" }}><div className="skeleton" style={{ width: "60px", height: "10px", marginBottom: "10px" }} /><div className="skeleton" style={{ width: "100%", height: "12px", marginBottom: "6px" }} /><div className="skeleton" style={{ width: "85%", height: "12px" }} /></div>
        </div>
      ))}
    </div>
  );
}

function DiscoverView() {
  const [substackArticles, setSubstackArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const decode = (str) => { if (!str) return ""; try { const txt = document.createElement("textarea"); txt.innerHTML = str; return txt.value; } catch { return str; } };
  const dedupe = (articles) => { const seen = new Set(); return articles.filter(a => { if (seen.has(a.url)) return false; seen.add(a.url); return true; }); };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/.netlify/functions/fetch-substack");
        const data = await res.json();
        if (!cancelled && data.ok) { setSubstackArticles(dedupe(data.articles || [])); }
        else if (!cancelled) { setError("Couldn't load TIC content"); }
      } catch { if (!cancelled) setError("Couldn't connect to TIC feed"); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (iso) => { if (!iso) return ""; return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };

  return (
    <div style={{ padding: "24px 16px 120px", animation: "fadeSlide 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: 0, fontFamily: "Georgia, serif" }}>TIC Digest</h2>
      </div>
      <p style={{ fontSize: "13px", color: "#888", margin: "0 0 24px" }}>Articles and insights from the Talent Intelligence Collective</p>

      {loading && <div style={{ padding: "40px 0", textAlign: "center" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00e5a0", margin: "0 auto", animation: "liveDot 1.5s ease infinite" }} /><p style={{ fontSize: "13px", color: "#666", marginTop: "12px" }}>Loading TIC content...</p></div>}

      {error && <div style={{ padding: "20px", borderRadius: "14px", background: "#111", border: "1px solid #333", textAlign: "center" }}><p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{error}</p></div>}

      {!loading && !error && substackArticles.map((article, i) => (
        <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" style={{
          display: "block", textDecoration: "none", marginBottom: "10px", padding: "14px 16px", background: "#0a0a0a", borderRadius: "14px", border: "1px solid #1a1a1a", transition: "border-color 0.2s", animation: `cardIn 0.3s ease ${i * 0.03}s both`,
        }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#333"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1a1a1a"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#00e5a0", letterSpacing: "1px" }}>TIC</span>
            {article.publishedAt && (<><span style={{ color: "#333" }}>·</span><span style={{ fontSize: "11px", color: "#666" }}>{formatDate(article.publishedAt)}</span></>)}
          </div>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#eee", margin: "0 0 4px", lineHeight: 1.3, fontFamily: "Georgia, serif" }}>{decode(article.title)}</h3>
          {article.description && <p style={{ fontSize: "12px", lineHeight: 1.5, color: "#777", margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{decode(article.description)}</p>}
        </a>
      ))}

      {!loading && !error && <div style={{ textAlign: "center", padding: "16px 0" }}>
        <a href="https://talentintelligencecollective.substack.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "#888", textDecoration: "none", padding: "10px 20px", borderRadius: "12px", border: "1px solid #333", display: "inline-block" }}>Subscribe to TIC on Substack</a>
      </div>}
    </div>
  );
}

function SavedView({ articles, likedIds, bookmarkedIds, user, onLike, onBookmark, onShare }) {
  const savedArticles = articles.filter((a) => bookmarkedIds.has(a.id));
  return (
    <div style={{ padding: "24px 12px 120px", animation: "fadeSlide 0.3s ease" }}>
      <div style={{ padding: "0 4px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: "0 0 6px", fontFamily: "Georgia, serif" }}>Saved</h2>
        <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{savedArticles.length} article{savedArticles.length !== 1 ? "s" : ""} bookmarked</p>
      </div>
      {savedArticles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px", opacity: 0.5 }}>🔖</div>
          <p style={{ color: "#888", fontSize: "14px" }}>Bookmark articles to save them here</p>
        </div>
      ) : (
        savedArticles.map((article, i) => (
          <ArticleCard key={article.id} article={article} index={i} user={user}
            isLiked={likedIds.has(article.id)} isBookmarked={bookmarkedIds.has(article.id)}
            onLike={onLike} onBookmark={onBookmark} onShare={onShare} />
        ))
      )}
    </div>
  );
}

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
      width: "100%", maxWidth: "480px", zIndex: 100, background: "#000", borderTop: "1px solid #222",
      display: "flex", justifyContent: "space-around", padding: "8px 0 env(safe-area-inset-bottom, 20px)",
    }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} aria-label={tab.label} style={{
            background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
            color: isActive ? "#00e5a0" : "#888", transition: "color 0.2s", padding: "6px 10px", position: "relative",
          }}>
            {isActive && <div style={{ position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)", width: "20px", height: "2px", borderRadius: "1px", background: "#00e5a0" }} />}
            <tab.Icon size={22} />
            <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.5px" }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

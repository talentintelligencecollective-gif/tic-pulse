import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase, fetchArticles, incrementEngagement } from "./supabase.js";
import AuthPage from "./AuthPage.jsx";
import ArticleCard from "./ArticleCard.jsx";
import ShareSheet from "./ShareSheet.jsx";
import NewsletterBuilder from "./NewsletterBuilder.jsx";
import Toast from "./Toast.jsx";
import {
  SearchIcon, CloseIcon, BookmarkIcon,
  FeedIcon, DiscoverIcon, NewsletterIcon,
  HeartIcon, CommentIcon, ShareIcon, ExternalIcon,
} from "./Icons.jsx";

// ─── Constants ───

const CATEGORIES = [
  "All", "Talent Strategy", "Labour Market", "Automation",
  "Executive Moves", "Compensation", "Workforce Planning", "Skills", "DEI",
];

const CAT_COLORS = {
  "Talent Strategy": "#00E5B8",
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

function FilterIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
    </svg>
  );
}

// ─── Multimedia helpers (unchanged) ───

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
const videoTypeColor = (t) => t === "podcast" ? "#00E5B8" : t === "event" ? "#f59e0b" : t === "panel" ? "#a855f7" : t === "short" ? "#00b4d8" : "#888";
const videoTypeLabel = (t) => ({ podcast: "Podcast", event: "Event", panel: "Panel", short: "Short", video: "Video" }[t] || "Video");

// ─── Global Styles ───

const GLOBAL_STYLES = `
  @keyframes liveDot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
  @keyframes pulseDot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes fadeSlide { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes cardIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes sheetUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
  @keyframes slideUp { from { transform:translateY(40px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  :root {
    --bg: #0a0a0c; --surface: #131315; --border: rgba(255,255,255,0.06);
    --accent: #00E5B8; --red: #ff3b5c; --text: #f0f0f2; --text-secondary: #888; --text-muted: #555;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { background: var(--bg); margin: 0; font-family: 'DM Sans', -apple-system, system-ui, sans-serif; }
  ::-webkit-scrollbar { display: none; }
  .skeleton { background: linear-gradient(90deg, #1a1a1e 25%, #222 50%, #1a1a1e 75%);
    background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 8px; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;

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
      <div style={{ minHeight: "100vh", background: "var(--bg,#0a0a0c)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00E5B8", animation: "pulseDot 1.5s ease infinite" }} />
        <style>{GLOBAL_STYLES}</style>
      </div>
    );
  }

  if (!session) return <AuthPage onAuth={(s) => setSession(s)} />;
  return <PulseApp session={session} />;
}

// ═══════════════════════════════════════════════
//  PULSE APP
// ═══════════════════════════════════════════════

function PulseApp({ session }) {
  const userId = session?.user?.id;

  // ─── State ───
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [feedMode, setFeedMode] = useState("foryou"); // foryou | latest | trending
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("feed");
  const [shareTarget, setShareTarget] = useState(null);
  const [toast, setToast] = useState({ msg: "", show: false });
  const [previewArticle, setPreviewArticle] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [showNewsletter, setShowNewsletter] = useState(false);

  const [likedIds, setLikedIds] = useState(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [engagementLoaded, setEngagementLoaded] = useState(false);

  const likedIdsRef = useRef(likedIds);
  useEffect(() => { likedIdsRef.current = likedIds; }, [likedIds]);

  const searchInputRef = useRef(null);

  // ─── Load engagement from Supabase ───
  useEffect(() => {
    if (!userId) return;
    async function loadEngagement() {
      try {
        const { data } = await supabase.from("user_engagement")
          .select("article_id, liked, bookmarked").eq("user_id", userId);
        if (data) {
          const liked = new Set(), bookmarked = new Set();
          for (const row of data) {
            if (row.liked) liked.add(row.article_id);
            if (row.bookmarked) bookmarked.add(row.article_id);
          }
          setLikedIds(liked);
          setBookmarkedIds(bookmarked);
        }
      } catch (e) { console.error("Failed to load engagement:", e); }
      setEngagementLoaded(true);
    }
    loadEngagement();
  }, [userId]);

  // ─── Data Loading ───
  const loadArticles = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchArticles({ limit: 100 });
      setArticles(data);
    } catch (err) {
      console.error("Failed to load articles:", err);
      setError("Failed to load articles. Check your connection.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  // ─── Client-side filtering (7-day freshness) ───
  const filteredArticles = useMemo(() => {
    const freshnessCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let result = articles.filter((a) => {
      const pubDate = new Date(a.published_at || a.created_at).getTime();
      if (pubDate < freshnessCutoff) return false;
      const matchesCat = activeCategory === "All" || a.category === activeCategory;
      if (!matchesCat) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (a.title || "").toLowerCase().includes(q) ||
          (a.tldr || "").toLowerCase().includes(q) ||
          (a.tags || []).some((t) => t.toLowerCase().includes(q)) ||
          (a.category || "").toLowerCase().includes(q);
      }
      return true;
    });

    // Sort based on feed mode
    if (feedMode === "trending") {
      result.sort((a, b) => ((b.like_count || 0) + (b.comment_count || 0) + (b.share_count || 0)) -
        ((a.like_count || 0) + (a.comment_count || 0) + (a.share_count || 0)));
    } else {
      result.sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
    }
    return result;
  }, [articles, activeCategory, searchQuery, feedMode]);

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
    setLikedIds((prev) => { const next = new Set(prev); wasLiked ? next.delete(articleId) : next.add(articleId); return next; });
    setArticles((prev) => prev.map((a) => a.id !== articleId ? a : { ...a, like_count: (a.like_count || 0) + (wasLiked ? -1 : 1) }));
    incrementEngagement(articleId, "like_count", wasLiked ? -1 : 1);
    supabase.from("user_engagement").upsert({
      user_id: userId, article_id: articleId, liked: !wasLiked, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,article_id" }).then(({ error }) => { if (error) console.error("Like sync error:", error); });
  }, [userId]);

  // ─── Server-side Bookmark Handler ───
  const handleBookmark = useCallback((articleId) => {
    const wasBookmarked = bookmarkedIds.has(articleId);
    setBookmarkedIds((prev) => { const next = new Set(prev); wasBookmarked ? next.delete(articleId) : next.add(articleId); return next; });
    if (!wasBookmarked) showToast("Saved to bookmarks");
    supabase.from("user_engagement").upsert({
      user_id: userId, article_id: articleId, bookmarked: !wasBookmarked, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,article_id" }).then(({ error }) => { if (error) console.error("Bookmark sync error:", error); });
  }, [userId, bookmarkedIds, showToast]);

  const handleShare = useCallback((article) => {
    setShareTarget(article);
    incrementEngagement(article.id, "share_count", 1);
  }, []);

  // ─── Curate Mode ───
  const handleToggleSelect = useCallback((articleId) => {
    setSelectedIds((prev) => prev.includes(articleId) ? prev.filter((id) => id !== articleId) : [...prev, articleId]);
  }, []);

  const handleOpenNewsletter = useCallback(() => {
    if (selectedIds.length === 0) return;
    setShowNewsletter(true);
  }, [selectedIds]);

  const selectedArticles = useMemo(() => {
    const m = new Map(articles.map((a) => [a.id, a]));
    return selectedIds.map((id) => m.get(id)).filter(Boolean);
  }, [articles, selectedIds]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ─── Preview ───
  const handleLongPress = useCallback((article) => {
    setPreviewArticle(article);
    // Lock body scroll
    document.body.style.overflow = "hidden";
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewArticle(null);
    document.body.style.overflow = "";
  }, []);

  // ─── Render ───
  return (
    <div style={{ minHeight: "100dvh", maxWidth: "480px", margin: "0 auto", position: "relative", background: "var(--bg, #0a0a0c)" }}>
      <style>{GLOBAL_STYLES}</style>

      <Header
        searchOpen={searchOpen} searchQuery={searchQuery}
        activeCategory={activeCategory} feedMode={feedMode}
        searchInputRef={searchInputRef} user={session?.user} activeTab={activeTab}
        onLogout={async () => { await supabase.auth.signOut(); }}
        onToggleSearch={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}
        onSearchChange={setSearchQuery}
        onCategoryChange={(cat) => { setActiveCategory(cat); setSearchQuery(""); setSearchOpen(false); }}
        onFeedModeChange={setFeedMode}
      />

      <main style={{ position: "relative", zIndex: 1 }}>
        {activeTab === "feed" && (
          <FeedView
            articles={filteredArticles} loading={loading} error={error} searchQuery={searchQuery}
            likedIds={likedIds} bookmarkedIds={bookmarkedIds} selectedIds={selectedIdSet}
            user={session?.user}
            onLike={handleLike} onBookmark={handleBookmark} onShare={handleShare}
            onToggleSelect={handleToggleSelect} onLongPress={handleLongPress}
            onClearFilters={() => { setActiveCategory("All"); setSearchQuery(""); setSearchOpen(false); }}
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

      {/* Newsletter selection bar */}
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
              <button onClick={() => setSelectedIds([])} style={{ background: "none", border: "1px solid #444", borderRadius: "12px", color: "#ccc", padding: "10px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Clear</button>
              <button onClick={handleOpenNewsletter} style={{ background: "#00E5B8", border: "none", borderRadius: "12px", color: "#000", padding: "10px 18px", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                <NewsletterIcon size={16} /> Build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview overlay */}
      {previewArticle && (
        <ArticlePreview
          article={previewArticle}
          isLiked={likedIds.has(previewArticle.id)}
          isBookmarked={bookmarkedIds.has(previewArticle.id)}
          onClose={handleClosePreview}
          onLike={() => handleLike(previewArticle.id)}
          onBookmark={() => handleBookmark(previewArticle.id)}
          onShare={() => handleShare(previewArticle)}
          onToggleSelect={handleToggleSelect ? () => handleToggleSelect(previewArticle.id) : null}
          isSelected={selectedIdSet.has(previewArticle.id)}
        />
      )}

      <ShareSheet article={shareTarget} onClose={() => setShareTarget(null)} onToast={showToast} />
      <Toast message={toast.msg} visible={toast.show} />
      {showNewsletter && <NewsletterBuilder articles={selectedArticles} onClose={() => setShowNewsletter(false)} onToast={showToast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  HEADER — redesigned with greeting + pill tabs
// ═══════════════════════════════════════════════

function Header({ searchOpen, searchQuery, activeCategory, feedMode, searchInputRef, user, activeTab,
  onLogout, onToggleSearch, onSearchChange, onCategoryChange, onFeedModeChange }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "?").toUpperCase();
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const showFeedHeader = activeTab === "feed";

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 100,
      background: "rgba(10,10,12,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--border, rgba(255,255,255,0.06))" }}>

      {/* Top row: logo + actions */}
      <div style={{ padding: "10px 18px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "9px",
            background: "linear-gradient(135deg, #00E5B8, #00b4d8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px", fontWeight: 800, color: "#000" }}>TIC</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: "21px", fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Pulse</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "4px",
              padding: "3px 8px", borderRadius: "8px",
              background: "rgba(0,229,184,0.07)", border: "1px solid rgba(0,229,184,0.1)", marginLeft: "6px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00E5B8", animation: "pulseDot 2s ease infinite" }} />
              <span style={{ fontSize: "9px", fontWeight: 700, color: "#00E5B8", letterSpacing: "1.2px" }}>LIVE</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button onClick={onToggleSearch} aria-label={searchOpen ? "Close search" : "Open search"}
            style={{ background: searchOpen ? "rgba(0,229,184,0.08)" : "rgba(255,255,255,0.05)",
              border: "none", color: searchOpen ? "#00E5B8" : "#999",
              padding: "8px", borderRadius: "50%", display: "flex", alignItems: "center",
              width: "34px", height: "34px", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" }}>
            {searchOpen ? <CloseIcon size={16} /> : <SearchIcon size={18} />}
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowUserMenu(!showUserMenu)} aria-label="Account menu"
              style={{ width: "32px", height: "32px", borderRadius: "50%",
                background: "linear-gradient(135deg, #00E5B8, #00b4d8)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 800, color: "#000", cursor: "pointer" }}>{userInitials}</button>
            {showUserMenu && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setShowUserMenu(false)} />
                <div style={{ position: "absolute", top: "40px", right: 0,
                  background: "#1a1a1e", border: "1px solid #444", borderRadius: "14px",
                  padding: "8px", minWidth: "180px", zIndex: 201,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "fadeSlide 0.15s ease" }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>{user?.user_metadata?.full_name || "User"}</div>
                    <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{user?.email}</div>
                  </div>
                  <button onClick={() => { setShowUserMenu(false); onLogout(); }}
                    style={{ width: "100%", padding: "10px 12px", background: "none", border: "none",
                      borderRadius: "8px", color: "#ff3b5c", fontSize: "13px", fontWeight: 600,
                      textAlign: "left", cursor: "pointer", marginTop: "4px", transition: "background 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,59,92,0.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Greeting + feed tabs (only on feed tab) */}
      {showFeedHeader && (
        <div style={{ padding: "0 18px" }}>
          <div style={{ paddingTop: "10px", paddingBottom: "2px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f0f2", letterSpacing: "-0.3px", margin: 0 }}>
              {greeting}, {firstName}
            </h2>
            <p style={{ fontSize: "13px", color: "#666", marginTop: "2px", marginBottom: 0 }}>Your executive brief is ready</p>
          </div>

          {/* Feed mode pills */}
          <div style={{ display: "flex", gap: "8px", padding: "12px 0", alignItems: "center", overflowX: "auto", scrollbarWidth: "none" }}>
            {[["foryou", "For You"], ["latest", "Latest"], ["trending", "Trending"]].map(([id, label]) => (
              <button key={id} onClick={() => onFeedModeChange(id)}
                style={{ padding: "8px 18px", borderRadius: 24, whiteSpace: "nowrap",
                  fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer",
                  background: feedMode === id ? "#00E5B8" : "rgba(255,255,255,0.05)",
                  color: feedMode === id ? "#000" : "#777", transition: "all 0.2s" }}>
                {label}
              </button>
            ))}
            <button style={{ display: "flex", alignItems: "center", padding: "7px",
              borderRadius: "50%", background: "rgba(255,255,255,0.05)",
              border: "none", color: "#999", cursor: "pointer", flexShrink: 0 }}>
              <FilterIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      {searchOpen && (
        <div style={{ padding: "8px 18px 0", animation: "fadeSlide 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px",
            background: "var(--surface, #131315)", borderRadius: "14px", padding: "0 14px",
            border: "1px solid #333" }}>
            <SearchIcon size={16} />
            <input ref={searchInputRef} value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search articles, topics, tags..."
              style={{ flex: 1, background: "none", border: "none", color: "#eee",
                padding: "11px 0", fontSize: "14px", outline: "none", fontFamily: "inherit" }} />
            {searchQuery && (
              <button onClick={() => onSearchChange("")}
                style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#888",
                  width: "20px", height: "20px", borderRadius: "50%", fontSize: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>×</button>
            )}
          </div>
        </div>
      )}

      {/* Category chips (feed tab only) */}
      {showFeedHeader && (
        <div style={{ display: "flex", gap: "7px", padding: "6px 18px 12px",
          overflowX: "auto", scrollbarWidth: "none" }}>
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            const c = cat === "All" ? "#00E5B8" : (CAT_COLORS[cat] || "#00E5B8");
            return (
              <button key={cat} onClick={() => onCategoryChange(cat)}
                style={{ padding: "5px 13px", borderRadius: 20, whiteSpace: "nowrap",
                  fontSize: "11px", fontWeight: 600, cursor: "pointer",
                  background: isActive ? `${c}18` : "rgba(255,255,255,0.04)",
                  color: isActive ? c : "#777", transition: "all 0.2s",
                  border: `1px solid ${isActive ? c + "30" : "rgba(255,255,255,0.06)"}` }}>
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {!showFeedHeader && !searchOpen && <div style={{ height: "12px" }} />}
    </header>
  );
}

// ═══════════════════════════════════════════════
//  ARTICLE PREVIEW — long-press overlay
// ═══════════════════════════════════════════════

function ArticlePreview({ article, isLiked, isBookmarked, isSelected, onClose, onLike, onBookmark, onShare, onToggleSelect }) {
  const color = CAT_COLORS[article.category] || "#00E5B8";
  const timeDisplay = relDate(article.published_at || article.created_at);
  const readTime = article.read_time_min || (article.tldr ? Math.max(1, Math.ceil(article.tldr.split(/\s+/).length / 200)) : null);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
      padding: "0 12px 24px", animation: "fadeIn 0.2s ease",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 456, margin: "0 auto", borderRadius: 20,
        background: "#1a1a1e", border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden", maxHeight: "80vh", overflowY: "auto",
        animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        scrollbarWidth: "none",
      }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "10px auto 0" }} />

        {/* Header */}
        <div style={{ padding: "14px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ padding: "4px 10px", borderRadius: 8, background: `${color}30`, color, fontSize: 11, fontWeight: 700 }}>
              {article.category?.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: "#555" }}>{timeDisplay}</span>
            {readTime && <><span style={{ fontSize: 11, color: "#444" }}>·</span><span style={{ fontSize: 11, color: "#555" }}>{readTime} min read</span></>}
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f2", lineHeight: 1.3, letterSpacing: -0.2, margin: 0 }}>
            {article.title}
          </h3>
          <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
            <span style={{ fontWeight: 600, color: "#999" }}>{article.source_name || article.source_domain}</span>
          </div>
        </div>

        {/* TL;DR */}
        {article.tldr && (
          <div style={{ padding: "14px 18px 0" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#aaa", marginBottom: 6, letterSpacing: 0.3 }}>TL;DR</div>
            <p style={{ fontSize: 13, color: "#999", lineHeight: 1.55, margin: 0 }}>{article.tldr}</p>
          </div>
        )}

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div style={{ display: "flex", gap: 6, padding: "12px 18px 0", flexWrap: "wrap" }}>
            {article.tags.slice(0, 5).map((t) => (
              <span key={t} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", fontSize: 11, color: "#666" }}>{t}</span>
            ))}
          </div>
        )}

        {/* Action bar */}
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", gap: 16 }}>
            <button onClick={onLike} style={{ display: "flex", alignItems: "center", gap: 4,
              color: isLiked ? "#ff3b5c" : "#666", fontSize: 11, fontWeight: 500,
              border: "none", background: "none", cursor: "pointer", padding: 0 }}>
              <HeartIcon filled={isLiked} size={18} /><span>{article.like_count || 0}</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#666", fontSize: 11 }}>
              <CommentIcon size={18} /><span>{article.comment_count || 0}</span>
            </div>
            <button onClick={onShare} style={{ color: "#666", border: "none", background: "none", cursor: "pointer", padding: 0 }}>
              <ShareIcon size={18} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {onToggleSelect && (
              <button onClick={onToggleSelect} style={{
                width: 28, height: 28, borderRadius: 8, cursor: "pointer", padding: 0, transition: "all 0.25s",
                background: isSelected ? "#00E5B8" : "none", border: isSelected ? "none" : "1.5px solid #333",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: isSelected ? "#000" : "#666",
              }}>
                {isSelected ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                )}
              </button>
            )}
            <button onClick={onBookmark} style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
              color: isBookmarked ? "#f59e0b" : "#888", transition: "color 0.2s" }}>
              <BookmarkIcon filled={isBookmarked} size={18} />
            </button>
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: "0 14px 14px" }}>
          <a href={article.gdelt_url} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", width: "100%", padding: 13, borderRadius: 12,
              background: "#00E5B8", textAlign: "center", fontSize: 14, fontWeight: 700,
              color: "#000", textDecoration: "none", cursor: "pointer" }}>
            Read full article →
          </a>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 10 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Tap outside to dismiss</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  FEED VIEW
// ═══════════════════════════════════════════════

function FeedView({ articles, loading, error, searchQuery, likedIds, bookmarkedIds, selectedIds,
  user, onLike, onBookmark, onShare, onToggleSelect, onLongPress, onClearFilters, onRetry }) {
  const hasSelections = selectedIds.size > 0;
  return (
    <div style={{ padding: hasSelections ? "8px 14px 180px" : "8px 14px 110px" }}>

      {searchQuery && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", marginBottom: "12px", borderRadius: "12px",
          background: "rgba(0,229,184,0.08)", border: "1px solid rgba(0,229,184,0.2)",
          animation: "fadeSlide 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#888" }}>Filtering by:</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#00E5B8" }}>{searchQuery}</span>
          </div>
          <button onClick={onClearFilters} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px", color: "#fff", padding: "4px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Clear</button>
        </div>
      )}

      {loading && articles.length === 0 && <SkeletonCards />}

      {error && (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <p style={{ fontSize: "14px", color: "#ff3b5c", fontWeight: 500 }}>{error}</p>
          <button onClick={onRetry} style={{ background: "rgba(0,229,184,0.08)", border: "1px solid rgba(0,229,184,0.2)", color: "#00E5B8", padding: "8px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, marginTop: "12px", cursor: "pointer" }}>Try again</button>
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <SearchIcon size={22} />
          </div>
          <p style={{ fontSize: "15px", color: "#888", fontWeight: 500 }}>No articles match your filters</p>
          <button onClick={onClearFilters} style={{ background: "rgba(0,229,184,0.08)", border: "1px solid rgba(0,229,184,0.2)", color: "#00E5B8", padding: "8px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, marginTop: "12px", cursor: "pointer" }}>Clear filters</button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {articles.map((article, i) => (
          <ArticleCard key={article.id} article={article} index={i} user={user}
            isLiked={likedIds.has(article.id)} isBookmarked={bookmarkedIds.has(article.id)}
            isSelected={selectedIds.has(article.id)} isHero={i === 0}
            onLike={onLike} onBookmark={onBookmark} onShare={onShare}
            onToggleSelect={onToggleSelect} onLongPress={onLongPress}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SKELETON LOADING
// ═══════════════════════════════════════════════

function SkeletonCards() {
  return (
    <div style={{ animation: "fadeIn 0.3s", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Hero skeleton */}
      <div style={{ background: "var(--surface,#131315)", borderRadius: "18px", overflow: "hidden", border: "1px solid var(--border)" }}>
        <div className="skeleton" style={{ width: "100%", height: "240px" }} />
        <div style={{ padding: "14px 18px" }}>
          <div className="skeleton" style={{ width: "100px", height: "12px", marginBottom: "10px", borderRadius: "6px" }} />
          <div className="skeleton" style={{ width: "90%", height: "16px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ width: "60%", height: "16px" }} />
        </div>
      </div>
      {/* Standard skeletons */}
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: "var(--surface,#131315)", borderRadius: "14px", overflow: "hidden",
          border: "1px solid var(--border)", display: "flex", height: "130px" }}>
          <div style={{ flex: 1, padding: "14px 16px" }}>
            <div className="skeleton" style={{ width: "80px", height: "10px", marginBottom: "8px", borderRadius: "6px" }} />
            <div className="skeleton" style={{ width: "100%", height: "14px", marginBottom: "6px" }} />
            <div className="skeleton" style={{ width: "75%", height: "14px", marginBottom: "16px" }} />
            <div className="skeleton" style={{ width: "120px", height: "10px" }} />
          </div>
          <div className="skeleton" style={{ width: "120px", flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  WATCH VIEW (unchanged except bg color)
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

  const topTopics = useMemo(() => {
    const counts = {};
    for (const v of videos) {
      for (const tag of (v.tags || [])) {
        const clean = tag.toLowerCase().trim();
        if (clean.length > 2) counts[clean] = (counts[clean] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count }));
  }, [videos]);

  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (topicFilter && !(v.tags || []).some(t => t.toLowerCase().trim() === topicFilter)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (v.title || "").toLowerCase().includes(q) || (v.description || "").toLowerCase().includes(q) ||
          (v.channel_title || "").toLowerCase().includes(q) || (v.tags || []).some(t => t.toLowerCase().includes(q));
      }
      return true;
    });
  }, [videos, searchQuery, topicFilter]);

  if (selected) {
    return (
      <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease", minHeight: "calc(100vh - 120px)" }}>
        <div style={{ background: "var(--surface,#131315)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ width: "100%", aspectRatio: "16/9", background: "#000" }}>
            <iframe src={`https://www.youtube.com/embed/${selected.youtube_id}?rel=0`} style={{ width: "100%", height: "100%", border: "none" }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={selected.title} />
          </div>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", padding: "3px 8px", borderRadius: 4, background: `${videoTypeColor(selected.video_type)}20`, color: videoTypeColor(selected.video_type), fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{videoTypeLabel(selected.video_type)}</span>
              <span style={{ fontSize: 11, color: "#666", marginLeft: "auto" }}>{relDate(selected.published_at)}</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#eee", margin: "0 0 10px", lineHeight: 1.3 }}>{selected.title}</h3>
            <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#888" }}>▶ {fmtViews(selected.view_count)} views</span>
              <span style={{ fontSize: 12, color: "#888" }}>⏱ {selected.duration}</span>
              {selected.channel_title && <span style={{ fontSize: 12, color: "#00E5B8" }}>{selected.channel_title}</span>}
            </div>
            {selected.tags?.length > 0 && (
              <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
                {selected.tags.slice(0, 8).map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#1a1a1e", color: "#888", border: "1px solid #333" }}>{tag}</span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSelected(null)} style={{ padding: "8px 16px", borderRadius: 10, fontSize: 12, background: "#1a1a1e", color: "#ccc", border: "1px solid #333", cursor: "pointer" }}>← Back</button>
              <a href={`https://www.youtube.com/watch?v=${selected.youtube_id}`} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: "#00E5B8", color: "#000", display: "inline-block", textDecoration: "none" }}>Watch on YouTube ↗</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease", minHeight: "calc(100vh - 120px)" }}>
      <div style={{ marginBottom: 12, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface,#131315)", borderRadius: 14, padding: "0 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <SearchIcon size={16} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search videos by topic, keyword, channel…"
            style={{ flex: 1, background: "none", border: "none", color: "#eee", padding: "11px 0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          {searchQuery && <button onClick={() => setSearchQuery("")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#888", width: 20, height: 20, borderRadius: "50%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>×</button>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
        {["all", "podcast", "video", "short", "panel", "event"].map(t => {
          const isActive = typeFilter === t;
          const c = t === "all" ? "#00E5B8" : videoTypeColor(t);
          return (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: "5px 14px", borderRadius: "20px", whiteSpace: "nowrap", fontSize: 11, fontWeight: 700,
              background: isActive ? `${c}18` : "var(--surface,#131315)", color: isActive ? c : "#888",
              border: `1px solid ${isActive ? c + "40" : "rgba(255,255,255,0.06)"}`, transition: "all 0.2s", cursor: "pointer",
            }}>{t === "all" ? "All" : videoTypeLabel(t)}</button>
          );
        })}
      </div>
      {topTopics.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
          {topicFilter && <button onClick={() => setTopicFilter(null)} style={{ padding: "4px 10px", borderRadius: 14, fontSize: 10, fontWeight: 600, background: "rgba(255,59,92,0.1)", color: "#ff3b5c", border: "1px solid rgba(255,59,92,0.3)", whiteSpace: "nowrap", cursor: "pointer" }}>✕ Clear</button>}
          {topTopics.map(({ tag, count }) => {
            const isActive = topicFilter === tag;
            return <button key={tag} onClick={() => setTopicFilter(isActive ? null : tag)} style={{ padding: "4px 10px", borderRadius: 14, fontSize: 10, fontWeight: 600, background: isActive ? "rgba(0,229,184,0.12)" : "#0a0a0a", color: isActive ? "#00E5B8" : "#777", border: `1px solid ${isActive ? "rgba(0,229,184,0.3)" : "#1a1a1a"}`, whiteSpace: "nowrap", transition: "all 0.2s", cursor: "pointer" }}>{tag} <span style={{ color: "#555", marginLeft: 2 }}>{count}</span></button>;
          })}
        </div>
      )}
      {(searchQuery || topicFilter) && !loading && (
        <div style={{ padding: "0 8px 10px", fontSize: 11, color: "#666" }}>
          {filteredVideos.length} video{filteredVideos.length !== 1 ? "s" : ""} found
          {topicFilter && <span> for <span style={{ color: "#00E5B8" }}>{topicFilter}</span></span>}
          {searchQuery && <span> matching <span style={{ color: "#00E5B8" }}>"{searchQuery}"</span></span>}
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#666", fontSize: 13 }}>Loading videos…</div>
      ) : filteredVideos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontSize: 14, color: "#888" }}>{searchQuery || topicFilter ? "No videos match your search" : "No videos yet — they'll appear once the YouTube fetcher runs"}</p>
          {(searchQuery || topicFilter) && <button onClick={() => { setSearchQuery(""); setTopicFilter(null); }} style={{ background: "rgba(0,229,184,0.08)", border: "1px solid rgba(0,229,184,0.2)", color: "#00E5B8", padding: "8px 20px", borderRadius: 12, fontSize: 13, fontWeight: 600, marginTop: 12, cursor: "pointer" }}>Clear filters</button>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {filteredVideos.map((v, i) => {
            const tc = videoTypeColor(v.video_type);
            const thumbUrl = v.thumbnail_url || (v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg` : null);
            return (
              <div key={v.id} onClick={() => setSelected(v)} style={{
                cursor: "pointer", background: "var(--surface,#131315)", borderRadius: 14, overflow: "hidden",
                border: "1px solid var(--border)", transition: "border-color 0.2s, transform 0.15s",
                animation: `cardIn 0.3s ease ${i * 0.03}s both`,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.transform = "none"; }}
              >
                <div style={{ width: "100%", aspectRatio: "16/9", position: "relative", background: thumbUrl ? `url(${thumbUrl}) center/cover` : "linear-gradient(135deg, #131315, #0a0a0c)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ position: "absolute", top: 6, left: 6, fontSize: 8, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: `${tc}30`, color: tc, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{videoTypeLabel(v.video_type)}</span>
                  {v.duration && <span style={{ position: "absolute", bottom: 6, right: 6, fontSize: 10, fontFamily: "monospace", padding: "2px 6px", borderRadius: 3, background: "rgba(0,0,0,0.8)", color: "#ccc" }}>{v.duration}</span>}
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "1.5px solid rgba(0,229,184,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 0, height: 0, borderLeft: "9px solid #00E5B8", borderTop: "6px solid transparent", borderBottom: "6px solid transparent", marginLeft: 2 }} />
                  </div>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#eee", lineHeight: 1.3, marginBottom: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
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
//  LISTEN VIEW (unchanged except bg/surface)
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

  const handlePlay = useCallback((ep) => {
    if (playing === ep.id) { audioRef.current?.pause(); setPlaying(null); return; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (!ep.audio_url) { if (ep.link) window.open(ep.link, "_blank"); return; }
    const audio = new Audio(ep.audio_url);
    audioRef.current = audio;
    setPlaying(ep.id); setProgress(0); setDuration(0);
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
    audio.addEventListener("timeupdate", () => { if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100); });
    audio.addEventListener("ended", () => { setPlaying(null); setProgress(0); });
    audio.addEventListener("error", () => { setPlaying(null); if (ep.link) window.open(ep.link, "_blank"); });
    audio.play().catch(() => { setPlaying(null); if (ep.link) window.open(ep.link, "_blank"); });
  }, [playing]);

  useEffect(() => { return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } }; }, []);

  const filteredEpisodes = useMemo(() => {
    if (!searchQuery) return episodes;
    const q = searchQuery.toLowerCase();
    return episodes.filter(ep => (ep.title || "").toLowerCase().includes(q) || (ep.guest_name || "").toLowerCase().includes(q) ||
      (ep.description || "").toLowerCase().includes(q) || (ep.sources?.name || "").toLowerCase().includes(q));
  }, [episodes, searchQuery]);

  const fmtTime = (s) => { if (!s || isNaN(s)) return "0:00"; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec < 10 ? "0" : ""}${sec}`; };

  return (
    <div style={{ padding: "16px 12px 120px", animation: "fadeSlide 0.3s ease", minHeight: "calc(100vh - 120px)" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 16px", background: "var(--surface,#131315)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, rgba(0,229,184,0.1), rgba(0,180,216,0.1))", border: "1px solid rgba(0,229,184,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/tic-head.png" alt="TIC" style={{ width: 34, height: 34, objectFit: "contain" }} />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 2px" }}>TIC Podcast Network</h2>
          <div style={{ fontSize: 12, color: "#888" }}>{sources.length} shows · {episodes.length} episodes</div>
        </div>
      </div>

      {(!sourceFilter || sources.find(s => s.id === sourceFilter)?.name === "Talent Intelligence Collective Podcast") && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center" }}>
          {[{ label: "Spotify", url: "https://open.spotify.com/show/0ozE6GkCJjD6nrurugtHNh" }, { label: "Apple", url: "https://podcasts.apple.com/us/podcast/talent-intelligence-collective-podcast/id1533634924" }, { label: "YouTube", url: "https://www.youtube.com/@talentintelligencecollective" }].map(p => (
            <a key={p.label} href={p.url} target="_blank" rel="noopener noreferrer" style={{ padding: "5px 12px", borderRadius: 16, fontSize: 10, fontWeight: 600, background: "var(--surface,#131315)", color: "#888", border: "1px solid var(--border)", transition: "all 0.2s", textDecoration: "none" }}
              onMouseEnter={e => { e.target.style.borderColor = "#00E5B8"; e.target.style.color = "#00E5B8"; }}
              onMouseLeave={e => { e.target.style.borderColor = ""; e.target.style.color = "#888"; }}>{p.label} ↗</a>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 12, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface,#131315)", borderRadius: 14, padding: "0 14px", border: "1px solid var(--border)" }}>
          <SearchIcon size={16} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search episodes, guests, topics…"
            style={{ flex: 1, background: "none", border: "none", color: "#eee", padding: "11px 0", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          {searchQuery && <button onClick={() => setSearchQuery("")} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#888", width: 20, height: 20, borderRadius: "50%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>×</button>}
        </div>
      </div>

      {sources.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none", padding: "0 4px" }}>
          <button onClick={() => setSourceFilter(null)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: !sourceFilter ? "rgba(0,229,160,0.12)" : "var(--surface,#131315)", color: !sourceFilter ? "#00E5B8" : "#888", border: `1px solid ${!sourceFilter ? "rgba(0,229,160,0.3)" : "var(--border)"}`, whiteSpace: "nowrap", cursor: "pointer" }}>All Shows</button>
          {sources.map(s => {
            const isActive = sourceFilter === s.id;
            return <button key={s.id} onClick={() => setSourceFilter(isActive ? null : s.id)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: isActive ? "rgba(0,229,160,0.12)" : "var(--surface,#131315)", color: isActive ? "#00E5B8" : "#888", border: `1px solid ${isActive ? "rgba(0,229,160,0.3)" : "var(--border)"}`, whiteSpace: "nowrap", cursor: "pointer" }}>{s.name.length > 20 ? s.name.substring(0, 18) + "…" : s.name}</button>;
          })}
        </div>
      )}

      {playing && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--surface,#131315)", borderRadius: 12, border: "1px solid #00E5B8", animation: "fadeSlide 0.2s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button onClick={() => { audioRef.current?.pause(); setPlaying(null); setProgress(0); }} style={{ width: 28, height: 28, borderRadius: "50%", background: "#00E5B8", border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 2 }}><div style={{ width: 2.5, height: 10, background: "#000", borderRadius: 1 }} /><div style={{ width: 2.5, height: 10, background: "#000", borderRadius: 1 }} /></div>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#eee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{episodes.find(e => e.id === playing)?.title || "Playing…"}</div>
              <div style={{ fontSize: 10, color: "#666" }}>{fmtTime(duration * progress / 100)} / {fmtTime(duration)}</div>
            </div>
          </div>
          <div style={{ height: 3, background: "#222", borderRadius: 2, overflow: "hidden", cursor: "pointer" }}
            onClick={(e) => { if (!audioRef.current || !duration) return; const rect = e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration; }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#00E5B8", borderRadius: 2, transition: "width 0.3s linear" }} />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 50, color: "#666", fontSize: 13 }}>Loading episodes…</div>
      ) : filteredEpisodes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontSize: 14, color: "#888" }}>{searchQuery ? "No episodes match your search" : "No episodes yet"}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredEpisodes.map((ep, i) => {
            const isPlay = playing === ep.id;
            const isExp = expanded === ep.id;
            const hasAudio = !!ep.audio_url;
            return (
              <div key={ep.id} style={{ background: "var(--surface,#131315)", borderRadius: 14, overflow: "hidden", border: `1px solid ${isPlay ? "#00E5B8" : "var(--border)"}`, transition: "border-color 0.3s", animation: `cardIn 0.3s ease ${i * 0.03}s both` }}>
                {isPlay && <div style={{ height: 2, background: "#222" }}><div style={{ height: "100%", width: `${progress}%`, background: "#00E5B8", transition: "width 0.3s linear" }} /></div>}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <button onClick={() => handlePlay(ep)} title={hasAudio ? (isPlay ? "Pause" : "Play") : "Open episode"} style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: isPlay ? "#00E5B8" : "#1a1a1e", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", marginTop: 2, border: "none", cursor: "pointer" }}>
                      {isPlay ? (
                        <div style={{ display: "flex", gap: 3 }}><div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} /><div style={{ width: 3, height: 14, background: "#000", borderRadius: 1 }} /></div>
                      ) : (
                        <div style={{ width: 0, height: 0, borderLeft: `10px solid ${hasAudio ? "#eee" : "#666"}`, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", marginLeft: 2 }} />
                      )}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#00E5B8", fontFamily: "monospace" }}>{ep.sources?.name || "Podcast"}</span>
                        <span style={{ fontSize: 10, color: "#666" }}>{relDate(ep.published_at)}</span>
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: "#eee", margin: "0 0 5px", lineHeight: 1.3 }}>{ep.title}</h4>
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
                        {!hasAudio && ep.link && <a href={ep.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#00E5B8", textDecoration: "none" }}>Open ↗</a>}
                        <button onClick={() => setExpanded(isExp ? null : ep.id)} style={{ fontSize: 11, color: "#00E5B8", marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>{isExp ? "Less ↑" : "More ↓"}</button>
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
//  DISCOVER + SAVED + BOTTOM NAV
// ═══════════════════════════════════════════════

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
        if (!cancelled && data.ok) setSubstackArticles(dedupe(data.articles || []));
        else if (!cancelled) setError("Couldn't load TIC content");
      } catch { if (!cancelled) setError("Couldn't connect to TIC feed"); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (iso) => { if (!iso) return ""; return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };

  return (
    <div style={{ padding: "24px 16px 120px", animation: "fadeSlide 0.3s ease" }}>
      <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>TIC Digest</h2>
      <p style={{ fontSize: "13px", color: "#888", margin: "0 0 24px" }}>Articles and insights from the Talent Intelligence Collective</p>

      {loading && <div style={{ padding: "40px 0", textAlign: "center" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00E5B8", margin: "0 auto", animation: "pulseDot 1.5s ease infinite" }} /><p style={{ fontSize: "13px", color: "#666", marginTop: "12px" }}>Loading TIC content...</p></div>}
      {error && <div style={{ padding: "20px", borderRadius: "14px", background: "var(--surface,#131315)", border: "1px solid #333", textAlign: "center" }}><p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{error}</p></div>}
      {!loading && !error && substackArticles.map((article, i) => (
        <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" style={{
          display: "block", textDecoration: "none", marginBottom: "10px", padding: "14px 16px",
          background: "var(--surface,#131315)", borderRadius: "14px", border: "1px solid var(--border)",
          transition: "border-color 0.2s", animation: `cardIn 0.3s ease ${i * 0.03}s both`,
        }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#333"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = ""}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#00E5B8", letterSpacing: "1px" }}>TIC</span>
            {article.publishedAt && <><span style={{ color: "#333" }}>·</span><span style={{ fontSize: "11px", color: "#666" }}>{formatDate(article.publishedAt)}</span></>}
          </div>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#eee", margin: "0 0 4px", lineHeight: 1.3 }}>{decode(article.title)}</h3>
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
    <div style={{ padding: "24px 14px 120px", animation: "fadeSlide 0.3s ease" }}>
      <div style={{ padding: "0 4px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>Saved</h2>
        <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{savedArticles.length} article{savedArticles.length !== 1 ? "s" : ""} bookmarked</p>
      </div>
      {savedArticles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
            <BookmarkIcon filled={false} size={22} />
          </div>
          <p style={{ color: "#888", fontSize: "14px" }}>Bookmark articles to save them here</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {savedArticles.map((article, i) => (
            <ArticleCard key={article.id} article={article} index={i} user={user}
              isLiked={likedIds.has(article.id)} isBookmarked={bookmarkedIds.has(article.id)}
              onLike={onLike} onBookmark={onBookmark} onShare={onShare} />
          ))}
        </div>
      )}
    </div>
  );
}

function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "feed", label: "Feed", path: "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16", extra: <circle cx="5" cy="19" r="1" fill="currentColor" /> },
    { id: "watch", label: "Watch", path: "M5 3L19 12L5 21Z" },
    { id: "listen", label: "Listen", path: "M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" },
    { id: "discover", label: "TIC", path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" },
    { id: "saved", label: "Saved", path: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" },
  ];

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: "480px", zIndex: 100,
      background: "rgba(10,10,12,0.94)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      borderTop: "1px solid var(--border, rgba(255,255,255,0.06))",
      display: "flex", justifyContent: "space-around",
      padding: "8px 0 env(safe-area-inset-bottom, 22px)",
    }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} aria-label={tab.label}
            style={{ background: "none", border: "none", display: "flex", flexDirection: "column",
              alignItems: "center", gap: "3px", color: isActive ? "#00E5B8" : "#555",
              transition: "color 0.2s", padding: "6px 10px", position: "relative", cursor: "pointer" }}>
            {isActive && <div style={{ position: "absolute", top: "-8px", left: "50%", transform: "translateX(-50%)",
              width: "20px", height: "2px", borderRadius: "1px", background: "#00E5B8" }} />}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.path} />{tab.extra}
            </svg>
            <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.3px" }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

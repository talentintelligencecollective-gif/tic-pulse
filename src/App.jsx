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

// ═══════════════════════════════════════════════
//  APP (auth wrapper)
// ═══════════════════════════════════════════════

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => setSession(s)
    );

    return () => subscription.unsubscribe();
  }, []);

  // Loading state while checking auth
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

  // Not logged in — show auth page
  if (!session) {
    return <AuthPage onAuth={(s) => setSession(s)} />;
  }

  // Logged in — show the feed
  return <PulseApp session={session} />;
}

// ═══════════════════════════════════════════════
//  PULSE APP (main feed, shown after login)
// ═══════════════════════════════════════════════

function PulseApp({ session }) {
  // ─── State ───
  const [articles, setArticles] = useState([]);  // Full unfiltered set
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("feed");
  const [shareTarget, setShareTarget] = useState(null);
  const [toast, setToast] = useState({ msg: "", show: false });

  // Newsletter curation (always-on selection)
  const [selectedIds, setSelectedIds] = useState([]); // ordered array to preserve selection order
  const [showNewsletter, setShowNewsletter] = useState(false);

  // Engagement state (localStorage, Phase 1 — moves to Supabase in Phase 2 with auth)
  const [likedIds, setLikedIds] = useState(() => loadSet(STORAGE_KEY_LIKES));
  const [bookmarkedIds, setBookmarkedIds] = useState(() => loadSet(STORAGE_KEY_BOOKMARKS));

  // Ref for likedIds — avoids stale closure in useCallback handlers
  const likedIdsRef = useRef(likedIds);
  useEffect(() => { likedIdsRef.current = likedIds; }, [likedIds]);

  const searchInputRef = useRef(null);

  // ─── Data Loading (always fetch full set, filter client-side) ───

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

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  // ─── Client-side filtering (avoids hammering Supabase on every keystroke) ───

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

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // ─── Toast ───

  const showToast = useCallback((msg) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 2200);
  }, []);

  // ─── Engagement Handlers ───

  const handleLike = useCallback(
    (articleId) => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        const wasLiked = next.has(articleId);

        if (wasLiked) {
          next.delete(articleId);
          incrementEngagement(articleId, "like_count", -1);
        } else {
          next.add(articleId);
          incrementEngagement(articleId, "like_count", 1);
        }

        saveSet(STORAGE_KEY_LIKES, next);
        return next;
      });

      // Optimistic UI: update local article count immediately
      const wasLiked = likedIdsRef.current.has(articleId);
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== articleId) return a;
          return { ...a, like_count: a.like_count + (wasLiked ? -1 : 1) };
        })
      );
    },
    []
  );

  const handleBookmark = useCallback(
    (articleId) => {
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        const wasBookmarked = next.has(articleId);

        if (wasBookmarked) {
          next.delete(articleId);
        } else {
          next.add(articleId);
          showToast("Saved to bookmarks");
        }

        saveSet(STORAGE_KEY_BOOKMARKS, next);
        return next;
      });
    },
    [showToast]
  );

  const handleShare = useCallback(
    (article) => {
      setShareTarget(article);
      incrementEngagement(article.id, "share_count", 1);
    },
    []
  );

  // ─── Curate Mode ───

  const handleToggleSelect = useCallback((articleId) => {
    setSelectedIds((prev) => {
      if (prev.includes(articleId)) {
        return prev.filter((id) => id !== articleId);
      }
      return [...prev, articleId];
    });
  }, []);

  const handleOpenNewsletter = useCallback(() => {
    if (selectedIds.length === 0) return;
    setShowNewsletter(true);
  }, [selectedIds]);

  // Get selected articles in selection order (preserves user's curation order)
  const selectedArticles = useMemo(() => {
    const articleMap = new Map(articles.map((a) => [a.id, a]));
    return selectedIds.map((id) => articleMap.get(id)).filter(Boolean);
  }, [articles, selectedIds]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ─── Render ───

  return (
    <div
      style={{
        minHeight: "100dvh",
        maxWidth: "480px",
        margin: "0 auto",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "fixed",
          top: "-120px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,229,160,0.03) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ═══ HEADER ═══ */}
      <Header
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        activeCategory={activeCategory}
        searchInputRef={searchInputRef}
        user={session?.user}
        onLogout={async () => { await supabase.auth.signOut(); }}
        onToggleSearch={() => {
          setSearchOpen(!searchOpen);
          if (searchOpen) setSearchQuery("");
        }}
        onSearchChange={setSearchQuery}
        onCategoryChange={(cat) => setActiveCategory(cat)}
      />

      {/* ═══ CONTENT ═══ */}
      <main style={{ position: "relative", zIndex: 1 }}>
        {activeTab === "feed" && (
          <FeedView
            articles={filteredArticles}
            loading={loading}
            error={error}
            likedIds={likedIds}
            bookmarkedIds={bookmarkedIds}
            selectedIds={selectedIdSet}
            onLike={handleLike}
            onBookmark={handleBookmark}
            onShare={handleShare}
            onToggleSelect={handleToggleSelect}
            onClearFilters={() => {
              setActiveCategory("All");
              setSearchQuery("");
            }}
            onSearchTag={(tag) => {
              setSearchQuery(tag);
              setSearchOpen(true);
            }}
            onRetry={loadArticles}
          />
        )}

        {activeTab === "discover" && <DiscoverView />}

        {activeTab === "saved" && (
          <SavedView
            articles={articles}
            likedIds={likedIds}
            bookmarkedIds={bookmarkedIds}
            onLike={handleLike}
            onBookmark={handleBookmark}
            onShare={handleShare}
          />
        )}

        {activeTab === "community" && <CommunityView />}
      </main>

      {/* ═══ BOTTOM NAV ═══ */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ═══ CURATE SELECTION BAR (appears when articles are selected) ═══ */}
      {selectedIds.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "72px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100% - 24px)",
            maxWidth: "456px",
            zIndex: 150,
            animation: "fadeSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div
            style={{
              background: "#1a1a1e",
              borderRadius: "18px",
              border: "1px solid #333",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            }}
          >
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                {selectedIds.length} article{selectedIds.length !== 1 ? "s" : ""} selected
              </div>
              <div style={{ fontSize: "11px", color: "#999", marginTop: "1px" }}>
                Ready to build your briefing
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setSelectedIds([])}
                style={{
                  background: "none",
                  border: "1px solid #444",
                  borderRadius: "12px",
                  color: "#ccc",
                  padding: "10px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                Clear
              </button>
              <button
                onClick={handleOpenNewsletter}
                style={{
                  background: "#00e5a0",
                  border: "none",
                  borderRadius: "12px",
                  color: "#000",
                  padding: "10px 18px",
                  fontSize: "13px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
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

      {/* ═══ NEWSLETTER BUILDER ═══ */}
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
//  HEADER
// ═══════════════════════════════════════════════

function Header({ searchOpen, searchQuery, activeCategory, searchInputRef, user, onLogout, onToggleSearch, onSearchChange, onCategoryChange }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "?").toUpperCase();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--bg-glass)",
        backdropFilter: "blur(24px) saturate(1.8)",
        WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Top Row */}
      <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* TIC Head Logo */}
          <img src="/tic-head.png" alt="TIC" style={{ width: "34px", height: "34px", objectFit: "contain" }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  color: "#fff",
                  letterSpacing: "-0.5px",
                  animation: "textPulse 4s ease-in-out infinite",
                }}
              >
                Pulse
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 7px",
                  borderRadius: "6px",
                  background: "var(--accent-muted)",
                  border: "1px solid rgba(0,229,160,0.15)",
                }}
              >
                <div
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "var(--accent)",
                    animation: "liveDot 2s ease infinite",
                  }}
                />
                <span style={{ fontSize: "9px", fontWeight: 800, color: "var(--accent)", letterSpacing: "1px" }}>
                  LIVE
                </span>
              </div>
            </div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "2px", marginTop: "-1px" }}>
              TALENT INTELLIGENCE COLLECTIVE
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={onToggleSearch}
            aria-label={searchOpen ? "Close search" : "Open search"}
            style={{
              background: searchOpen ? "var(--accent-muted)" : "none",
              border: "none",
              color: searchOpen ? "var(--accent)" : "var(--text-muted)",
              padding: "8px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              transition: "all 0.2s",
            }}
          >
            {searchOpen ? <CloseIcon size={18} /> : <SearchIcon />}
          </button>
          <button
            aria-label="Notifications"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              padding: "8px",
              borderRadius: "12px",
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <BellIcon />
            <div
              style={{
                position: "absolute",
                top: "5px",
                right: "5px",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "var(--red)",
                border: "2px solid var(--bg)",
              }}
            />
          </button>
          {/* User avatar */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="Account menu"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #00e5a0, #00b4d8)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 800,
                color: "#000",
                cursor: "pointer",
                marginLeft: "2px",
              }}
            >
              {userInitials}
            </button>
            {showUserMenu && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 200 }}
                  onClick={() => setShowUserMenu(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "40px",
                    right: 0,
                    background: "#1a1a1e",
                    border: "1px solid var(--border-hover)",
                    borderRadius: "14px",
                    padding: "8px",
                    minWidth: "180px",
                    zIndex: 201,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    animation: "fadeSlide 0.15s ease",
                  }}
                >
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {user?.user_metadata?.full_name || "User"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {user?.email}
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); onLogout(); }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: "none",
                      border: "none",
                      borderRadius: "8px",
                      color: "var(--red)",
                      fontSize: "13px",
                      fontWeight: 600,
                      textAlign: "left",
                      cursor: "pointer",
                      marginTop: "4px",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,59,92,0.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div style={{ padding: "10px 16px 0", animation: "fadeSlide 0.2s ease" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius-md)",
              padding: "0 14px",
              border: "1px solid var(--border)",
            }}
          >
            <SearchIcon size={16} />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search articles, topics, tags..."
              style={{
                flex: 1,
                background: "none",
                border: "none",
                color: "#eee",
                padding: "11px 0",
                fontSize: "14px",
                outline: "none",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#888",
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Category Scroller */}
      <div
        style={{
          display: "flex",
          gap: "7px",
          padding: "12px 16px 12px",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat;
          const color = cat === "All" ? "var(--accent)" : (CAT_COLORS[cat] || "var(--accent)");
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              style={{
                padding: "5px 14px",
                borderRadius: "var(--radius-pill)",
                whiteSpace: "nowrap",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.3px",
                border: isActive ? `1px solid ${typeof color === "string" && color.startsWith("#") ? color + "40" : "var(--accent-border)"}` : "1px solid var(--border)",
                background: isActive ? (typeof color === "string" && color.startsWith("#") ? color + "12" : "var(--accent-muted)") : "var(--bg-card)",
                color: isActive ? color : "var(--text-muted)",
                transition: "all 0.25s ease",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════
//  FEED VIEW
// ═══════════════════════════════════════════════

function FeedView({ articles, loading, error, likedIds, bookmarkedIds, selectedIds, onLike, onBookmark, onShare, onToggleSelect, onClearFilters, onSearchTag, onRetry }) {
  const hasSelections = selectedIds.size > 0;
  return (
    <div style={{ padding: hasSelections ? "12px 12px 180px" : "12px 12px 110px" }}>
      {/* Trending Ticker */}
      <TrendingTicker onTagClick={onSearchTag} />

      {/* Loading */}
      {loading && articles.length === 0 && <SkeletonCards />}

      {/* Error */}
      {error && (
        <div style={{ textAlign: "center", padding: "48px 20px", animation: "fadeIn 0.3s" }}>
          <p style={{ fontSize: "14px", color: "var(--red)", fontWeight: 500 }}>{error}</p>
          <button
            onClick={onRetry}
            style={{
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              padding: "8px 20px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 600,
              marginTop: "12px",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Articles */}
      {!loading && !error && articles.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeIn 0.3s" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px", opacity: 0.5 }}>🔍</div>
          <p style={{ fontSize: "15px", color: "var(--text-muted)", fontWeight: 500 }}>No articles match your filters</p>
          <button
            onClick={onClearFilters}
            style={{
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              padding: "8px 20px",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 600,
              marginTop: "12px",
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {articles.map((article, i) => (
        <ArticleCard
          key={article.id}
          article={article}
          index={i}
          isLiked={likedIds.has(article.id)}
          isBookmarked={bookmarkedIds.has(article.id)}
          isSelected={selectedIds.has(article.id)}
          onLike={onLike}
          onBookmark={onBookmark}
          onShare={onShare}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  TRENDING TICKER
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        marginBottom: "14px",
        background: "rgba(255,255,255,0.015)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-subtle)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--accent)", flexShrink: 0 }}>
        <TrendingIcon />
        <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "1.2px" }}>TRENDING</span>
      </div>
      <div style={{ width: "1px", height: "14px", background: "var(--border)", flexShrink: 0 }} />
      {TRENDING_TAGS.map((t) => (
        <button
          key={t.tag}
          onClick={() => onTagClick(t.tag.slice(1))}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "11px",
            fontWeight: 600,
            whiteSpace: "nowrap",
            padding: "3px 6px",
            borderRadius: "6px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent)";
            e.currentTarget.style.background = "var(--accent-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.background = "none";
          }}
        >
          {t.tag}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SKELETON LOADING
// ═══════════════════════════════════════════════

function SkeletonCards() {
  return (
    <div style={{ animation: "fadeIn 0.3s" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
            marginBottom: "16px",
            border: "1px solid var(--border)",
          }}
        >
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
//  DISCOVER VIEW
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
        if (!cancelled && data.ok) {
          setSubstackArticles(data.articles || []);
        } else if (!cancelled) {
          setError("Couldn't load TIC content");
        }
      } catch {
        if (!cancelled) setError("Couldn't connect to TIC feed");
      } finally {
        if (!cancelled) setLoading(false);
      }
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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <img src="/tic-head.png" alt="" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: 0, fontFamily: "Georgia, serif" }}>
          TIC Digest
        </h2>
      </div>
      <p style={{ fontSize: "13px", color: "#888", margin: "0 0 24px" }}>
        Articles and insights from the Talent Intelligence Collective
      </p>

      {/* Loading */}
      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%", background: "#00e5a0",
            margin: "0 auto", animation: "liveDot 1.5s ease infinite",
          }} />
          <p style={{ fontSize: "13px", color: "#666", marginTop: "12px" }}>Loading TIC content...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: "20px", borderRadius: "14px", background: "#111", border: "1px solid #333",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>{error}</p>
          <a href="https://talentintelligencecollective.substack.com" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#00e5a0", marginTop: "8px", display: "inline-block" }}>
            Visit TIC Substack directly →
          </a>
        </div>
      )}

      {/* Articles */}
      {!loading && !error && substackArticles.map((article, i) => (
        <a
          key={article.url}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block", textDecoration: "none", marginBottom: "16px",
            background: "#0a0a0a", borderRadius: "16px", border: "1px solid #1a1a1a",
            overflow: "hidden", transition: "border-color 0.2s",
            animation: `cardIn 0.4s ease ${i * 0.05}s both`,
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#333"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1a1a1a"}
        >
          {/* Cover image */}
          {article.image && (
            <div style={{
              width: "100%", height: "180px",
              backgroundImage: `url(${article.image})`,
              backgroundSize: "cover", backgroundPosition: "center",
              backgroundColor: "#111",
            }} />
          )}
          {/* Content */}
          <div style={{ padding: "16px 18px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{
                fontSize: "10px", fontWeight: 700, color: "#00e5a0",
                letterSpacing: "1.5px", textTransform: "uppercase",
              }}>TIC Digest</span>
              {article.publishedAt && (
                <>
                  <span style={{ color: "#333" }}>·</span>
                  <span style={{ fontSize: "11px", color: "#666" }}>{formatDate(article.publishedAt)}</span>
                </>
              )}
            </div>
            <h3 style={{
              fontSize: "17px", fontWeight: 700, color: "#eee", margin: "0 0 8px",
              lineHeight: 1.3, fontFamily: "Georgia, serif",
            }}>{article.title}</h3>
            {article.description && (
              <p style={{
                fontSize: "13px", lineHeight: 1.6, color: "#888", margin: 0,
                overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              }}>{article.description}</p>
            )}
            <div style={{
              marginTop: "12px", fontSize: "12px", fontWeight: 600, color: "#00e5a0",
            }}>Read on Substack →</div>
          </div>
        </a>
      ))}

      {/* Footer link */}
      {!loading && !error && (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <a href="https://talentintelligencecollective.substack.com" target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: "13px", color: "#888", textDecoration: "none",
              padding: "10px 20px", borderRadius: "12px", border: "1px solid #333",
              display: "inline-block", transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#00e5a0"; e.currentTarget.style.borderColor = "#00e5a0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#888"; e.currentTarget.style.borderColor = "#333"; }}
          >
            Subscribe to TIC on Substack
          </a>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  SAVED VIEW
// ═══════════════════════════════════════════════

function SavedView({ articles, likedIds, bookmarkedIds, onLike, onBookmark, onShare }) {
  // Filter from full unfiltered article set — not affected by category/search filters
  const savedArticles = articles.filter((a) => bookmarkedIds.has(a.id));

  return (
    <div style={{ padding: "24px 12px 120px", animation: "fadeSlide 0.3s ease" }}>
      <div style={{ padding: "0 4px", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: "0 0 6px", fontFamily: "var(--font-display)" }}>
          Saved
        </h2>
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
          <ArticleCard
            key={article.id}
            article={article}
            index={i}
            isLiked={likedIds.has(article.id)}
            isBookmarked={bookmarkedIds.has(article.id)}
            onLike={onLike}
            onBookmark={onBookmark}
            onShare={onShare}
          />
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  COMMUNITY VIEW (Phase 2 placeholder)
// ═══════════════════════════════════════════════

function CommunityView() {
  return (
    <div style={{ padding: "24px 16px 120px", animation: "fadeSlide 0.3s ease" }}>
      <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", margin: "0 0 6px", fontFamily: "var(--font-display)" }}>
        Community
      </h2>
      <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 32px" }}>
        Connect with talent intelligence professionals
      </p>
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          border: "1px dashed var(--border-hover)",
        }}
      >
        <img src="/tic-logo-full.png" alt="TIC" style={{ width: "100px", opacity: 0.5, marginBottom: "16px" }} />
        <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-muted)", margin: "0 0 4px" }}>Coming in Phase 2</p>
        <p style={{ fontSize: "13px", color: "var(--text-faint)", margin: 0 }}>
          User profiles, direct messaging, and community features
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  BOTTOM NAV
// ═══════════════════════════════════════════════

function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "feed", label: "Feed", Icon: FeedIcon },
    { id: "discover", label: "TIC", Icon: DiscoverIcon },
    { id: "saved", label: "Saved", Icon: () => <BookmarkIcon filled={false} size={22} /> },
    { id: "community", label: "Community", Icon: PeopleIcon },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: "480px",
        zIndex: 100,
        background: "var(--bg-glass)",
        backdropFilter: "blur(24px) saturate(1.8)",
        WebkitBackdropFilter: "blur(24px) saturate(1.8)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-around",
        padding: "8px 0 env(safe-area-inset-bottom, 20px)",
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
            style={{
              background: "none",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
              color: isActive ? "var(--accent)" : "var(--text-faint)",
              transition: "color 0.2s",
              padding: "6px 12px",
              position: "relative",
            }}
          >
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  top: "-8px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "20px",
                  height: "2px",
                  borderRadius: "1px",
                  background: "var(--accent)",
                }}
              />
            )}
            <tab.Icon size={22} />
            <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.5px" }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

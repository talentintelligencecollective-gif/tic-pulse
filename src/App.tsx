import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Article } from "./schemas/article";
import { FEED_FRESHNESS_DAYS, DEFAULT_FEED_LIMIT } from "./constants/feed";
import { supabase, fetchArticles, incrementEngagement, updateStreak, incrementStreakCounter, getStreakTier, fetchUserProfile, updateUserProfile } from "./supabase";
import SettingsPage from "./SettingsPage";
import AuthPage from "./AuthPage";
import ArticleCard from "./ArticleCard";
import ShareSheet from "./ShareSheet";
import NewsletterBuilder from "./NewsletterBuilder";
import AudioBriefing from "./AudioBriefing";
import Toast from "./Toast";
import {
  SearchIcon, CloseIcon, BookmarkIcon,
  FeedIcon, DiscoverIcon, PeopleIcon, NewsletterIcon,
} from "./Icons";
import { WatchView } from "./views/WatchView";
import { ListenView } from "./views/ListenView";

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

// ═══════════════════════════════════════════════
//  APP (auth wrapper)
// ═══════════════════════════════════════════════

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
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

  if (!session) return <AuthPage onAuth={(s: Session) => setSession(s)} />;
  return <PulseApp session={session} />;
}

// ═══════════════════════════════════════════════
//  PULSE APP — Phase 2: server-side engagement
// ═══════════════════════════════════════════════

function PulseApp({ session }: { session: Session }) {
  const userId = session.user.id;

  // ─── State ───
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("feed");
  const [shareTarget, setShareTarget] = useState(null);
  const [toast, setToast] = useState({ msg: "", show: false });

  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [selectedEpisodes, setSelectedEpisodes] = useState([]);
  const [showNewsletter, setShowNewsletter] = useState(false);
  const [showAudioBriefing, setShowAudioBriefing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Streak state
  const [streakData, setStreakData] = useState(null);

  // Server-side engagement (replaces localStorage)
  const [likedIds, setLikedIds] = useState(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [engagementLoaded, setEngagementLoaded] = useState(false);

  const likedIdsRef = useRef(likedIds);
  useEffect(() => { likedIdsRef.current = likedIds; }, [likedIds]);

  const searchInputRef = useRef(null);

  // ─── Update streak on mount ───
  useEffect(() => {
    if (!userId) return;
    updateStreak(userId).then((data) => { if (data) setStreakData(data); });
  }, [userId]);

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

  // ─── Data Loading ───
  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchArticles({ limit: DEFAULT_FEED_LIMIT });
      setArticles(data);
    } catch (err) {
      console.error("Failed to load articles:", err);
      setError("Failed to load articles. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  // ─── Client-side filtering (freshness window, uses created_at) ───
  const filteredArticles = useMemo(() => {
    const freshnessCutoff = Date.now() - FEED_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
    return articles
      .filter((a) => {
        const articleDate = new Date(a.created_at || a.published_at).getTime();
        if (articleDate < freshnessCutoff) return false;
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
      })
      .sort(
        (a, b) =>
          new Date(b.published_at ?? b.created_at ?? 0).getTime() -
          new Date(a.published_at ?? a.created_at ?? 0).getTime()
      );
  }, [articles, activeCategory, searchQuery]);

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

    setLikedIds((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(articleId) : next.add(articleId);
      return next;
    });
    setArticles((prev) => prev.map((a) => {
      if (a.id !== articleId) return a;
      return { ...a, like_count: (a.like_count || 0) + (wasLiked ? -1 : 1) };
    }));

    incrementEngagement(articleId, "like_count", wasLiked ? -1 : 1);
    if (!wasLiked) incrementStreakCounter(userId, "total_likes", 1);
    else incrementStreakCounter(userId, "total_likes", -1);
    supabase.from("user_engagement").upsert({
      user_id: userId,
      article_id: articleId,
      liked: !wasLiked,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,article_id" }).then(({ error }) => {
      if (error) console.error("Like sync error:", error);
    });
  }, [userId]);

  // ─── Server-side Bookmark Handler ───
  const handleBookmark = useCallback((articleId) => {
    const wasBookmarked = bookmarkedIds.has(articleId);

    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      wasBookmarked ? next.delete(articleId) : next.add(articleId);
      return next;
    });

    if (!wasBookmarked) {
      showToast("Saved to bookmarks");
      incrementStreakCounter(userId, "total_bookmarks", 1);
    } else {
      incrementStreakCounter(userId, "total_bookmarks", -1);
    }

    supabase.from("user_engagement").upsert({
      user_id: userId,
      article_id: articleId,
      bookmarked: !wasBookmarked,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,article_id" }).then(({ error }) => {
      if (error) console.error("Bookmark sync error:", error);
    });
  }, [userId, bookmarkedIds, showToast]);

  const handleShare = useCallback((article) => {
    setShareTarget(article);
    incrementEngagement(article.id, "share_count", 1);
    incrementStreakCounter(userId, "total_shares", 1);
  }, [userId]);

  // ─── Curate Mode ───
  const handleToggleSelect = useCallback((articleId) => {
    setSelectedIds((prev) => {
      if (prev.includes(articleId)) return prev.filter((id) => id !== articleId);
      return [...prev, articleId];
    });
  }, []);

  const handleOpenNewsletter = useCallback(() => {
    if (selectedIds.length === 0 && selectedVideos.length === 0 && selectedEpisodes.length === 0) return;
    setShowNewsletter(true);
  }, [selectedIds, selectedVideos, selectedEpisodes]);

  const selectedArticles = useMemo(() => {
    const articleMap = new Map(articles.map((a) => [a.id, a]));
    return selectedIds.map((id) => articleMap.get(id)).filter(Boolean);
  }, [articles, selectedIds]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const totalSelected = selectedIds.length + selectedVideos.length + selectedEpisodes.length;

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
        streakData={streakData}
        onLogout={async () => { await supabase.auth.signOut(); }}
        onToggleSearch={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}
        onSearchChange={setSearchQuery}
        onCategoryChange={(cat) => { setActiveCategory(cat); setSearchQuery(""); setSearchOpen(false); }}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main style={{ position: "relative", zIndex: 1 }}>
        {activeTab === "feed" && (
          <FeedView
            articles={filteredArticles} loading={loading} error={error} searchQuery={searchQuery}
            likedIds={likedIds} bookmarkedIds={bookmarkedIds} selectedIds={selectedIdSet}
            user={session?.user}
            onLike={handleLike} onBookmark={handleBookmark} onShare={handleShare}
            onToggleSelect={handleToggleSelect}
            onClearFilters={() => { setActiveCategory("All"); setSearchQuery(""); setSearchOpen(false); }}
            onSearchTag={(tag) => { setSearchQuery(tag); setSearchOpen(true); }}
            onRetry={loadArticles}
          />
        )}
        {activeTab === "watch" && <WatchView selectedVideos={selectedVideos} onToggleVideo={setSelectedVideos} />}
        {activeTab === "listen" && <ListenView selectedEpisodes={selectedEpisodes} onToggleEpisode={setSelectedEpisodes} />}
        {activeTab === "discover" && <DiscoverView />}
        {activeTab === "saved" && (
          <SavedView articles={articles} likedIds={likedIds} bookmarkedIds={bookmarkedIds}
            user={session?.user} onLike={handleLike} onBookmark={handleBookmark} onShare={handleShare} />
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ─── Curation bar ─── */}
      {totalSelected > 0 && (
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
                {totalSelected} item{totalSelected !== 1 ? "s" : ""} selected
              </div>
              <div style={{ fontSize: "11px", color: "#999", marginTop: "1px" }}>
                {[
                  selectedIds.length > 0 && `${selectedIds.length} article${selectedIds.length !== 1 ? "s" : ""}`,
                  selectedVideos.length > 0 && `${selectedVideos.length} video${selectedVideos.length !== 1 ? "s" : ""}`,
                  selectedEpisodes.length > 0 && `${selectedEpisodes.length} podcast${selectedEpisodes.length !== 1 ? "s" : ""}`,
                ].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setSelectedIds([]); setSelectedVideos([]); setSelectedEpisodes([]); }} style={{ background: "none", border: "1px solid #444", borderRadius: "12px", color: "#ccc", padding: "10px 14px", fontSize: "12px", fontWeight: 600 }}>Clear</button>
              <button
                onClick={() => setShowAudioBriefing(true)}
                title="Create audio briefing"
                style={{ background: "#1a1a1e", border: "1px solid #333", borderRadius: "12px", color: "#ccc", padding: "10px 14px", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                🎙
              </button>
              <button onClick={handleOpenNewsletter} style={{ background: "#00e5a0", border: "none", borderRadius: "12px", color: "#000", padding: "10px 18px", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                <NewsletterIcon size={16} /> Build
              </button>
            </div>
          </div>
        </div>
      )}

      <ShareSheet article={shareTarget} onClose={() => setShareTarget(null)} onToast={showToast} />
      <Toast message={toast.msg} visible={toast.show} />
      {showNewsletter && <NewsletterBuilder articles={selectedArticles} videos={selectedVideos} episodes={selectedEpisodes} userId={userId} onClose={() => setShowNewsletter(false)} onToast={showToast} />}
      {showAudioBriefing && <AudioBriefing articles={selectedArticles} userId={userId} onClose={() => setShowAudioBriefing(false)} onToast={showToast} />}
      {showSettings && (
        <SettingsPage
          user={session?.user}
          streakData={streakData}
          onClose={() => setShowSettings(false)}
          onToast={showToast}
          onProfileUpdated={() => {}}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  HEADER
// ═══════════════════════════════════════════════

function Header({ searchOpen, searchQuery, activeCategory, searchInputRef, user, activeTab, streakData, onLogout, onToggleSearch, onSearchChange, onCategoryChange, onOpenSettings }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] || "?").toUpperCase();

  const showCategories = activeTab === "feed";
  const streakTier = streakData ? getStreakTier(streakData.current_streak || 0) : null;
  const hasStreak = streakData && (streakData.current_streak || 0) >= 3;

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
          {/* Streak badge — shown for 3+ day streaks */}
          {hasStreak && (
            <div style={{
              display: "flex", alignItems: "center", gap: "3px",
              padding: "3px 8px", borderRadius: "10px",
              background: `${streakTier.color}12`, border: `1px solid ${streakTier.color}25`,
            }}>
              <span style={{ fontSize: "12px" }}>{streakTier.icon}</span>
              <span style={{ fontSize: "11px", fontWeight: 700, color: streakTier.color }}>{streakData.current_streak}</span>
            </div>
          )}
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
                  borderRadius: "14px", padding: "8px", minWidth: "200px", zIndex: 201,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "fadeSlide 0.15s ease",
                }}>
                  {/* User info */}
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #333" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>{user?.user_metadata?.full_name || "User"}</div>
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>{user?.email}</div>
                  </div>
                  {/* Streak summary */}
                  {streakData && (streakData.current_streak || 0) > 0 && (
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid #222" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                        <span style={{ fontSize: "14px" }}>{streakTier?.icon}</span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: streakTier?.color }}>
                          {streakData.current_streak}-day streak
                        </span>
                      </div>
                      <div style={{ fontSize: "10px", color: "#555" }}>
                        {streakTier?.label} · Best: {streakData.longest_streak || 0} days
                      </div>
                    </div>
                  )}
                  {/* Settings */}
                  <button onClick={() => { setShowUserMenu(false); onOpenSettings(); }} style={{
                    width: "100%", padding: "10px 12px", background: "none", border: "none",
                    borderRadius: "8px", color: "#ccc", fontSize: "13px", fontWeight: 600,
                    textAlign: "left", cursor: "pointer", marginTop: "4px", transition: "background 0.2s",
                    display: "flex", alignItems: "center", gap: "8px",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    Settings
                  </button>
                  {/* Log out */}
                  <button onClick={() => { setShowUserMenu(false); onLogout(); }} style={{
                    width: "100%", padding: "10px 12px", background: "none", border: "none",
                    borderRadius: "8px", color: "#ff3b5c", fontSize: "13px", fontWeight: 600,
                    textAlign: "left", cursor: "pointer", transition: "background 0.2s",
                    display: "flex", alignItems: "center", gap: "8px",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,59,92,0.08)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Log out
                  </button>
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
        <div style={{ display: "flex", gap: "7px", padding: "12px 16px 12px", overflowX: "auto", scrollbarWidth: "none" }}>
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
      )}
      {!showCategories && !searchOpen && <div style={{ height: "12px" }} />}
    </header>
  );
}

// ═══════════════════════════════════════════════
//  FEED VIEW
// ═══════════════════════════════════════════════

function FeedView({ articles, loading, error, searchQuery, likedIds, bookmarkedIds, selectedIds, user, onLike, onBookmark, onShare, onToggleSelect, onClearFilters, onSearchTag, onRetry }) {
  const hasSelections = selectedIds.size > 0;
  return (
    <div style={{ padding: hasSelections ? "12px 12px 180px" : "12px 12px 110px" }}>

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

      {articles.map((article, i) => (
        <ArticleCard key={article.id} article={article} index={i} user={user}
          isLiked={likedIds.has(article.id)} isBookmarked={bookmarkedIds.has(article.id)}
          isSelected={selectedIds.has(article.id)}
          onLike={onLike} onBookmark={onBookmark} onShare={onShare} onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

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

    async function parseJsonSafe(response: Response): Promise<unknown> {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    async function load() {
      try {
        const res = await fetch("/.netlify/functions/fetch-substack");

        if (!res.ok) {
          const responseText = await res.text();
          const isLocalFunctionUnavailable =
            import.meta.env.DEV &&
            (responseText.includes("ECONNREFUSED") || responseText.includes("http proxy error"));

          if (!cancelled) {
            if (isLocalFunctionUnavailable) {
              setError("Local TIC feed function is not running. Start Netlify dev on port 8888.");
            } else if (res.status === 404) {
              setError("TIC feed endpoint is missing in this environment");
            } else {
              setError(`TIC feed returned an error (HTTP ${res.status})`);
            }
          }
          return;
        }

        const payload = await parseJsonSafe(res);
        if (!payload || typeof payload !== "object") {
          if (!cancelled) setError("TIC feed returned an invalid response");
          return;
        }

        const data = payload as { ok?: boolean; articles?: unknown[]; error?: unknown };

        if (!cancelled && data.ok) {
          setSubstackArticles(dedupe(Array.isArray(data.articles) ? data.articles : []));
          return;
        }

        if (!cancelled) {
          const reason = typeof data.error === "string" ? data.error : "unknown error";
          setError(`Couldn't load TIC content: ${reason}`);
        }
      } catch {
        if (!cancelled) setError("Couldn't connect to TIC feed");
      }
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
          <ArticleCard
            key={article.id}
            article={article}
            index={i}
            user={user}
            isLiked={likedIds.has(article.id)}
            isBookmarked={bookmarkedIds.has(article.id)}
            isSelected={false}
            onLike={onLike}
            onBookmark={onBookmark}
            onShare={onShare}
          />
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

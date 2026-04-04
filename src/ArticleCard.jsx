import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { HeartIcon, CommentIcon, ShareIcon, BookmarkIcon, ExternalIcon } from "./Icons.jsx";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const CAT_COLORS = {
  "Talent Strategy": "#00E5B8", "Labour Market": "#00b4d8", "Automation": "#ff6b35",
  "Executive Moves": "#a855f7", "Compensation": "#f59e0b", "Workforce Planning": "#ec4899",
  "Skills": "#06b6d4", "DEI": "#8b5cf6",
};

const CAT_GRADIENTS = {
  "Talent Strategy": ["#0a1a14", "#0d2b20"], "Labour Market": ["#0a141a", "#0d202b"],
  "Automation": ["#1a120a", "#2b1a0d"], "Executive Moves": ["#1a1040", "#0d1520"],
  "Compensation": ["#1a160a", "#2b210d"], "Workforce Planning": ["#1a0a14", "#2b0d20"],
  "Skills": ["#0a1618", "#0d2225"], "DEI": ["#110a1a", "#1a0d2b"],
};

function fmt(n) { if (n === null || n === undefined) return "0"; return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (isNaN(diffMs) || diffMs < 0) return "";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  return new Date(isoString).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Category SVG Fallback (Tier 3 image fallback) ───

function CategoryFallbackSvg({ category, width = 347, height = 200 }) {
  const color = CAT_COLORS[category] || "#00E5B8";
  const [g1, g2] = CAT_GRADIENTS[category] || ["#111", "#1a1a1a"];
  const uid = `${category}-${width}-${height}`.replace(/\s/g, "");
  const r = (op) => {
    const hex = color.replace("#", "");
    const ri = parseInt(hex.substring(0, 2), 16);
    const gi = parseInt(hex.substring(2, 4), 16);
    const bi = parseInt(hex.substring(4, 6), 16);
    return `rgba(${ri},${gi},${bi},${op})`;
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", width: "100%", height: "100%" }}
      preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={g1} /><stop offset="100%" stopColor={g2} />
        </linearGradient>
        <linearGradient id={`ov-${uid}`} x1="0" y1="0.4" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(19,19,21,0)" /><stop offset="100%" stopColor="#131315" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#bg-${uid})`} />
      {category === "Executive Moves" && <>
        <circle cx={width * 0.6} cy={height * 0.38} r={height * 0.18} fill={r(0.06)} stroke={r(0.1)} strokeWidth="1" />
        <circle cx={width * 0.6} cy={height * 0.32} r={height * 0.07} fill={r(0.08)} />
        <ellipse cx={width * 0.6} cy={height * 0.48} rx={height * 0.12} ry={height * 0.05} fill={r(0.05)} />
        {width > 200 && <circle cx={width * 0.3} cy={height * 0.45} r={height * 0.12} fill={r(0.04)} stroke={r(0.06)} strokeWidth="0.5" />}
      </>}
      {category === "Talent Strategy" && <>
        <rect x={width * 0.06} y={height * 0.18} width={width * 0.38} height={height * 0.5} rx="6" fill={r(0.04)} stroke={r(0.07)} strokeWidth="0.5" />
        <rect x={width * 0.1} y={height * 0.28} width={width * 0.1} height={height * 0.14} rx="3" fill={r(0.07)} />
        <rect x={width * 0.24} y={height * 0.28} width={width * 0.14} height={height * 0.03} rx="2" fill={r(0.08)} />
        {width > 200 && <circle cx={width * 0.7} cy={height * 0.35} r={height * 0.12} fill={r(0.04)} stroke={r(0.07)} strokeWidth="0.5" />}
      </>}
      {category === "Labour Market" && <>
        {[0.12, 0.25, 0.38, 0.51, 0.64, 0.77].map((x, i) => (
          <rect key={i} x={width * x} y={height * (0.22 + Math.sin(i * 1.2) * 0.12)}
            width={width * 0.08} height={height * (0.22 + Math.cos(i * 0.8) * 0.15)}
            rx="3" fill={r(0.06 + i * 0.018)} />
        ))}
      </>}
      {category === "Automation" && (() => {
        const cx = width * 0.5, cy = height * 0.4, rad = Math.min(width, height) * 0.18;
        const circ = 2 * Math.PI * rad;
        return <>
          <circle cx={cx} cy={cy} r={rad} fill="none" stroke={r(0.12)} strokeWidth="4" />
          <circle cx={cx} cy={cy} r={rad} fill="none" stroke={r(0.3)} strokeWidth="4"
            strokeDasharray={`${circ * 0.42} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
          <text x={cx} y={cy + 5} textAnchor="middle" fill={r(0.45)} fontSize={width > 200 ? "16" : "12"}
            fontWeight="700" fontFamily="'DM Sans', sans-serif">42%</text>
        </>;
      })()}
      {!["Executive Moves", "Talent Strategy", "Labour Market", "Automation"].includes(category) && <>
        <circle cx={width * 0.5} cy={height * 0.38} r={height * 0.16} fill={r(0.06)} stroke={r(0.09)} strokeWidth="1" />
        <rect x={width * 0.3} y={height * 0.62} width={width * 0.4} height={height * 0.04} rx="2" fill="rgba(255,255,255,0.04)" />
      </>}
      <rect width={width} height={height} fill={`url(#ov-${uid})`} />
    </svg>
  );
}

// ─── Main ArticleCard Component ───

export default function ArticleCard({
  article, index, user, onLike, onBookmark, onShare,
  isLiked, isBookmarked, isSelected, onToggleSelect,
  isHero, onLongPress,
}) {
  const [showComments, setShowComments] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentCount, setCommentCount] = useState(article.comment_count || 0);
  const [submitting, setSubmitting] = useState(false);

  const color = CAT_COLORS[article.category] || "#00E5B8";
  const hasImage = article.image_url && !imgError;
  const timeDisplay = formatRelativeTime(article.published_at || article.created_at);
  const readTime = article.read_time_min || (article.tldr ? Math.max(1, Math.ceil(article.tldr.split(/\s+/).length / 200)) : null);

  // ─── Long-press handling ───
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e) => {
    // Don't trigger if user tapped an action button (they stopPropagation)
    longPressTriggered.current = false;
    touchStartY.current = e.touches?.[0]?.clientY || 0;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress?.(article);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 500);
  }, [article, onLongPress]);

  const handleTouchMove = useCallback((e) => {
    // Cancel long-press if user is scrolling (>10px movement)
    if (longPressTimer.current) {
      const dy = Math.abs((e.touches?.[0]?.clientY || 0) - touchStartY.current);
      if (dy > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Mouse equivalents for desktop
  const handleMouseDown = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress?.(article);
    }, 500);
  }, [article, onLongPress]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // ─── Comment loading ───
  useEffect(() => {
    async function loadCount() {
      try {
        const { count } = await supabase
          .from("comments").select("id", { count: "exact", head: true })
          .eq("article_id", article.id);
        if (count !== null) setCommentCount(count);
      } catch {}
    }
    loadCount();
  }, [article.id]);

  useEffect(() => {
    if (!showComments) return;
    async function loadComments() {
      try {
        const { data } = await supabase
          .from("comments").select("*").eq("article_id", article.id)
          .is("parent_id", null).order("created_at", { ascending: true });
        setComments(data || []);
        setCommentCount(data?.length || 0);
      } catch (e) { console.error("Failed to load comments:", e); }
    }
    loadComments();
  }, [showComments, article.id]);

  const handleSubmitComment = useCallback(async () => {
    if (!commentText.trim() || !user || submitting) return;
    setSubmitting(true);
    try {
      const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Anonymous";
      const { data, error } = await supabase.from("comments").insert({
        user_id: user.id, article_id: article.id, text: commentText.trim(),
        user_name: userName, user_email: user.email,
      }).select().single();
      if (error) throw error;
      setComments((prev) => [...prev, data]);
      setCommentCount((c) => c + 1);
      setCommentText("");
    } catch (e) { console.error("Failed to post comment:", e); }
    setSubmitting(false);
  }, [commentText, user, article.id, submitting]);

  const handleDeleteComment = useCallback(async (commentId) => {
    try {
      await supabase.from("comments").delete().eq("id", commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentCount((c) => Math.max(0, c - 1));
    } catch (e) { console.error("Failed to delete comment:", e); }
  }, []);

  // Prevent action buttons from triggering long-press
  const stopLP = (e) => {
    e.stopPropagation();
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // ─── Shared sub-components ───

  const ActionBtn = ({ icon, count, active, activeColor, onClick }) => (
    <button onTouchStart={stopLP} onMouseDown={stopLP} onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{ display: "flex", alignItems: "center", gap: "4px", padding: 0, border: "none", background: "none",
        color: active ? activeColor : "#666", fontSize: "11px", fontWeight: 600, cursor: "pointer", transition: "color 0.2s" }}>
      {icon}<span>{count}</span>
    </button>
  );

  const BookmarkBtn = ({ size = 26 }) => (
    <button onTouchStart={stopLP} onMouseDown={stopLP}
      onClick={(e) => { e.stopPropagation(); onBookmark(article.id); }}
      style={{ width: size, height: size, borderRadius: 7, border: "none", cursor: "pointer", padding: 0,
        background: isBookmarked ? "rgba(245,158,11,0.25)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
      <BookmarkIcon filled={isBookmarked} size={size * 0.52} />
    </button>
  );

  const CurateBtn = ({ size = 26 }) => (
    <button onTouchStart={stopLP} onMouseDown={stopLP}
      onClick={(e) => { e.stopPropagation(); onToggleSelect?.(article.id); }}
      style={{ width: size, height: size, borderRadius: 7, cursor: "pointer", padding: 0, transition: "all 0.25s",
        background: isSelected ? "#00E5B8" : "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
        border: isSelected ? "none" : "1.5px solid rgba(255,255,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isSelected ? "#000" : "rgba(255,255,255,0.7)" }}>
      {isSelected ? (
        <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
      ) : (
        <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      )}
    </button>
  );

  // Hidden image element for error detection
  const imageErrorDetector = article.image_url && !imgError ? (
    <img src={article.image_url} alt="" style={{ display: "none" }} onError={() => setImgError(true)} />
  ) : null;

  // ═══════════════════════════════════════════════
  //  HERO CARD (first article in feed)
  // ═══════════════════════════════════════════════

  if (isHero) {
    return (
      <article
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        style={{
          borderRadius: "18px", overflow: "hidden",
          border: isSelected ? "2px solid #00E5B8" : "1px solid rgba(255,255,255,0.06)",
          boxShadow: isSelected ? "0 0 20px rgba(0,229,184,0.08)" : "none",
          animation: `cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both`,
          cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
        }}
      >
        {imageErrorDetector}

        {/* Hero Image Area */}
        <div style={{ position: "relative", height: "240px", overflow: "hidden" }}>
          {hasImage ? (
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${article.image_url})`,
              backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : (
            <CategoryFallbackSvg category={article.category} width={400} height={240} />
          )}

          {/* Gradient overlay for text readability */}
          <div style={{ position: "absolute", inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85) 100%)" }} />

          {/* Top-left: category pill + time */}
          <div style={{ position: "absolute", top: 14, left: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ padding: "4px 10px", borderRadius: 8, background: `${color}40`,
              color, fontSize: "11px", fontWeight: 700, letterSpacing: "0.4px" }}>
              {article.category?.toUpperCase()}
            </span>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)" }}>{timeDisplay}</span>
          </div>

          {/* Top-right: bookmark + curate */}
          <div style={{ position: "absolute", top: 14, right: 16, display: "flex", gap: 8 }}>
            <BookmarkBtn size={30} />
            {onToggleSelect && <CurateBtn size={30} />}
          </div>

          {/* Bottom: headline + summary */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 18px 16px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", lineHeight: 1.25,
              letterSpacing: "-0.3px", margin: 0, textShadow: "0 1px 8px rgba(0,0,0,0.5)",
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {article.title}
            </h2>
          </div>
        </div>

        {/* Action bar */}
        <div style={{ padding: "10px 18px 10px", background: "#141416",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "14px" }}>
            <ActionBtn icon={<HeartIcon filled={isLiked} size={18} />}
              count={fmt(article.like_count)} active={isLiked} activeColor="#ff3b5c"
              onClick={() => onLike(article.id)} />
            <ActionBtn icon={<CommentIcon size={18} />}
              count={fmt(commentCount)} active={showComments} activeColor="#00E5B8"
              onClick={() => setShowComments(!showComments)} />
            <ActionBtn icon={<ShareIcon size={18} />}
              count={fmt(article.share_count)} active={false} activeColor="#00b4d8"
              onClick={() => onShare(article)} />
          </div>
          <a href={article.gdelt_url} target="_blank" rel="noopener noreferrer"
            onTouchStart={stopLP} onMouseDown={stopLP}
            style={{ fontSize: "12px", color: "#00E5B8", fontWeight: 600, textDecoration: "none" }}>
            Read more →
          </a>
        </div>

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div style={{ display: "flex", gap: "6px", padding: "0 18px 12px", background: "#141416", flexWrap: "wrap" }}>
            {article.tags.slice(0, 4).map((t) => (
              <span key={t} style={{ padding: "3px 8px", borderRadius: 6,
                background: "rgba(255,255,255,0.04)", fontSize: "11px", color: "#666" }}>{t}</span>
            ))}
          </div>
        )}

        {/* Comments (expandable) */}
        {showComments && (
          <CommentsSection
            comments={comments} user={user} commentText={commentText}
            submitting={submitting} onTextChange={setCommentText}
            onSubmit={handleSubmitComment} onDelete={handleDeleteComment}
          />
        )}
      </article>
    );
  }

  // ═══════════════════════════════════════════════
  //  STANDARD CARD (all other articles)
  // ═══════════════════════════════════════════════

  return (
    <article
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      style={{
        borderRadius: "14px", overflow: "hidden",
        border: isSelected ? "2px solid #00E5B8" : "1px solid rgba(255,255,255,0.05)",
        boxShadow: isSelected ? "0 0 16px rgba(0,229,184,0.06)" : "none",
        background: "#131315",
        animation: `cardIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both`,
        cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      {imageErrorDetector}

      {/* Content row: text + thumbnail side by side */}
      <div style={{ display: "flex" }}>
        {/* Text content (left side) */}
        <div style={{ flex: 1, padding: "14px 12px 14px 16px", display: "flex",
          flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
          <div>
            <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 6,
              background: `${color}18`, color, fontSize: "11px", fontWeight: 700,
              letterSpacing: "0.3px", marginBottom: "6px" }}>
              {article.category?.toUpperCase()}
            </span>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#e8e8ea", lineHeight: 1.35, margin: 0,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {article.title}
            </h3>
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#555", marginTop: "10px" }}>
            <span style={{ fontWeight: 600, color: "#999" }}>{article.source_name || article.source_domain}</span>
            <span>·</span>
            <span>{timeDisplay}</span>
            {readTime && <><span>·</span><span>{readTime}m</span></>}
          </div>

          {/* Actions row */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
            <ActionBtn icon={<HeartIcon filled={isLiked} size={16} />}
              count={fmt(article.like_count)} active={isLiked} activeColor="#ff3b5c"
              onClick={() => onLike(article.id)} />
            <ActionBtn icon={<CommentIcon size={16} />}
              count={fmt(commentCount)} active={showComments} activeColor="#00E5B8"
              onClick={() => setShowComments(!showComments)} />
            {onToggleSelect && <CurateBtn size={24} />}
          </div>
        </div>

        {/* Thumbnail (right side) */}
        <div style={{ width: "120px", flexShrink: 0, position: "relative" }}>
          {hasImage ? (
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${article.image_url})`,
              backgroundSize: "cover", backgroundPosition: "center" }} />
          ) : (
            <CategoryFallbackSvg category={article.category} width={120} height={140} />
          )}
          <div style={{ position: "absolute", top: 8, right: 8 }}>
            <BookmarkBtn size={24} />
          </div>
        </div>
      </div>

      {/* Comments (expandable — full width below the content row) */}
      {showComments && (
        <CommentsSection
          comments={comments} user={user} commentText={commentText}
          submitting={submitting} onTextChange={setCommentText}
          onSubmit={handleSubmitComment} onDelete={handleDeleteComment}
        />
      )}
    </article>
  );
}

// ─── Comments Section (shared between hero and standard cards) ───

function CommentsSection({ comments, user, commentText, submitting, onTextChange, onSubmit, onDelete }) {
  return (
    <div style={{ padding: "2px 18px 18px", borderTop: "1px solid rgba(255,255,255,0.05)",
      background: "#131315", animation: "fadeSlide 0.25s ease" }}>
      {user ? (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "14px", marginBottom: "16px" }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #00E5B8, #00b4d8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "10px", fontWeight: 800, color: "#000",
          }}>
            {(user.user_metadata?.full_name || user.email || "?").charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <textarea value={commentText} onChange={(e) => onTextChange(e.target.value)}
              placeholder="Add a comment…" maxLength={2000} rows={2}
              style={{ width: "100%", background: "#0a0a0c", border: "1px solid #333",
                borderRadius: "12px", padding: "10px 14px", fontSize: "13px", color: "#eee",
                resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 }}
              onFocus={(e) => e.target.style.borderColor = "#00E5B8"}
              onBlur={(e) => e.target.style.borderColor = "#333"}
            />
            {commentText.trim() && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                <button onClick={onSubmit} disabled={submitting}
                  style={{ background: "#00E5B8", border: "none", borderRadius: "10px",
                    color: "#000", padding: "6px 16px", fontSize: "12px", fontWeight: 700,
                    opacity: submitting ? 0.5 : 1, cursor: "pointer" }}>
                  {submitting ? "Posting…" : "Post"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>Log in to comment</p>
        </div>
      )}

      {comments.length === 0 && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <p style={{ fontSize: "12px", color: "#666", margin: 0 }}>No comments yet — be the first</p>
        </div>
      )}

      {comments.map((comment) => {
        const isOwn = user && comment.user_id === user.id;
        const initials = (comment.user_name || "?").charAt(0).toUpperCase();
        return (
          <div key={comment.id} style={{ display: "flex", gap: "10px", marginBottom: "12px", animation: "fadeSlide 0.2s ease" }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
              background: isOwn ? "linear-gradient(135deg, #00E5B8, #00b4d8)" : "#222",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "10px", fontWeight: 700, color: isOwn ? "#000" : "#888",
            }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#ccc" }}>{comment.user_name || "Anonymous"}</span>
                <span style={{ fontSize: "10px", color: "#555" }}>{formatRelativeTime(comment.created_at)}</span>
                {isOwn && (
                  <button onClick={() => onDelete(comment.id)}
                    style={{ background: "none", border: "none", color: "#555", fontSize: "10px",
                      marginLeft: "auto", padding: "2px 6px", borderRadius: "4px", cursor: "pointer",
                      transition: "color 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.color = "#ff3b5c"}
                    onMouseLeave={(e) => e.currentTarget.style.color = "#555"}>
                    Delete
                  </button>
                )}
              </div>
              <p style={{ fontSize: "13px", color: "#aaa", lineHeight: 1.5, margin: 0 }}>{comment.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Article } from "./schemas/article";
import { isGoogleNewsPlaceholderImageUrl } from "./utils/articleImage";
import { HeartIcon, CommentIcon, ShareIcon, BookmarkIcon, ExternalIcon, ToneIndicator } from "./Icons";

const CAT_COLORS = {
  "Talent Strategy": "#00e5a0", "Labour Market": "#00b4d8", "Automation": "#ff6b35",
  "Executive Moves": "#a855f7", "Compensation": "#f59e0b", "Workforce Planning": "#ec4899",
  "Skills": "#06b6d4", "DEI": "#8b5cf6",
};

const CAT_GRADIENTS = {
  "Talent Strategy": ["#0a1a14", "#0d2b20"], "Labour Market": ["#0a141a", "#0d202b"],
  "Automation": ["#1a120a", "#2b1a0d"], "Executive Moves": ["#140a1a", "#200d2b"],
  "Compensation": ["#1a160a", "#2b210d"], "Workforce Planning": ["#1a0a14", "#2b0d20"],
  "Skills": ["#0a1618", "#0d2225"], "DEI": ["#110a1a", "#1a0d2b"],
};

function fmt(n) { if (n === null || n === undefined) return "0"; return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
function sourceAbbr(name) { if (!name) return "??"; const words = name.replace(/^The\s+/i, "").split(/\s+/); if (words.length === 1) return words[0].slice(0, 2).toUpperCase(); return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (isNaN(diffMs) || diffMs < 0) return "";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  return new Date(isoString).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Likers Bottom Sheet ───
function LikersSheet({ articleId, likeCount, onClose }) {
  const [likers, setLikers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLikers() {
      try {
        const { data } = await supabase
          .from("user_engagement")
          .select("user_name, updated_at")
          .eq("article_id", articleId)
          .eq("liked", true)
          .order("updated_at", { ascending: false })
          .limit(50);
        setLikers(data || []);
      } catch (e) {
        console.error("Failed to load likers:", e);
      }
      setLoading(false);
    }
    loadLikers();
  }, [articleId]);

  const summary = likers.length === 0
    ? `${likeCount} like${likeCount !== 1 ? "s" : ""}`
    : likers.length === 1
    ? `Liked by ${likers[0].user_name || "someone"}`
    : `Liked by ${likers[0].user_name || "someone"} and ${likers.length - 1} other${likers.length > 2 ? "s" : ""}`;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} onClick={onClose} />
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: "480px", zIndex: 1001,
        background: "#111", borderRadius: "20px 20px 0 0",
        padding: "16px", maxHeight: "50vh", overflowY: "auto",
        animation: "fadeSlide 0.25s ease",
      }}>
        <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: "#333", margin: "0 auto 16px" }} />
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{summary}</div>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "16px" }}>
          {likeCount} total like{likeCount !== 1 ? "s" : ""}
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "20px", color: "#555", fontSize: "13px" }}>Loading...</div>
        ) : likers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "#555", fontSize: "13px" }}>No likes yet</div>
        ) : (
          likers.map((liker, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: i < likers.length - 1 ? "1px solid #1a1a1a" : "none" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "linear-gradient(135deg, #00e5a0, #00b4d8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", fontWeight: 800, color: "#000",
              }}>
                {(liker.user_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>{liker.user_name || "Anonymous"}</div>
                <div style={{ fontSize: "10px", color: "#555" }}>{formatRelativeTime(liker.updated_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export default function ArticleCard({
  article,
  index,
  user,
  onLike,
  onBookmark,
  onShare,
  isLiked,
  isBookmarked,
  isSelected,
  onToggleSelect,
}: {
  article: Article;
  index: number;
  user: User | null;
  onLike: (articleId: string) => void;
  onBookmark: (articleId: string) => void;
  onShare: (article: Article) => void;
  isLiked: boolean;
  isBookmarked: boolean;
  isSelected: boolean;
  onToggleSelect?: (articleId: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentCount, setCommentCount] = useState(article.comment_count || 0);
  const [submitting, setSubmitting] = useState(false);
  const [showLikers, setShowLikers] = useState(false);

  const color = CAT_COLORS[article.category] || "#00e5a0";
  const abbr = sourceAbbr(article.source_name);
  const heroImageUrl =
    article.image_url && !isGoogleNewsPlaceholderImageUrl(article.image_url)
      ? article.image_url
      : null;
  const hasImage = Boolean(heroImageUrl) && !imgError;
  const [grad1, grad2] = CAT_GRADIENTS[article.category] || ["#111", "#1a1a1a"];
  const timeDisplay = formatRelativeTime(article.published_at || article.created_at);

  // Load real comment count on mount
  useEffect(() => {
    async function loadCount() {
      try {
        const { count } = await supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("article_id", article.id);
        if (count !== null) setCommentCount(count);
      } catch {}
    }
    loadCount();
  }, [article.id]);

  // Load comments when expanded
  useEffect(() => {
    if (!showComments) return;
    async function loadComments() {
      try {
        const { data } = await supabase
          .from("comments")
          .select("*")
          .eq("article_id", article.id)
          .is("parent_id", null)
          .order("created_at", { ascending: true });
        setComments(data || []);
        setCommentCount(data?.length || 0);
      } catch (e) {
        console.error("Failed to load comments:", e);
      }
    }
    loadComments();
  }, [showComments, article.id]);

  // Submit comment
  const handleSubmitComment = useCallback(async () => {
    if (!commentText.trim() || !user || submitting) return;
    setSubmitting(true);
    try {
      const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Anonymous";
      const { data, error } = await supabase.from("comments").insert({
        user_id: user.id,
        article_id: article.id,
        text: commentText.trim(),
        user_name: userName,
        user_email: user.email,
      }).select().single();

      if (error) throw error;
      setComments((prev) => [...prev, data]);
      setCommentCount((c) => c + 1);
      setCommentText("");
    } catch (e) {
      console.error("Failed to post comment:", e);
    }
    setSubmitting(false);
  }, [commentText, user, article.id, submitting]);

  // Delete own comment
  const handleDeleteComment = useCallback(async (commentId) => {
    try {
      await supabase.from("comments").delete().eq("id", commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentCount((c) => Math.max(0, c - 1));
    } catch (e) {
      console.error("Failed to delete comment:", e);
    }
  }, []);

  // ─── Like handler — writes user_name alongside the upsert ───
  const handleLikeWithName = useCallback(() => {
    if (user) {
      const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Anonymous";
      const isCurrentlyLiked = isLiked;
      supabase.from("user_engagement").upsert({
        user_id: user.id,
        article_id: article.id,
        liked: !isCurrentlyLiked,
        user_name: userName,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,article_id" }).then(({ error }) => {
        if (error) console.error("Like name sync error:", error);
      });
    }
    onLike(article.id);
  }, [user, article.id, isLiked, onLike]);

  return (
    <>
      <article style={{
        background: "#111", borderRadius: "20px", overflow: "hidden", marginBottom: "16px",
        border: isSelected ? "2px solid #00e5a0" : "1px solid #222",
        animation: `cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.06}s both`,
        transition: "border-color 0.3s, box-shadow 0.3s",
        boxShadow: isSelected ? "0 0 20px rgba(0,229,160,0.08)" : "none",
        position: "relative",
      }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = "#333"; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = "#222"; }}
      >
        {/* Source Row */}
        <div style={{ padding: "14px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 800, color, letterSpacing: "0.5px", border: `1px solid ${color}22`, flexShrink: 0 }}>{abbr}</div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee", letterSpacing: "-0.2px" }}>{article.source_name || article.source_domain}</div>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>{timeDisplay}</span>
                {article.read_time_min ? (<><span>·</span><span>{article.read_time_min} min</span></>) : article.tldr ? (<><span>·</span><span>{Math.max(1, Math.ceil((article.tldr || "").split(/\s+/).length / 200))} min</span></>) : null}
                {article.gdelt_tone != null && (<><span>·</span><ToneIndicator value={article.gdelt_tone} /></>)}
              </div>
            </div>
          </div>
          <div style={{ padding: "3px 10px", borderRadius: "20px", background: `${color}10`, color, fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", border: `1px solid ${color}18`, textTransform: "uppercase", whiteSpace: "nowrap" }}>{article.category}</div>
        </div>

        {/* Hero Image */}
        <div style={{ position: "relative", paddingTop: "50%", overflow: "hidden" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: hasImage ? `url(${heroImageUrl}) center/cover` : `linear-gradient(135deg, ${grad1}, ${grad2})`,
          }}>
            {hasImage && heroImageUrl && (
              <img src={heroImageUrl} alt="" style={{ display: "none" }} onError={() => setImgError(true)} />
            )}
            {!hasImage && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "40px", fontWeight: 800, color: `${color}15`, fontFamily: "Georgia, serif" }}>
                  {(article.category || "TIC").charAt(0)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "14px 18px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: "0 0 8px", lineHeight: 1.35, fontFamily: "Georgia, serif", letterSpacing: "-0.3px" }}>{article.title}</h2>
          {article.tldr && <p style={{ fontSize: "13px", lineHeight: 1.6, color: "#999", margin: 0 }}>{article.tldr}</p>}

          <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {(article.tags || []).map((tag) => (
              <span key={tag} style={{ fontSize: "11px", color: "#888", cursor: "pointer", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = color)}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
              >{tag}</span>
            ))}
            <span style={{ marginLeft: "auto" }}>
              <a href={article.article_url || article.gdelt_url} target="_blank" rel="noopener noreferrer" style={{
                display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#888", fontWeight: 500, transition: "color 0.2s", textDecoration: "none",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#00e5a0")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
              >Read full article <ExternalIcon /></a>
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div onClick={(e) => e.stopPropagation()} style={{ padding: "10px 18px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #1a1a1a" }}>
          <div style={{ display: "flex", gap: "18px" }}>
            <ActionButton icon={<HeartIcon filled={isLiked} />} count={fmt(article.like_count)} active={isLiked} activeColor="#ff3b5c" onClick={handleLikeWithName} onCountClick={() => setShowLikers(true)} />
            <ActionButton
              icon={<CommentIcon />}
              count={fmt(commentCount)}
              active={showComments}
              activeColor="#00e5a0"
              onClick={() => setShowComments(!showComments)}
              onCountClick={() => setShowComments(!showComments)}
            />
            <ActionButton
              icon={<ShareIcon />}
              count={fmt(article.share_count)}
              active={false}
              activeColor="#00b4d8"
              onClick={() => onShare(article)}
              onCountClick={() => onShare(article)}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {onToggleSelect && (
              <button onClick={() => onToggleSelect(article.id)} aria-label={isSelected ? "Remove from briefing" : "Add to briefing"} style={{
                background: isSelected ? "#00e5a0" : "none", border: isSelected ? "none" : "1.5px solid #333",
                width: "28px", height: "28px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
                color: isSelected ? "#000" : "#666", transition: "all 0.25s ease", padding: 0, flexShrink: 0,
              }}>
                {isSelected ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                )}
              </button>
            )}
            <button onClick={() => onBookmark(article.id)} aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"} style={{
              background: "none", border: "none", padding: 0, color: isBookmarked ? "#f59e0b" : "#888", transition: "color 0.2s",
            }}><BookmarkIcon filled={isBookmarked} /></button>
          </div>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div style={{ padding: "2px 18px 18px", borderTop: "1px solid #1a1a1a", animation: "fadeSlide 0.25s ease" }}>
            {user ? (
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "14px", marginBottom: "16px" }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #00e5a0, #00b4d8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "10px", fontWeight: 800, color: "#000",
                }}>
                  {(user.user_metadata?.full_name || user.email || "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment…"
                    maxLength={2000}
                    rows={2}
                    style={{
                      width: "100%", background: "#0a0a0a", border: "1px solid #333",
                      borderRadius: "12px", padding: "10px 14px", fontSize: "13px",
                      color: "#eee", resize: "none", outline: "none", fontFamily: "inherit",
                      lineHeight: 1.5, boxSizing: "border-box",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#00e5a0"}
                    onBlur={(e) => e.target.style.borderColor = "#333"}
                  />
                  {commentText.trim() && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                      <button onClick={handleSubmitComment} disabled={submitting} style={{
                        background: "#00e5a0", border: "none", borderRadius: "10px",
                        color: "#000", padding: "6px 16px", fontSize: "12px", fontWeight: 700,
                        opacity: submitting ? 0.5 : 1,
                      }}>{submitting ? "Posting…" : "Post"}</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <p style={{ fontSize: "13px", color: "#888" }}>Log in to comment</p>
              </div>
            )}

            {comments.length === 0 && (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <p style={{ fontSize: "12px", color: "#666" }}>No comments yet — be the first</p>
              </div>
            )}

            {comments.map((comment) => {
              const isOwn = user && comment.user_id === user.id;
              const initials = (comment.user_name || "?").charAt(0).toUpperCase();
              return (
                <div key={comment.id} style={{
                  display: "flex", gap: "10px", marginBottom: "12px",
                  animation: "fadeSlide 0.2s ease",
                }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                    background: isOwn ? "linear-gradient(135deg, #00e5a0, #00b4d8)" : "#222",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 700, color: isOwn ? "#000" : "#888",
                  }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#ccc" }}>
                        {comment.user_name || "Anonymous"}
                      </span>
                      <span style={{ fontSize: "10px", color: "#555" }}>
                        {formatRelativeTime(comment.created_at)}
                      </span>
                      {isOwn && (
                        <button onClick={() => handleDeleteComment(comment.id)} style={{
                          background: "none", border: "none", color: "#555", fontSize: "10px",
                          marginLeft: "auto", padding: "2px 6px", borderRadius: "4px",
                          transition: "color 0.2s",
                        }}
                          onMouseEnter={(e) => e.currentTarget.style.color = "#ff3b5c"}
                          onMouseLeave={(e) => e.currentTarget.style.color = "#555"}
                        >Delete</button>
                      )}
                    </div>
                    <p style={{ fontSize: "13px", color: "#aaa", lineHeight: 1.5, margin: 0 }}>
                      {comment.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      {showLikers && (
        <LikersSheet
          articleId={article.id}
          likeCount={article.like_count || 0}
          onClose={() => setShowLikers(false)}
        />
      )}
    </>
  );
}

function ActionButton({ icon, count, active, activeColor, onClick, onCountClick }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", display: "flex", alignItems: "center", gap: "5px",
      padding: 0, color: active ? activeColor : "#888", fontSize: "12px", fontWeight: 600, transition: "color 0.2s",
    }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = activeColor; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "#888"; }}
    >
      {icon}
      <span
        onClick={onCountClick ? (e) => { e.stopPropagation(); onCountClick(); } : undefined}
        style={onCountClick ? { cursor: "pointer" } : undefined}
      >{count}</span>
    </button>
  );
}

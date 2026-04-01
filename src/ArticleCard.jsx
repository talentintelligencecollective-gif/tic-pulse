import { useState } from "react";
import { HeartIcon, CommentIcon, ShareIcon, BookmarkIcon, ExternalIcon, ToneIndicator } from "./Icons.jsx";

// Category → accent colour mapping
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

// Category → fallback gradient (visible, branded, not just black)
const CAT_GRADIENTS = {
  "Talent Strategy": ["#0a1a14", "#0d2b20"],
  "Labour Market": ["#0a141a", "#0d202b"],
  "Automation": ["#1a120a", "#2b1a0d"],
  "Executive Moves": ["#140a1a", "#200d2b"],
  "Compensation": ["#1a160a", "#2b210d"],
  "Workforce Planning": ["#1a0a14", "#2b0d20"],
  "Skills": ["#0a1618", "#0d2225"],
  "DEI": ["#110a1a", "#1a0d2b"],
};

// Format counts: 1200 → "1.2k"
function fmt(n) {
  if (n === null || n === undefined) return "0";
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

// Generate 2-letter source abbreviation
function sourceAbbr(name) {
  if (!name) return "??";
  const words = name.replace(/^The\s+/i, "").split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function ArticleCard({ article, index, onLike, onBookmark, onShare, isLiked, isBookmarked, isSelected, onToggleSelect }) {
  const [showComments, setShowComments] = useState(false);
  const [imgError, setImgError] = useState(false);

  const color = CAT_COLORS[article.category] || "#00e5a0";
  const abbr = sourceAbbr(article.source_name);
  const hasImage = article.image_url && !imgError;
  const [grad1, grad2] = CAT_GRADIENTS[article.category] || ["#111", "#1a1a1a"];

  // Use published_at first (actual publication date), fall back to created_at (DB insert time)
  const timeDisplay = formatRelativeTime(article.published_at || article.created_at);

  return (
    <article
      style={{
        background: "var(--bg-card)",
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        marginBottom: "16px",
        border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
        animation: `cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.06}s both`,
        transition: "border-color 0.3s, box-shadow 0.3s",
        boxShadow: isSelected ? "0 0 20px rgba(0,229,160,0.08)" : "none",
        position: "relative",
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = "var(--border-hover)"; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      {/* ── Source Row ── */}
      <div style={{ padding: "14px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "var(--radius-sm)",
              background: `${color}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 800,
              color,
              letterSpacing: "0.5px",
              border: `1px solid ${color}22`,
              flexShrink: 0,
            }}
          >
            {abbr}
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
              {article.source_name || article.source_domain}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>{timeDisplay}</span>
              <span>·</span>
              <span>{article.read_time_min || 4} min</span>
              {article.gdelt_tone != null && (
                <>
                  <span>·</span>
                  <ToneIndicator value={article.gdelt_tone} />
                </>
              )}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: "3px 10px",
            borderRadius: "var(--radius-pill)",
            background: `${color}10`,
            color,
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            border: `1px solid ${color}18`,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {article.category}
        </div>
      </div>

      {/* ── Hero Image ── */}
      <div style={{ position: "relative", paddingTop: "50%", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: hasImage ? `url(${article.image_url})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            // Fallback: category-colored gradient instead of plain black
            background: hasImage ? undefined : `linear-gradient(135deg, ${grad1}, ${grad2})`,
            transition: "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        />
        {/* Hidden img for error detection */}
        {article.image_url && !imgError && (
          <img
            src={article.image_url}
            alt=""
            style={{ display: "none" }}
            onError={() => setImgError(true)}
          />
        )}
        {/* Fallback: show source + category label when no image */}
        {!hasImage && (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            textAlign: "center", opacity: 0.4,
          }}>
            <div style={{ fontSize: "28px", fontWeight: 800, color, fontFamily: "Georgia, serif", letterSpacing: "-1px" }}>
              {abbr}
            </div>
            <div style={{ fontSize: "9px", fontWeight: 700, color: "#888", letterSpacing: "2px", textTransform: "uppercase", marginTop: "4px" }}>
              {article.category}
            </div>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.88) 100%)",
          }}
        />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 18px 14px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1.32,
              margin: 0,
              letterSpacing: "-0.3px",
              fontFamily: "var(--font-display)",
              textShadow: "0 1px 8px rgba(0,0,0,0.4)",
            }}
          >
            {article.title}
          </h2>
        </div>
      </div>

      {/* ── TL;DR ── */}
      <div style={{ padding: "14px 18px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "7px" }}>
          <div
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "5px",
              background: `${color}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}80` }} />
          </div>
          <span style={{ fontSize: "10px", fontWeight: 800, color, letterSpacing: "2px", textTransform: "uppercase" }}>
            TL;DR
          </span>
        </div>
        <p style={{ fontSize: "13.5px", lineHeight: 1.65, color: "var(--text-secondary)", margin: 0 }}>
          {article.tldr}
        </p>

        {/* Tags + Read link */}
        <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {(article.tags || []).map((tag) => (
            <span
              key={tag}
              style={{ fontSize: "11px", color: "var(--text-muted)", cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = color)}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              {tag}
            </span>
          ))}
          <span style={{ marginLeft: "auto" }}>
            <a
              href={article.gdelt_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                color: "var(--text-muted)",
                fontWeight: 500,
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              Read full article <ExternalIcon />
            </a>
          </span>
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: "10px 18px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", gap: "18px" }}>
          <ActionButton
            icon={<HeartIcon filled={isLiked} />}
            count={fmt(article.like_count)}
            active={isLiked}
            activeColor="var(--red)"
            onClick={() => onLike(article.id)}
          />
          <ActionButton
            icon={<CommentIcon />}
            count={fmt(article.comment_count)}
            active={showComments}
            activeColor="var(--accent)"
            onClick={() => setShowComments(!showComments)}
          />
          <ActionButton
            icon={<ShareIcon />}
            count={fmt(article.share_count)}
            active={false}
            activeColor="var(--blue)"
            onClick={() => onShare(article)}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Add to briefing */}
          <button
            onClick={() => onToggleSelect(article.id)}
            aria-label={isSelected ? "Remove from briefing" : "Add to briefing"}
            style={{
              background: isSelected ? "var(--accent)" : "none",
              border: isSelected ? "none" : "1.5px solid var(--border)",
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isSelected ? "#000" : "var(--text-faint)",
              transition: "all 0.25s ease",
              padding: 0,
              flexShrink: 0,
            }}
          >
            {isSelected ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            )}
          </button>
          {/* Bookmark */}
          <button
            onClick={() => onBookmark(article.id)}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark article"}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: isBookmarked ? "var(--amber)" : "var(--text-muted)",
              transition: "color 0.2s",
            }}
          >
            <BookmarkIcon filled={isBookmarked} />
          </button>
        </div>
      </div>

      {/* ── Comments (Phase 1: placeholder UI) ── */}
      {showComments && (
        <div
          style={{
            padding: "2px 18px 18px",
            borderTop: "1px solid var(--border-subtle)",
            animation: "fadeSlide 0.25s ease",
          }}
        >
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Comments coming in Phase 2
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: "4px" }}>
              Sign up to be notified when community features launch
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Sub-components ───

function ActionButton({ icon, count, active, activeColor, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: 0,
        color: active ? activeColor : "var(--text-muted)",
        fontSize: "12px",
        fontWeight: 600,
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = activeColor;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {icon}
      <span>{count}</span>
    </button>
  );
}

// ─── Utilities ───

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

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

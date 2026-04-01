import { CopyIcon } from "./Icons.jsx";

export default function ShareSheet({ article, onClose, onToast }) {
  if (!article) return null;

  const shareUrl = article.gdelt_url || article.url || "";
  const shareText = `${article.title} — via TIC Pulse`;

  const actions = [
    {
      name: "Copy Link",
      icon: <CopyIcon />,
      action: () => {
        navigator.clipboard?.writeText(shareUrl).then(
          () => onToast("Link copied to clipboard"),
          () => onToast("Couldn't copy — try manually")
        );
        onClose();
      },
    },
    {
      name: "LinkedIn",
      icon: <span style={{ fontSize: "16px", fontWeight: 800, fontFamily: "Georgia, serif" }}>in</span>,
      action: () => {
        window.open(
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
          "_blank",
          "noopener,noreferrer,width=600,height=600"
        );
        onClose();
      },
    },
    {
      name: "WhatsApp",
      icon: <span style={{ fontSize: "18px" }}>💬</span>,
      action: () => {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(shareText + "\n" + shareUrl)}`,
          "_blank",
          "noopener,noreferrer"
        );
        onClose();
      },
    },
    {
      name: "Email",
      icon: <span style={{ fontSize: "18px" }}>✉️</span>,
      action: () => {
        window.open(
          `mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`,
          "_self"
        );
        onClose();
      },
    },
    {
      name: "X / Twitter",
      icon: <span style={{ fontSize: "16px", fontWeight: 700 }}>𝕏</span>,
      action: () => {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
          "_blank",
          "noopener,noreferrer,width=600,height=400"
        );
        onClose();
      },
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 1500,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#161618",
          borderRadius: "28px 28px 0 0",
          width: "100%",
          maxWidth: "480px",
          padding: "8px 24px 36px",
          animation: "sheetUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          style={{
            width: "36px",
            height: "4px",
            borderRadius: "2px",
            background: "rgba(255,255,255,0.12)",
            margin: "8px auto 20px",
          }}
        />

        {/* Article preview card */}
        <div
          style={{
            display: "flex",
            gap: "14px",
            padding: "14px",
            marginBottom: "20px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "16px",
            border: "1px solid var(--border)",
          }}
        >
          {article.image_url && (
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "12px",
                flexShrink: 0,
                backgroundImage: `url(${article.image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "#111",
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#ddd",
                margin: 0,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                fontFamily: "var(--font-display)",
              }}
            >
              {article.title}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0 0" }}>
              {article.source_name} · {article.read_time_min || 4} min read
            </p>
          </div>
        </div>

        {/* Share buttons row */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px" }}>
          {actions.map((s) => (
            <button
              key={s.name}
              onClick={s.action}
              style={{
                background: "none",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                padding: "4px",
              }}
            >
              <div
                style={{
                  width: "54px",
                  height: "54px",
                  borderRadius: "16px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ccc",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--accent-muted)";
                  e.currentTarget.style.borderColor = "var(--accent-border)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-elevated)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                {s.icon}
              </div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 500 }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

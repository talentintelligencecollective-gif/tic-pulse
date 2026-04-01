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
      icon: <span style={{ fontSize: "20px", fontWeight: 800, fontFamily: "Georgia, serif", color: "#ccc" }}>in</span>,
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
      icon: <span style={{ fontSize: "22px" }}>💬</span>,
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
      icon: <span style={{ fontSize: "22px" }}>✉️</span>,
      action: () => {
        window.open(
          `mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`,
          "_self"
        );
        onClose();
      },
    },
    {
      name: "X",
      icon: <span style={{ fontSize: "20px", fontWeight: 700, color: "#ccc" }}>𝕏</span>,
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
            background: "rgba(255,255,255,0.15)",
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
            background: "rgba(255,255,255,0.04)",
            borderRadius: "16px",
            border: "1px solid #333",
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
                backgroundColor: "#222",
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "#eee",
                margin: 0,
                lineHeight: 1.3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                fontFamily: "Georgia, serif",
              }}
            >
              {article.title}
            </p>
            <p style={{ fontSize: "11px", color: "#999", margin: "4px 0 0" }}>
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
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "#1e1e22",
                  border: "1px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ccc",
                  fontSize: "20px",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(0,229,160,0.1)";
                  e.currentTarget.style.borderColor = "rgba(0,229,160,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#1e1e22";
                  e.currentTarget.style.borderColor = "#333";
                }}
              >
                {s.icon}
              </div>
              <span style={{ fontSize: "10px", color: "#aaa", fontWeight: 600 }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

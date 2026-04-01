// Toast notification — appears at bottom of screen

export default function Toast({ message, visible }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "100px",
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
        background: "#1e1e22",
        color: "var(--accent)",
        padding: "12px 24px",
        borderRadius: "var(--radius-md)",
        fontSize: "13px",
        fontWeight: 600,
        border: "1px solid var(--accent-border)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        zIndex: 2000,
        opacity: visible ? 1 : 0,
        transition: "all 0.3s ease",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {message}
    </div>
  );
}

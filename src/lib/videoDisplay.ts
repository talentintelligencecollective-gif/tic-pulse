/** Relative time for multimedia cards (videos / episodes). */
export function relDate(d: string | null | undefined): string {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const dy = Math.floor(ms / 86400000);
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (dy < 7) return `${dy}d ago`;
  const dt = new Date(d);
  return `${dt.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getMonth()]}`;
}

export function fmtViews(n: number | null | undefined): string {
  if (!n) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

export function videoTypeColor(t: string | null | undefined): string {
  return t === "podcast"
    ? "#00e5a0"
    : t === "event"
      ? "#f59e0b"
      : t === "panel"
        ? "#a855f7"
        : t === "short"
          ? "#00b4d8"
          : "#888";
}

export function videoTypeLabel(t: string | null | undefined): string {
  return (
    {
      podcast: "Podcast",
      event: "Event",
      panel: "Panel",
      short: "Short",
      video: "Video",
    }[t || "video"] || "Video"
  );
}

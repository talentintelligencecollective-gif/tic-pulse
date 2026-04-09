// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Settings Page
//  Accessible from the user avatar menu
//  Allows editing: Full Name, Company, Job Title
//  On save: updates profiles table + regenerates user_profile
//  Shows the inferred intelligence profile so users can verify
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { supabase, getStreakTier, getEarnedBadges } from "./supabase.js";

export default function SettingsPage({ user, streakData, onClose, onToast, onProfileUpdated }) {
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intelligenceProfile, setIntelligenceProfile] = useState(null);

  const streakTier = streakData ? getStreakTier(streakData.current_streak || 0) : null;
  const earnedBadges = getEarnedBadges(streakData);

  // Load profile on mount
  useEffect(() => {
    async function load() {
      try {
        // Load editable profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, company, job_title")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          setFullName(profile.full_name || "");
          setCompany(profile.company || "");
          setJobTitle(profile.job_title || "");
        } else {
          // Fallback to auth metadata
          setFullName(user.user_metadata?.full_name || "");
        }

        // Load intelligence profile
        const { data: intel } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (intel) setIntelligenceProfile(intel);
      } catch (e) {
        console.error("Settings load error:", e);
      }
      setLoading(false);
    }
    load();
  }, [user.id]);

  async function handleSave() {
    setSaving(true);
    try {
      // 1. Update profiles table + auth metadata
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          company,
          job_title: jobTitle,
        }, { onConflict: "id" });

      if (profileError) throw new Error(profileError.message);

      // Update auth metadata
      await supabase.auth.updateUser({ data: { full_name: fullName } });

      // 2. Regenerate the intelligence profile
      try {
        const res = await fetch("/.netlify/functions/generate-user-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, force: true }),
        });

        const data = await res.json();

        if (data.success) {
          setIntelligenceProfile(data.profile);
          if (onProfileUpdated) onProfileUpdated(data.profile);
          onToast("Profile updated — your feed will personalise to your new role");
        } else {
          onToast("Profile saved");
        }
      } catch {
        // Profile save succeeded even if intelligence regeneration failed
        onToast("Profile saved");
      }

      onClose();
    } catch (err) {
      console.error("[Settings] Save error:", err);
      onToast("Something went wrong — please try again");
    }

    setSaving(false);
  }

  const s = {
    wrap: {
      position: "fixed", inset: 0, zIndex: 2000, background: "#000",
      display: "flex", flexDirection: "column", maxWidth: "480px", margin: "0 auto",
      animation: "fadeSlide 0.25s cubic-bezier(0.16,1,0.3,1)",
    },
    header: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderBottom: "1px solid #222",
    },
    body: { flex: 1, overflowY: "auto", padding: "20px 16px 40px" },
    label: {
      display: "block", fontSize: "11px", fontWeight: 700,
      color: "#666", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px",
    },
    input: {
      width: "100%", padding: "12px 14px", borderRadius: "12px",
      border: "1px solid #333", background: "#111", color: "#eee",
      fontSize: "14px", outline: "none", fontFamily: "inherit",
      boxSizing: "border-box",
    },
    field: { marginBottom: "16px" },
    sectionLabel: {
      fontSize: "11px", fontWeight: 700, color: "#666",
      letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "10px",
    },
    card: {
      background: "#111", borderRadius: "14px", border: "1px solid #222", padding: "14px 16px",
      marginBottom: "10px",
    },
    pill: {
      display: "inline-block", fontSize: "11px", padding: "4px 10px",
      borderRadius: "20px", fontWeight: 600, marginRight: "6px", marginBottom: "6px",
    },
    saveBtn: {
      width: "100%", padding: "14px", borderRadius: "14px", border: "none",
      background: saving ? "rgba(0,229,160,0.4)" : "#00e5a0",
      color: "#000", fontSize: "14px", fontWeight: 700,
      cursor: saving ? "wait" : "pointer", marginTop: "8px",
    },
  };

  return (
    <div style={s.wrap}>
      <style>{`
        @keyframes fadeSlide { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .settings-input:focus { border-color: #00e5a0 !important; }
        .settings-input::placeholder { color: #444; }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: "22px", lineHeight: 1, padding: "4px", cursor: "pointer" }}>✕</button>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>Settings</div>
        <div style={{ width: "30px" }} />
      </div>

      <div style={s.body}>

        {/* ── Avatar + streak summary ── */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{
            width: "64px", height: "64px", borderRadius: "50%", margin: "0 auto 12px",
            background: "linear-gradient(135deg, #00E5B8, #00b4d8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", fontWeight: 800, color: "#000",
          }}>
            {(fullName || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          {user?.email && (
            <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>{user.email}</div>
          )}
          {streakData && streakTier && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "6px 14px", borderRadius: "14px",
              background: `${streakTier.color}12`, border: `1px solid ${streakTier.color}25`,
            }}>
              <span style={{ fontSize: "16px" }}>{streakTier.icon}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: streakTier.color }}>
                {streakData.current_streak}-day streak
              </span>
              <span style={{ fontSize: "11px", color: "#666" }}>· {streakTier.label}</span>
            </div>
          )}
        </div>

        {/* ── Earned badges ── */}
        {earnedBadges.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={s.sectionLabel}>Badges earned</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {earnedBadges.map((b) => (
                <div key={b.label} style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "5px 10px", borderRadius: "10px",
                  background: "#111", border: "1px solid #333",
                }}>
                  <span style={{ fontSize: "13px" }}>{b.icon}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#ccc" }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stats row ── */}
        {streakData && (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px",
            marginBottom: "28px",
          }}>
            {[
              { label: "Best Streak", value: `${streakData.longest_streak || 0}d` },
              { label: "Active Days", value: streakData.total_active_days || 0 },
              { label: "Likes Given", value: streakData.total_likes || 0 },
            ].map((stat) => (
              <div key={stat.label} style={{
                padding: "12px", borderRadius: "12px", background: "#111",
                border: "1px solid #222", textAlign: "center",
              }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>{stat.value}</div>
                <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Profile fields ── */}
        <div style={{ ...s.sectionLabel, marginBottom: "14px" }}>Your profile</div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#666", fontSize: "13px" }}>Loading...</div>
        ) : (
          <>
            <div style={s.field}>
              <label style={s.label}>Full name</label>
              <input
                className="settings-input"
                style={s.input}
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Company</label>
              <input
                className="settings-input"
                style={s.input}
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="Where do you work?"
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Job title</label>
              <input
                className="settings-input"
                style={s.input}
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Head of Talent Intelligence"
              />
            </div>

            <div style={{ fontSize: "11px", color: "#555", lineHeight: 1.5, marginBottom: "20px" }}>
              Updating your company or job title will refresh your personalised feed recommendations.
            </div>

            <button style={s.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        )}

        {/* ── Intelligence profile ── */}
        {intelligenceProfile && (
          <>
            <div style={{ height: "1px", background: "#1a1a1a", margin: "28px 0 20px" }} />
            <div style={{ ...s.sectionLabel, marginBottom: "14px" }}>Intelligence profile</div>

            <div style={s.card}>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Industry</div>
              <div style={{ fontSize: "14px", color: "#eee", marginBottom: "12px" }}>
                {intelligenceProfile.industry || "Not detected"}
              </div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Function</div>
              <div style={{ fontSize: "14px", color: "#eee", marginBottom: "12px" }}>
                {intelligenceProfile.function || "Not detected"}
              </div>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Seniority</div>
              <div style={{ fontSize: "14px", color: "#eee" }}>
                {intelligenceProfile.seniority || "Not detected"}
              </div>
            </div>

            {intelligenceProfile.feed_topics && intelligenceProfile.feed_topics.length > 0 && (
              <div style={s.card}>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>Feed topics</div>
                <div>
                  {intelligenceProfile.feed_topics.map((t) => (
                    <span key={t} style={{ ...s.pill, background: "rgba(0,229,160,0.1)", color: "#00e5a0", border: "1px solid rgba(0,229,160,0.2)" }}>{t}</span>
                  ))}
                </div>
              </div>
            )}

            {intelligenceProfile.company_keywords && intelligenceProfile.company_keywords.length > 0 && (
              <div style={s.card}>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>Company keywords</div>
                <div>
                  {intelligenceProfile.company_keywords.map((k) => (
                    <span key={k} style={{ ...s.pill, background: "rgba(0,180,216,0.1)", color: "#00b4d8", border: "1px solid rgba(0,180,216,0.2)" }}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            {intelligenceProfile.competitor_keywords && intelligenceProfile.competitor_keywords.length > 0 && (
              <div style={s.card}>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>Competitor keywords</div>
                <div>
                  {intelligenceProfile.competitor_keywords.map((k) => (
                    <span key={k} style={{ ...s.pill, background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>{k}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: intelligenceProfile.profile_source === "user_corrected" ? "#00e5a0" : "#f59e0b",
              }} />
              <div style={{ fontSize: "11px", color: "#555" }}>
                {intelligenceProfile.profile_source === "user_corrected" ? "Manually refreshed" :
                 intelligenceProfile.profile_source === "stale_refreshed" ? "Auto-refreshed" : "Auto-generated"}
              </div>
            </div>

            <div style={{ fontSize: "11px", color: "#555", lineHeight: 1.5, marginTop: "12px" }}>
              This is how TIC Pulse personalises your feed. Articles matching your industry and function rank higher. Save your profile above to refresh these inferences.
            </div>
          </>
        )}

        {/* ── Account info (read-only) ── */}
        <div style={{ height: "1px", background: "#1a1a1a", margin: "28px 0 20px" }} />
        <div style={{ ...s.sectionLabel, marginBottom: "14px" }}>Account</div>
        <div style={s.card}>
          <div style={{ fontSize: "12px", color: "#666", marginBottom: "2px" }}>Email address</div>
          <div style={{ fontSize: "14px", color: "#eee" }}>{user?.email}</div>
        </div>
        <div style={{ fontSize: "11px", color: "#555", lineHeight: 1.5 }}>
          To change your email or password, contact us via the TIC community.
        </div>

      </div>
    </div>
  );
}

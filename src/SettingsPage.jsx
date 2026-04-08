// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Settings Page
//  Accessible from the user avatar menu
//  Allows editing: Full Name, Company, Job Title
//  On save: updates profiles table + regenerates user_profile
//  Shows the inferred intelligence profile so users can verify
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const FUNCTION_LABELS = {
  talent_acquisition: "Talent Acquisition",
  people_analytics: "People Analytics",
  hr_ops: "HR Operations",
  learning_dev: "Learning & Development",
  compensation: "Compensation & Rewards",
  executive: "Executive / C-Suite",
};

const INDUSTRY_LABELS = {
  tech: "Technology",
  finance: "Financial Services",
  healthcare: "Healthcare",
  retail: "Retail",
  fmcg: "FMCG / Consumer Goods",
  consulting: "Consulting",
  government: "Government / Public Sector",
  professional_services: "Professional Services",
  energy: "Energy",
  media: "Media",
};

export default function SettingsPage({ user, onClose, onToast, onProfileUpdated }) {
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intelligenceProfile, setIntelligenceProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [showProfileDetail, setShowProfileDetail] = useState(false);

  // ─── Load existing profile data ───
  useEffect(() => {
    if (!user?.id) return;

    async function load() {
      try {
        // Load registration profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, company, job_title")
          .eq("id", user.id)
          .single();

        if (profile) {
          setFullName(profile.full_name || "");
          setCompany(profile.company || "");
          setJobTitle(profile.job_title || "");
        }

        // Load intelligence profile
        const { data: intel } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (intel) setIntelligenceProfile(intel);
      } catch (err) {
        console.error("[Settings] Load error:", err);
      }
      setLoading(false);
      setProfileLoading(false);
    }

    load();
  }, [user?.id]);

  // ─── Save handler ───
  async function handleSave() {
    if (!user?.id) return;
    setSaving(true);

    try {
      // 1. Update the registration profile in Supabase
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          company,
          job_title: jobTitle,
        });

      if (profileError) throw new Error(profileError.message);

      // 2. Regenerate the intelligence profile (force=true triggers regardless of age)
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
              {saving ? "Saving..." : "Save changes"}
            </button>
          </>
        )}

        {/* ── Intelligence profile (read-only, transparency view) ── */}
        {intelligenceProfile && (
          <>
            <div style={{ height: "1px", background: "#1a1a1a", margin: "28px 0 20px" }} />

            <div style={{ ...s.sectionLabel, marginBottom: "14px" }}>
              Your feed personalisation
              <span style={{ fontSize: "10px", fontWeight: 500, color: "#555", letterSpacing: 0, textTransform: "none", marginLeft: "8px" }}>
                — how we rank your feed
              </span>
            </div>

            <div style={s.card}>
              <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Industry</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>
                    {INDUSTRY_LABELS[intelligenceProfile.industry] || intelligenceProfile.industry || "—"}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Function</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>
                    {FUNCTION_LABELS[intelligenceProfile.function] || intelligenceProfile.function || "—"}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "#666", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Level</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#eee" }}>
                    {intelligenceProfile.seniority === "strategic" ? "Strategic" : "Operational"}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowProfileDetail(!showProfileDetail)}
                style={{ fontSize: "11px", color: "#00e5a0", background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                {showProfileDetail ? "Hide detail ↑" : "Show detail ↓"}
              </button>

              {showProfileDetail && (
                <div style={{ marginTop: "14px", animation: "fadeSlide 0.2s ease" }}>
                  {/* Feed topics */}
                  {intelligenceProfile.feed_topics?.length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "10px", color: "#666", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Topics boosted in your feed</div>
                      <div>
                        {intelligenceProfile.feed_topics.map(t => (
                          <span key={t} style={{ ...s.pill, background: "rgba(0,229,160,0.08)", color: "#00e5a0", border: "1px solid rgba(0,229,160,0.2)" }}>
                            {t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Company keywords */}
                  {intelligenceProfile.company_keywords?.length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "10px", color: "#666", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Company mentions boosted (+30pts)</div>
                      <div>
                        {intelligenceProfile.company_keywords.map(k => (
                          <span key={k} style={{ ...s.pill, background: "rgba(0,180,216,0.08)", color: "#00b4d8", border: "1px solid rgba(0,180,216,0.2)" }}>
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Competitor keywords */}
                  {intelligenceProfile.competitor_keywords?.length > 0 && (
                    <div>
                      <div style={{ fontSize: "10px", color: "#666", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Competitor mentions tracked (+15pts)</div>
                      <div>
                        {intelligenceProfile.competitor_keywords.map(k => (
                          <span key={k} style={{ ...s.pill, background: "rgba(168,85,247,0.08)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)" }}>
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: "11px", color: "#555", marginTop: "12px", lineHeight: 1.5 }}>
                    Last updated: {new Date(intelligenceProfile.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {intelligenceProfile.profile_source === "user_corrected" ? "Manually refreshed" :
                     intelligenceProfile.profile_source === "stale_refreshed" ? "Auto-refreshed" : "Auto-generated"}
                  </div>
                </div>
              )}
            </div>

            <div style={{ fontSize: "11px", color: "#555", lineHeight: 1.5 }}>
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

import { useState } from "react";
import { supabase } from "./supabase";

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setLoading(true); setError(null); setSuccess(null);
    try {
      if (mode === "signup") {
        const { data, error: signUpErr } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (signUpErr) throw signUpErr;
        if (data.user) {
          await supabase.from("profiles").upsert({ id: data.user.id, email: data.user.email, full_name: fullName, company, job_title: jobTitle });
        }
        if (data.session) onAuth(data.session);
        else { setSuccess("Check your email for a confirmation link, then come back and log in."); setMode("login"); }
      } else {
        const { data, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
        if (loginErr) throw loginErr;
        if (data.session) onAuth(data.session);
      }
    } catch (err) { setError(err.message || "Something went wrong. Try again."); }
    finally { setLoading(false); }
  };

  const inputStyle = { width: "100%", padding: "14px 16px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#e8e8e8", fontSize: "14px", outline: "none", fontFamily: "'DM Sans', -apple-system, sans-serif", transition: "border-color 0.2s" };
  const labelStyle = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6b7280", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px" };

  return (
    <div style={{ minHeight: "100dvh", background: "#0b1120", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet" />
      <style>{`@keyframes fadeSlide { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } } input::placeholder { color: #4b5563; } input:focus { border-color: rgba(0,229,160,0.4) !important; }`}</style>

      <div style={{ textAlign: "center", marginBottom: "40px", animation: "fadeSlide 0.5s ease" }}>
        <img src="/tic-logo-full2.png" alt="TIC" style={{ width: "48px", height: "48px", objectFit: "contain", marginBottom: "16px" }} />
        <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#fff", margin: "0 0 4px", fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: "-0.5px" }}>Pulse</h1>
        <p style={{ fontSize: "10px", fontWeight: 700, color: "#4b5563", letterSpacing: "2.5px", margin: 0 }}>TALENT INTELLIGENCE COLLECTIVE</p>
      </div>

      <div style={{ width: "100%", maxWidth: "380px", animation: "fadeSlide 0.5s ease 0.1s both" }}>
        <div style={{ display: "flex", marginBottom: "24px", background: "rgba(255,255,255,0.03)", borderRadius: "14px", padding: "3px", border: "1px solid rgba(255,255,255,0.05)" }}>
          {["login", "signup"].map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); }} style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s", background: mode === m ? "rgba(0,229,160,0.12)" : "transparent", color: mode === m ? "#00e5a0" : "#4b5563" }}>{m === "login" ? "Log In" : "Sign Up"}</button>
          ))}
        </div>

        {error && <div style={{ padding: "12px 16px", borderRadius: "12px", background: "rgba(255,59,92,0.08)", border: "1px solid rgba(255,59,92,0.2)", color: "#ff3b5c", fontSize: "13px", marginBottom: "16px", lineHeight: 1.4 }}>{error}</div>}
        {success && <div style={{ padding: "12px 16px", borderRadius: "12px", background: "rgba(0,229,160,0.08)", border: "1px solid rgba(0,229,160,0.2)", color: "#00e5a0", fontSize: "13px", marginBottom: "16px", lineHeight: 1.4 }}>{success}</div>}

        <div>
          {mode === "signup" && (
            <>
              <div style={{ marginBottom: "14px" }}><label style={labelStyle}>Full Name</label><input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" required style={inputStyle} /></div>
              <div style={{ marginBottom: "14px" }}><label style={labelStyle}>Company</label><input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Where do you work?" style={inputStyle} /></div>
              <div style={{ marginBottom: "14px" }}><label style={labelStyle}>Job Title</label><input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Head of Talent Intelligence" style={inputStyle} /></div>
            </>
          )}
          <div style={{ marginBottom: "14px" }}><label style={labelStyle}>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required style={inputStyle} /></div>
          <div style={{ marginBottom: "24px" }}><label style={labelStyle}>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "Create a password (min 6 chars)" : "Your password"} required minLength={6} style={inputStyle} /></div>
          <button onClick={handleSubmit} disabled={loading || !email || !password || (mode === "signup" && !fullName)} style={{ width: "100%", padding: "16px", borderRadius: "14px", border: "none", background: loading ? "rgba(0,229,160,0.3)" : "#00e5a0", color: "#000", fontSize: "15px", fontWeight: 700, cursor: loading ? "wait" : "pointer", transition: "all 0.2s", letterSpacing: "0.2px", opacity: (!email || !password || (mode === "signup" && !fullName)) ? 0.4 : 1 }}>{loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}</button>
        </div>

        <p style={{ textAlign: "center", fontSize: "12px", color: "#4b5563", marginTop: "24px", lineHeight: 1.5 }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }} style={{ background: "none", border: "none", color: "#00e5a0", fontSize: "12px", fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}>{mode === "login" ? "Sign up free" : "Log in"}</button>
        </p>
      </div>
    </div>
  );
}

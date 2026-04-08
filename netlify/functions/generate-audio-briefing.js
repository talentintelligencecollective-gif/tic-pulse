// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Audio Briefing Generator
//  On-demand Netlify Function
//  1. Receives selected articles from frontend
//  2. Calls Claude to write a narrated briefing script
//  3. Calls OpenAI TTS to convert script to MP3
//  4. Uploads MP3 to Supabase Storage (audio-briefings bucket)
//  5. Records the file in audio_briefings table
//  6. Returns public URL + metadata to frontend
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const TIC_CLOSING_CREDIT =
  "This briefing was brought to you free of charge. With thanks to the Talent Intelligence Collective.";

// ─── Helper: Supabase client (service role — for storage upload) ───

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    throw new Error("Missing Supabase env vars");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ─── Helper: Generate briefing script via Claude ───

async function generateScript(articles) {
  if (!ANTHROPIC_KEY) throw new Error("Missing ANTHROPIC_API_KEY");

  const articleSummaries = articles
    .map(
      (a, i) =>
        `Article ${i + 1}: "${a.title}"
Source: ${a.source_name || "Unknown"}
Category: ${a.category || "General"}
Summary: ${a.tldr || a.title}`
    )
    .join("\n\n");

  const prompt = `You are writing a spoken audio briefing script for talent intelligence professionals. 
Write a natural, flowing narration based on these ${articles.length} articles. 

Rules:
- Write for the ear, not the eye — use natural spoken language
- Open with a brief welcome: "Welcome to your Talent Intelligence Collective Pulse intelligence briefing."
- Cover each article in 2-4 sentences: what happened and why it matters to talent professionals
- Use smooth transitions between topics (e.g. "Moving on...", "Also making news...", "On the topic of...")
- Keep a professional but warm tone — like a trusted colleague giving you a morning briefing
- Total length should be 300-400 words
- Do NOT include any markdown, bullet points, headers, or formatting — plain spoken text only
- Do NOT add a closing statement — that will be added separately

Articles to cover:
${articleSummaries}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const scriptBody = data.content?.[0]?.text || "";

  if (!scriptBody) throw new Error("Claude returned empty script");

  // Append the hardcoded TIC closing credit
  return `${scriptBody.trim()}\n\n${TIC_CLOSING_CREDIT}`;
}

// ─── Helper: Convert script to MP3 via OpenAI TTS ───

async function generateAudio(script) {
  if (!OPENAI_KEY) throw new Error("Missing OPENAI_API_KEY");

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "onyx", // Deep, professional narrator voice
      input: script,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI TTS error: ${response.status} — ${err}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

// ─── Helper: Upload MP3 to Supabase Storage ───

async function uploadToStorage(supabase, userId, audioBuffer) {
  const timestamp = Date.now();
  const filename = `${userId}/${timestamp}.mp3`;

  const { error } = await supabase.storage
    .from("audio-briefings")
    .upload(filename, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: false,
    });

  if (error) throw new Error(`Storage upload error: ${error.message}`);

  // Get the public URL (bucket is public)
  const { data: urlData } = supabase.storage
    .from("audio-briefings")
    .getPublicUrl(filename);

  return { path: filename, url: urlData.publicUrl };
}

// ─── Helper: Estimate duration from word count ───

function estimateDuration(script) {
  const words = script.trim().split(/\s+/).length;
  const seconds = Math.round((words / 150) * 60); // ~150 words per minute
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ─── Main handler ───

export default async function handler(req) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // ── Parse request body ──
    const body = await req.json();
    const { articles, userId } = body;

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No articles provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (articles.length > 10) {
      return new Response(
        JSON.stringify({ error: "Maximum 10 articles per briefing" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = getSupabase();

    // ── Stage 1: Generate script ──
    console.log(`[audio-briefing] Generating script for ${articles.length} articles, user ${userId}`);
    const script = await generateScript(articles);
    console.log(`[audio-briefing] Script generated (${script.length} chars)`);

    // ── Stage 2: Convert to audio ──
    console.log("[audio-briefing] Calling OpenAI TTS...");
    const audioBuffer = await generateAudio(script);
    console.log(`[audio-briefing] Audio generated (${audioBuffer.length} bytes)`);

    // ── Stage 3: Upload to Supabase Storage ──
    console.log("[audio-briefing] Uploading to Supabase Storage...");
    const { path, url } = await uploadToStorage(supabase, userId, audioBuffer);
    console.log(`[audio-briefing] Uploaded to: ${path}`);

    // ── Stage 4: Record in database for cleanup ──
    const duration = estimateDuration(script);
    await supabase.from("audio_briefings").insert({
      user_id: userId,
      storage_path: path,
      public_url: url,
      article_count: articles.length,
      duration_estimate: duration,
    });

    // ── Return success ──
    return new Response(
      JSON.stringify({
        success: true,
        url,
        duration,
        articleCount: articles.length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("[audio-briefing] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

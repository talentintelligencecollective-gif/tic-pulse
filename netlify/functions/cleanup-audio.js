// ═══════════════════════════════════════════════════════════════
//  TIC Pulse — Audio Briefing Cleanup
//  Netlify Scheduled Function (runs daily at 03:00 UTC)
//  Deletes audio files older than 24 hours from:
//  1. Supabase Storage (audio-briefings bucket)
//  2. audio_briefings table rows
// ═══════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EXPIRY_HOURS = 24;

export default async function handler() {
  console.log("[cleanup-audio] Starting audio briefing cleanup...");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[cleanup-audio] Missing Supabase env vars");
    return new Response("Missing env vars", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ── Find expired records ──
    const cutoff = new Date(
      Date.now() - EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: expired, error: fetchError } = await supabase
      .from("audio_briefings")
      .select("id, storage_path")
      .lt("created_at", cutoff);

    if (fetchError) {
      console.error("[cleanup-audio] Failed to fetch expired records:", fetchError.message);
      return new Response("DB fetch error", { status: 500 });
    }

    if (!expired || expired.length === 0) {
      console.log("[cleanup-audio] No expired files found. Done.");
      return new Response("No files to clean up", { status: 200 });
    }

    console.log(`[cleanup-audio] Found ${expired.length} expired file(s) to delete`);

    // ── Delete from Storage ──
    const paths = expired.map((r) => r.storage_path);

    try {
      const { error: storageError } = await supabase.storage
        .from("audio-briefings")
        .remove(paths);

      if (storageError) {
        // Log but don't abort — still clean up DB rows
        console.error("[cleanup-audio] Storage delete error:", storageError.message);
      } else {
        console.log(`[cleanup-audio] Deleted ${paths.length} file(s) from storage`);
      }
    } catch (storageErr) {
      // Isolated error — continue to DB cleanup regardless
      console.error("[cleanup-audio] Storage delete threw:", storageErr.message);
    }

    // ── Delete DB rows ──
    const ids = expired.map((r) => r.id);

    const { error: deleteError } = await supabase
      .from("audio_briefings")
      .delete()
      .in("id", ids);

    if (deleteError) {
      console.error("[cleanup-audio] DB delete error:", deleteError.message);
      return new Response("DB delete error", { status: 500 });
    }

    console.log(`[cleanup-audio] Cleaned up ${ids.length} record(s). Done.`);
    return new Response(`Cleaned up ${ids.length} files`, { status: 200 });

  } catch (err) {
    console.error("[cleanup-audio] Unexpected error:", err.message);
    return new Response("Unexpected error", { status: 500 });
  }
}

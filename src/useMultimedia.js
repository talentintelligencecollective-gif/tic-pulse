// ═══════════════════════════════════════════════════════════════
//  TIC PULSE — Multimedia Data Hooks
//  Fetches episodes, videos, and sources from Supabase
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ─── Fetch podcast episodes ───
export function useEpisodes({ limit = 50, sourceId = null, search = "" } = {}) {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("episodes")
        .select("*, sources!inner(name, host, tier, logo_url)")
        .order("published_at", { ascending: false })
        .limit(limit);

      if (sourceId) query = query.eq("source_id", sourceId);
      if (search) query = query.or(`title.ilike.%${search}%,guest_name.ilike.%${search}%,description.ilike.%${search}%`);

      const { data, error: err } = await query;
      if (err) throw err;
      setEpisodes(data || []);
    } catch (e) {
      setError(e.message);
      console.error("[useEpisodes]", e);
    } finally {
      setLoading(false);
    }
  }, [limit, sourceId, search]);

  useEffect(() => { fetch(); }, [fetch]);
  return { episodes, loading, error, refetch: fetch };
}

// ─── Fetch YouTube videos ───
export function useVideos({ limit = 50, sourceId = null, type = null, search = "" } = {}) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("videos")
        .select("*, sources!inner(name, host, tier, logo_url)")
        .order("published_at", { ascending: false })
        .limit(limit);

      if (sourceId) query = query.eq("source_id", sourceId);
      if (type && type !== "all") query = query.eq("video_type", type);
      if (search) query = query.or(`title.ilike.%${search}%,channel_title.ilike.%${search}%,description.ilike.%${search}%`);

      const { data, error: err } = await query;
      if (err) throw err;
      setVideos(data || []);
    } catch (e) {
      setError(e.message);
      console.error("[useVideos]", e);
    } finally {
      setLoading(false);
    }
  }, [limit, sourceId, type, search]);

  useEffect(() => { fetch(); }, [fetch]);
  return { videos, loading, error, refetch: fetch };
}

// ─── Fetch sources ───
export function useSources(type = null) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      let query = supabase
        .from("sources")
        .select("*")
        .eq("active", true)
        .order("tier", { ascending: true });

      if (type) query = query.eq("type", type);

      const { data } = await query;
      setSources(data || []);
      setLoading(false);
    }
    load();
  }, [type]);

  return { sources, loading };
}

// ─── Format helpers ───
export function formatRelativeDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);

  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function formatViewCount(count) {
  if (!count) return "0";
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

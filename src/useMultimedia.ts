// TIC Pulse — Multimedia Data Hooks
// Fetches episodes, videos, and sources from Supabase

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

/** Nested `sources` row from Supabase `select('*, sources!inner(...)')`. */
export interface MultimediaSourceJoin {
  name?: string | null;
  host?: string | null;
  tier?: string | number | null;
  logo_url?: string | null;
}

export interface EpisodeRow {
  id: string;
  title?: string | null;
  published_at?: string | null;
  guest_name?: string | null;
  guest_org?: string | null;
  description?: string | null;
  duration?: string | null;
  duration_seconds?: number | null;
  audio_url?: string | null;
  listen_count?: number | null;
  link?: string | null;
  keyword_matches?: string[] | null;
  sources?: MultimediaSourceJoin | null;
}

export interface VideoRow {
  id: string;
  youtube_id?: string | null;
  title?: string | null;
  video_type?: string | null;
  thumbnail_url?: string | null;
  channel_title?: string | null;
  published_at?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  duration?: string | null;
  description?: string | null;
  keyword_matches?: string[] | null;
  sources?: MultimediaSourceJoin | null;
}

export interface SourceRow {
  id: string;
  name?: string | null;
  host?: string | null;
  tier?: string | number | null;
  logo_url?: string | null;
  type?: string | null;
  active?: boolean | null;
}

export function useEpisodes({
  limit = 50,
  sourceId = null,
  search = "",
}: {
  limit?: number;
  sourceId?: string | null;
  search?: string;
} = {}) {
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("episodes")
        .select("*, sources!inner(name, host, tier, logo_url)")
        .order("published_at", { ascending: false })
        .limit(limit);

      if (sourceId) query = query.eq("source_id", sourceId);
      if (search)
        query = query.or(
          `title.ilike.%${search}%,guest_name.ilike.%${search}%,description.ilike.%${search}%`
        );

      const { data, error: err } = await query;
      if (err) throw err;
      setEpisodes((data as EpisodeRow[]) ?? []);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[useEpisodes]", e);
    } finally {
      setLoading(false);
    }
  }, [limit, sourceId, search]);

  useEffect(() => {
    void fetch();
  }, [fetch]);
  return { episodes, loading, error, refetch: fetch };
}

export function useVideos({
  limit = 50,
  sourceId = null,
  type = null,
  search = "",
}: {
  limit?: number;
  sourceId?: string | null;
  type?: string | null;
  search?: string;
} = {}) {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (search)
        query = query.or(
          `title.ilike.%${search}%,channel_title.ilike.%${search}%,description.ilike.%${search}%`
        );

      const { data, error: err } = await query;
      if (err) throw err;
      setVideos((data as VideoRow[]) ?? []);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error("[useVideos]", e);
    } finally {
      setLoading(false);
    }
  }, [limit, sourceId, type, search]);

  useEffect(() => {
    void fetch();
  }, [fetch]);
  return { videos, loading, error, refetch: fetch };
}

export function useSources(type: string | null = null) {
  const [sources, setSources] = useState<SourceRow[]>([]);
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
      setSources((data as SourceRow[]) ?? []);
      setLoading(false);
    }
    void load();
  }, [type]);

  return { sources, loading };
}

export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);

  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function formatViewCount(count: number | undefined): string {
  if (!count) return "0";
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

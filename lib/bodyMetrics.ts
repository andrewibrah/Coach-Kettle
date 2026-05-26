// Client API for body metrics, body photos, and resting heart rate.

import { supabaseUrl, supabase } from './supabase';
import { fetchWithAuth } from './auth';
import { File as ExpoFile } from 'expo-file-system';
import type {
  BodyMetricsEntry,
  BodyPhoto,
  RestingHeartRateEntry,
  RestingHeartRateSummary,
  StrengthProgressionPoint,
} from '@/types/body';

const API = `${supabaseUrl}/functions/v1`;
const PHOTO_BUCKET = 'workout-media';

async function get<T>(url: string): Promise<T> {
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// ---------- Body metrics ----------
export async function fetchBodyMetrics(days = 180): Promise<BodyMetricsEntry[]> {
  const data = await get<{ entries: BodyMetricsEntry[] }>(`${API}/body-metrics?action=list&days=${days}`);
  return data.entries ?? [];
}

export async function fetchLatestBodyMetric(): Promise<BodyMetricsEntry | null> {
  const data = await get<{ entry: BodyMetricsEntry | null }>(`${API}/body-metrics?action=latest`);
  return data.entry;
}

export interface UpsertBodyMetricInput {
  measured_date: string;          // YYYY-MM-DD
  weight_lbs?: number | null;
  body_fat_pct?: number | null;
  waist_in?: number | null;
  chest_in?: number | null;
  hips_in?: number | null;
  arm_in?: number | null;
  thigh_in?: number | null;
  neck_in?: number | null;
  notes?: string | null;
}

export async function upsertBodyMetric(input: UpsertBodyMetricInput): Promise<BodyMetricsEntry> {
  const data = await post<{ entry: BodyMetricsEntry }>(`${API}/body-metrics`, {
    action: 'upsert',
    ...input,
  });
  return data.entry;
}

export async function deleteBodyMetric(id: string): Promise<void> {
  await post<{ ok: true }>(`${API}/body-metrics`, { action: 'delete', id });
}

// ---------- Body photos ----------
export async function fetchBodyPhotos(days = 180): Promise<BodyPhoto[]> {
  const data = await get<{ photos: BodyPhoto[] }>(`${API}/body-metrics?action=photos&days=${days}`);
  return data.photos ?? [];
}

/**
 * Upload a local file URI to the body-photo storage area and record the row.
 * Mirrors lib/mediaUpload pattern but routes into the body/ namespace so
 * the edge function's path-scope check passes.
 */
export async function uploadAndRecordBodyPhoto(opts: {
  userId: string;
  localUri: string;
  capturedDate: string;
  pose?: 'front' | 'side' | 'back' | 'custom';
  width?: number;
  height?: number;
  mimeType?: string;
  notes?: string;
}): Promise<BodyPhoto> {
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const storagePath = `${opts.userId}/body/${fileName}`;
  const mime = opts.mimeType ?? 'image/jpeg';

  // Read file via expo-file-system File API (matches lib/mediaUpload.ts)
  const file = new ExpoFile(opts.localUri);
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength < 100) {
    throw new Error(`File appears empty or corrupt (${arrayBuffer.byteLength} bytes)`);
  }

  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const result = await post<{ photo: BodyPhoto }>(`${API}/body-metrics`, {
    action: 'add_photo',
    storage_path: storagePath,
    captured_date: opts.capturedDate,
    pose: opts.pose,
    width: opts.width,
    height: opts.height,
    mime_type: mime,
    size_bytes: arrayBuffer.byteLength,
    notes: opts.notes,
  });
  return result.photo;
}

export async function deleteBodyPhoto(id: string): Promise<void> {
  await post<{ ok: true }>(`${API}/body-metrics`, { action: 'delete_photo', id });
}

// ---------- Resting heart rate ----------
export async function fetchRestingHRSummary(days = 30): Promise<RestingHeartRateSummary | null> {
  const data = await get<{ summary: RestingHeartRateSummary | null }>(`${API}/resting-hr?action=summary&days=${days}`);
  return data.summary;
}

export async function fetchRestingHRList(days = 30): Promise<RestingHeartRateEntry[]> {
  const data = await get<{ entries: RestingHeartRateEntry[] }>(`${API}/resting-hr?action=list&days=${days}`);
  return data.entries ?? [];
}

export async function upsertRestingHR(input: { measured_date: string; bpm: number; source?: RestingHeartRateEntry['source']; notes?: string }): Promise<RestingHeartRateEntry> {
  const data = await post<{ entry: RestingHeartRateEntry }>(`${API}/resting-hr`, {
    action: 'upsert',
    ...input,
  });
  return data.entry;
}

export async function deleteRestingHR(id: string): Promise<void> {
  await post<{ ok: true }>(`${API}/resting-hr`, { action: 'delete', id });
}

// ---------- Strength progression (uses RPC via supabase-js directly) ----------
export async function fetchStrengthProgression(exercise: string, limit = 60): Promise<StrengthProgressionPoint[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase.rpc('get_strength_progression', {
    p_user_id: userId,
    p_exercise: exercise,
    p_limit: limit,
  });
  if (error) {
    console.warn('[bodyMetrics] strength_progression error', error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

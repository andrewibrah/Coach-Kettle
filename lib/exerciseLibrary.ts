// Client API for the canonical exercise library.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import type { Exercise } from '@/types/exercise';

const API = `${supabaseUrl}/functions/v1`;
// v3: action=list is now paginated server-side (#11) — a v2 cache holds a
// possibly-truncated list (PostgREST's max-rows ceiling), so the key must
// change or users would keep a stale, incomplete list for up to 24h.
const CACHE_KEY = 'exercise_library_v3';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const PAGE_SIZE = 200;
// Hard stop so a server bug (e.g. has_more never turning false) can't spin
// this into an unbounded fetch loop.
const MAX_PAGES = 20;

interface CachedShape { cachedAt: number; exercises: Exercise[] }

interface ListPageResponse {
  exercises: Exercise[];
  total?: number;
  offset?: number;
  limit?: number;
  has_more?: boolean;
}

async function fetchAllPages(): Promise<Exercise[]> {
  const all: Exercise[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchWithAuth(
      `${API}/exercise-library?action=list&offset=${offset}&limit=${PAGE_SIZE}`,
      { method: 'GET' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ListPageResponse;
    const batch = Array.isArray(data?.exercises) ? data.exercises : [];
    all.push(...batch);
    if (!data.has_more || batch.length === 0) break;
    offset += batch.length;
  }
  return all;
}

export async function fetchExerciseLibrary(forceRefresh = false): Promise<Exercise[]> {
  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedShape;
        if (Date.now() - parsed.cachedAt < CACHE_TTL) return parsed.exercises;
      }
    } catch { /* ignore */ }
  }

  const exercises = await fetchAllPages();

  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), exercises } satisfies CachedShape));
  } catch { /* ignore */ }

  return exercises;
}

export async function getExerciseBySlug(slug: string): Promise<Exercise | null> {
  const res = await fetchWithAuth(`${API}/exercise-library?action=get&slug=${encodeURIComponent(slug)}`, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.exercise ?? null;
}

export async function clearExerciseCache(): Promise<void> {
  try { await AsyncStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

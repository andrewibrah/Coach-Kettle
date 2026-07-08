// Client API for the canonical exercise library.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import type { Exercise } from '@/types/exercise';

const API = `${supabaseUrl}/functions/v1`;
const CACHE_KEY = 'exercise_library_v2';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface CachedShape { cachedAt: number; exercises: Exercise[] }

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

  const res = await fetchWithAuth(`${API}/exercise-library?action=list`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const exercises: Exercise[] = Array.isArray(data?.exercises) ? data.exercises : [];

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

export async function searchExercises(q: string): Promise<Exercise[]> {
  if (q.trim().length < 2) return [];
  const res = await fetchWithAuth(`${API}/exercise-library?action=search&q=${encodeURIComponent(q)}`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.exercises) ? data.exercises : [];
}

export async function clearExerciseCache(): Promise<void> {
  try { await AsyncStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

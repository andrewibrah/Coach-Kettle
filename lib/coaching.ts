// Client API for the daily-feedback edge function (coaching layer).

import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import type { DailyFeedback, BehaviorState } from '@/types/coaching';

const API = `${supabaseUrl}/functions/v1`;

export async function fetchTodayFeedback(): Promise<DailyFeedback | null> {
  // Server resolves "today" from the user's stored timezone, not the
  // device-local date, to avoid a false HISTORICAL_TARGET_SNAPSHOT_UNAVAILABLE
  // (or an early/late report) for users whose device date has already rolled
  // over relative to their stored timezone.
  const res = await fetchWithAuth(`${API}/daily-feedback?action=today`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.feedback ?? null;
}

export async function fetchRecentFeedback(days = 7): Promise<DailyFeedback[]> {
  const res = await fetchWithAuth(`${API}/daily-feedback?action=recent&days=${days}`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.feedback) ? data.feedback : [];
}

export async function generateFeedbackForDate(date?: string): Promise<DailyFeedback> {
  const res = await fetchWithAuth(`${API}/daily-feedback`, {
    method: 'POST',
    body: JSON.stringify({ action: 'generate', ...(date ? { date } : {}) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data?.feedback || (date && data.feedback.feedback_date !== date)) {
    throw new Error('Coach returned a report for a different date. Please retry.');
  }
  return data.feedback as DailyFeedback;
}

export async function fetchBehaviorState(): Promise<BehaviorState | null> {
  const res = await fetchWithAuth(`${API}/daily-feedback`, {
    method: 'POST',
    body: JSON.stringify({ action: 'state' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.state ?? null;
}

// Client API for the programming engine + next-set suggestion + default templates.

import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import type {
  WorkoutProgram,
  ProgramWeek,
  ProgramDay,
  ProgramExercise,
  GoalType,
  SplitType,
  Periodization,
  NextSetResult,
} from '@/types/programming';
import type { NextSetEvidenceInput } from '@/lib/nextSetDecision';

const API = `${supabaseUrl}/functions/v1`;

// ---------- Programs ----------
export async function fetchActiveProgram(): Promise<WorkoutProgram | null> {
  const res = await fetchWithAuth(`${API}/programming`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.program ?? null;
}

export async function fetchAllPrograms(): Promise<WorkoutProgram[]> {
  const res = await fetchWithAuth(`${API}/programming?action=list`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.programs) ? data.programs : [];
}

export interface ProgramWeekExpanded {
  week: ProgramWeek;
  days: (ProgramDay & { exercises: ProgramExercise[] })[];
}

export async function fetchProgramWeek(programId: string, week: number): Promise<ProgramWeekExpanded | { week: null; days: [] }> {
  const res = await fetchWithAuth(
    `${API}/programming?action=week&program_id=${encodeURIComponent(programId)}&week=${week}`,
    { method: 'GET' }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export interface GenerateProgramInput {
  goal_type: GoalType;
  split_type: SplitType;
  days_per_week: number;
  weeks_total?: number;
  periodization?: Periodization;
}

export async function generateProgram(input: GenerateProgramInput): Promise<WorkoutProgram> {
  const res = await fetchWithAuth(`${API}/programming`, {
    method: 'POST',
    body: JSON.stringify({ action: 'generate', ...input }),
  });
  if (!res.ok) {
    // Surface the server's user-facing message when present, instead of a
    // raw "HTTP 400: {...}" blob landing in a toast (#7).
    const body = await res.text();
    let message = 'Failed to create program';
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === 'string' && parsed.error) message = parsed.error;
    } catch {
      // Non-JSON body — keep the generic fallback.
    }
    throw new Error(message);
  }
  const data = await res.json();
  return data?.program as WorkoutProgram;
}

export async function advanceProgramWeek(programId: string): Promise<WorkoutProgram> {
  const res = await fetchWithAuth(`${API}/programming`, {
    method: 'POST',
    body: JSON.stringify({ action: 'advance_week', program_id: programId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.program as WorkoutProgram;
}

export async function archiveProgram(programId: string): Promise<WorkoutProgram> {
  const res = await fetchWithAuth(`${API}/programming`, {
    method: 'POST',
    body: JSON.stringify({ action: 'archive', program_id: programId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.program as WorkoutProgram;
}

// ---------- Next-set suggestion ----------
export async function fetchNextSetSuggestion(exercise: string, sessionId?: string): Promise<NextSetResult> {
  const session = sessionId ? `&session=${encodeURIComponent(sessionId)}` : '';
  return nextSetResult(() => fetchWithAuth(
    `${API}/next-set?exercise=${encodeURIComponent(exercise)}${session}`,
    { method: 'GET' }
  ));
}

/** A2 (used by A3): POST current-session evidence; the server returns `decision` only while adaptiveNextSet is on. */
export async function fetchNextSetDecision(exercise: string, evidence: NextSetEvidenceInput): Promise<NextSetResult> {
  return nextSetResult(() => fetchWithAuth(`${API}/next-set`, {
    method: 'POST',
    body: JSON.stringify({ exercise, sessionId: evidence.sessionId, evidence }),
  }));
}

async function nextSetResult(request: () => Promise<Response>): Promise<NextSetResult> {
  try {
    const res = await request();
    if (!res.ok) return { status: 'unavailable', reason: 'error', baseline: null };
    const data = await res.json();
    const baseline = data?.baseline ?? null;
    if (data?.decision) return { status: 'decision', decision: data.decision, baseline };
    if (data?.suggestion) return { status: 'suggestion', suggestion: data.suggestion, baseline };
    // A response without a baseline field (older server) is not evidence of no history.
    if (data && 'baseline' in data && data.baseline === null) return { status: 'no_history' };
    return { status: 'unavailable', reason: String(data?.reason ?? 'error'), baseline };
  } catch {
    return { status: 'unavailable', reason: 'error', baseline: null };
  }
}

// ---------- Default templates ----------
export type DefaultTemplateGoal = 'muscle_building' | 'leaning_out' | 'weight_loss';

export async function seedDefaultTemplates(goal: DefaultTemplateGoal): Promise<{ ok: boolean; goal: string; templates: { template_id: string; template_name: string; items_inserted: number }[] }> {
  const res = await fetchWithAuth(`${API}/default-templates`, {
    method: 'POST',
    body: JSON.stringify({ goal }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

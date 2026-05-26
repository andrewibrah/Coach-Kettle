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
  NextSetSuggestion,
} from '@/types/programming';

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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
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
export async function fetchNextSetSuggestion(exercise: string): Promise<NextSetSuggestion | null> {
  const res = await fetchWithAuth(
    `${API}/next-set?exercise=${encodeURIComponent(exercise)}`,
    { method: 'GET' }
  );
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    return null;
  }
  const data = await res.json();
  return data?.suggestion ?? null;
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

import { supabase } from './supabase';
import type { FormAnalysis, FormAnalysisInput, LocalFormEstimate } from '@/types/form';

export const FORM_ANALYSIS_UNAVAILABLE = 'Form analysis is unavailable. Video-based scoring is not implemented.';

// Fail closed until a validated analyzer exists. Keep these entry points guarded
// so alternate callers cannot manufacture or persist synthetic measurements.
export function estimateFormFromCapture(_input: FormAnalysisInput): LocalFormEstimate {
  throw new Error(FORM_ANALYSIS_UNAVAILABLE);
}

export async function saveFormAnalysis(_input: FormAnalysisInput): Promise<FormAnalysis> {
  throw new Error(FORM_ANALYSIS_UNAVAILABLE);
}

export async function fetchRecentFormAnalyses(limit = 10): Promise<FormAnalysis[]> {
  const { data, error } = await supabase
    .from('form_analyses')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as FormAnalysis[];
}

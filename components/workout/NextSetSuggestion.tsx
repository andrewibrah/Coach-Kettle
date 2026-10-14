// Per-row "Suggested next set" pill. Fetches /next-set for the row's exercise
// and renders a compact recommendation: weight × rep-range + strategy + reason.
//
// Designed to be dropped under (or beside) the inline workout row in
// `app/(tabs)/index.tsx`. Re-fetches when the exercise name changes.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { fetchNextSetSuggestion } from '@/lib/programming';
import type { NextSetDecision } from '@/lib/nextSetDecision';
import type { NextSetBaseline, NextSetResult, NextSetSuggestion } from '@/types/programming';

type Props = {
  exercise: string;
  /** Optional callback when the user taps "use" — receives suggested weight. */
  onUseWeight?: (weightLbs: number) => void;
  /** Compact mode for tight rows (default true). */
  compact?: boolean;
  // A3 decision mode (route-supplied, COACHING_POLICY.adaptiveNextSet). Without `load`
  // the pill keeps the H1 GET behaviour keyed on the normalized exercise name.
  /** Refetch whenever this changes (session/exercise/revision), not on the name alone. */
  refreshKey?: string;
  revision?: number;
  load?: (revision: number) => Promise<NextSetResult>;
  /** Ownership fence: a response for a revision that is no longer current is dropped. */
  isCurrent?: (revision: number) => boolean;
  onResult?: (result: NextSetResult, revision: number) => void;
  /** Present only when there is a next planned set the action could fill. */
  onUseDecision?: (decision: NextSetDecision, revision: number) => void;
  /** Coalesce bursts (batch fills) into one request. */
  debounceMs?: number;
  /** A request that never settles becomes an explicit error with Retry, never endless Loading. */
  deadlineMs?: number;
};

const UNAVAILABLE: NextSetResult = { status: 'unavailable', reason: 'error', baseline: null };
const ACTION_CODES = ['hold', 'increase', 'reduce'];

// PLACEHOLDER copy until D09/Q9 approves wording (never diagnostic). Reason codes are
// shown raw as neutral labels for the same reason.
const DECISION_TITLE: Record<NextSetDecision['code'], string> = {
  increase: 'Increase', hold: 'Hold', reduce: 'Reduce',
  stop_or_clarify: 'Check in before another set', clarify: 'Your answers need a check',
  unavailable: 'Suggestions unavailable', stale: 'Out of date', no_history: 'No previous session',
  baseline_mismatch: 'Suggestions unavailable', invalid_evidence: 'Suggestions unavailable',
};

/** The decision's own action, verbatim: never a load the engine did not return. */
export function decisionLabel(decision: NextSetDecision): string {
  const title = DECISION_TITLE[decision.code] ?? 'Suggestions unavailable';
  const action = ACTION_CODES.includes(decision.code) ? decision.action : undefined;
  if (!action) return title;
  const reps = action.reps ? (action.reps.low === action.reps.high ? `${action.reps.low}` : `${action.reps.low}–${action.reps.high}`) : null;
  if (action.loadLbs === undefined) return reps ? `${title}: ${reps} reps` : title;
  return `${title}: ${action.loadLbs} lb${reps ? ` × ${reps}` : ''}`;
}

/** Evidence-linked reason: what the decision cites, including the prior session when it does. */
export function evidenceSummary(decision: NextSetDecision, baseline: NextSetBaseline | null): string {
  const count = decision.evidenceIds.length;
  if (count === 0) return 'No evidence cited';
  const prior = decision.evidenceIds.some((id) => id.startsWith('baseline:')) && baseline?.date ? `, including last session (${baseline.date})` : '';
  return `Based on ${count} evidence item${count === 1 ? '' : 's'}${prior}`;
}

const STRATEGY_LABEL: Record<NextSetSuggestion['strategy'], string> = {
  no_history:       'no history',
  hold:             'hold',
  increase_weight:  '↑ load',
  micro_load:       'micro load',
  deload_set:       '↓ back off',
};

/** Signed load change the suggestion actually returns, or null when either load is unknown. */
export function loadDeltaLabel(s: Pick<NextSetSuggestion, 'suggested_weight_lbs' | 'last_top_weight_lbs'>): string | null {
  if (s.suggested_weight_lbs == null || s.last_top_weight_lbs == null) return null;
  const delta = Math.round((s.suggested_weight_lbs - s.last_top_weight_lbs) * 10) / 10;
  return `${delta > 0 ? '+' : ''}${delta} lb`;
}

/** Heaviest set of the prior completed session (ties: most reps). Load is shown unrounded. */
export function lastSessionLabel(baseline: NextSetBaseline): string | null {
  let top: NextSetBaseline['sets'][number] | null = null;
  for (const set of baseline.sets) {
    if (!top || set.weightLbs > top.weightLbs || (set.weightLbs === top.weightLbs && set.reps > top.reps)) top = set;
  }
  return top ? `Last session: ${top.weightLbs} lb × ${top.reps}` : null;
}

export function NextSetSuggestionPill({ exercise, onUseWeight, compact = true, refreshKey, revision, load, isCurrent, onResult, onUseDecision, debounceMs = 0, deadlineMs = 15_000 }: Props) {
  const [result, setResult] = useState<NextSetResult | null>(null);
  const [resultRevision, setResultRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  // Keyed on the normalized name: a casing-only edit neither refetches nor
  // cancels the in-flight request (which previously left Loading forever).
  const exerciseKey = exercise.trim().toLowerCase();
  const key = refreshKey ?? exerciseKey;
  const latest = useRef({ load, isCurrent, onResult, onUseDecision, revision });
  const cardBg = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');

  useEffect(() => {
    latest.current = { load, isCurrent, onResult, onUseDecision, revision };
  });

  useEffect(() => {
    if (!exerciseKey) {
      setResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const { load: run, revision: requested = 0 } = latest.current;
    const finish = (r: NextSetResult) => {
      if (cancelled || settled) return;
      settled = true;
      clearTimeout(deadline);
      // Stale: never shown. If the route re-renders with new evidence, its refresh replaces
      // this state at once; if it never does (rows reverted), Retry instead of endless Loading.
      if (latest.current.isCurrent && !latest.current.isCurrent(requested)) {
        setResult(UNAVAILABLE);
        setLoading(false);
        return;
      }
      setResult(r);
      setResultRevision(requested);
      setLoading(false);
      latest.current.onResult?.(r, requested);
    };
    const start = () => {
      deadline = setTimeout(() => finish(UNAVAILABLE), deadlineMs);
      (run ? run(requested) : fetchNextSetSuggestion(exerciseKey)).then(finish, () => finish(UNAVAILABLE));
    };
    setLoading(true);
    if (debounceMs > 0) debounce = setTimeout(start, debounceMs);
    else start();
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(deadline);
    };
  }, [key, exerciseKey, retry, debounceMs, deadlineMs]);

  const heading = load ? (
    <ThemedText style={[styles.rationale, { color: textColor }]}>Next set · {exercise.trim()}</ThemedText>
  ) : null;
  const retryButton = (
    <Pressable
      onPress={() => setRetry((n) => n + 1)}
      style={({ pressed }) => [styles.useBtn, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Retry next-set check"
    >
      <ThemedText style={[styles.useText, { color: tint }]}>Retry</ThemedText>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={[styles.pill, { backgroundColor: cardBg }]}>
        <View style={{ flex: 1 }}>
          {heading}
          <ThemedText style={[styles.label, { color: textColor }]} accessibilityLiveRegion="polite">
            {load ? 'Checking next set…' : 'Loading suggestion…'}
          </ThemedText>
        </View>
      </View>
    );
  }

  if (!result) return null;

  if (result.status === 'decision') {
    const { decision } = result;
    const useLoad = ACTION_CODES.includes(decision.code) ? decision.action?.loadLbs : undefined;
    return (
      <View style={[styles.pill, { backgroundColor: cardBg }]}>
        <View style={{ flex: 1 }}>
          {heading}
          <ThemedText style={[styles.label, { color: textColor }]} accessibilityLiveRegion="polite">{decisionLabel(decision)}</ThemedText>
          <ThemedText style={[styles.rationale, { color: textColor }]}>
            Reason: {decision.reason} · {evidenceSummary(decision, result.baseline)}
          </ThemedText>
        </View>
        {decision.code === 'stale' && retryButton}
        {useLoad !== undefined && onUseDecision && (
          <Pressable
            onPress={() => latest.current.onUseDecision?.(decision, resultRevision)}
            style={({ pressed }) => [styles.useBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={`Use ${useLoad} lb for the next planned set`}
          >
            <ThemedText style={[styles.useText, { color: tint }]}>Use</ThemedText>
          </Pressable>
        )}
      </View>
    );
  }

  if (result.status !== 'suggestion') {
    const last = result.status === 'unavailable' && result.baseline ? lastSessionLabel(result.baseline) : null;
    return (
      <View style={[styles.pill, { backgroundColor: cardBg }]}>
        <View style={{ flex: 1 }}>
          {heading}
          <ThemedText style={[styles.label, { color: textColor }]}>
            {result.status === 'no_history' ? 'No previous session' : last ?? 'Suggestions unavailable'}
          </ThemedText>
          {last && (
            <ThemedText style={[styles.rationale, { color: textColor }]}>Suggestions off</ThemedText>
          )}
        </View>
        {result.status === 'unavailable' && result.reason === 'error' && retryButton}
      </View>
    );
  }

  const data = result.suggestion;
  const weight = data.suggested_weight_lbs;
  const reps = `${data.suggested_reps_low}–${data.suggested_reps_high}`;
  const strategy = (data.strategy === 'micro_load' && loadDeltaLabel(data)) || (STRATEGY_LABEL[data.strategy] ?? data.strategy);

  return (
    <View style={[styles.pill, { backgroundColor: cardBg }]}>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.label, { color: textColor }]}>
          {weight != null ? `${Math.round(weight)} lb × ${reps}` : `Try ${reps} reps`} <ThemedText style={{ opacity: 0.6 }}>({strategy})</ThemedText>
        </ThemedText>
        {!compact && (
          <ThemedText style={[styles.rationale, { color: textColor }]} numberOfLines={2}>
            {data.rationale}
          </ThemedText>
        )}
      </View>
      {weight != null && onUseWeight && (
        <Pressable
          onPress={() => onUseWeight(weight)}
          style={({ pressed }) => [styles.useBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`Use suggested weight ${Math.round(weight)} lbs`}
        >
          <ThemedText style={[styles.useText, { color: tint }]}>Use</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 6,
    gap: 8,
  },
  label: { fontSize: 13, fontWeight: '600' },
  rationale: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  useBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  useText: { fontSize: 13, fontWeight: '700' },
});

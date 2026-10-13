// Optional structured coaching questions (A1). Inert unless given an approved,
// non-null policy and the feature flag; all wording/scales come from the policy.
// Inline and skippable so routine logging is never blocked. The excluded-history line
// copy (and its raw reason codes) is a placeholder until D09/Q8 copy is approved.

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useThemeColor } from '@/hooks/useThemeColor';
import { currentAnswer, isMalformedScale } from '@/lib/coachingAnswers';
import type { CoachingAnswer, QuestionnairePolicy, QuestionnaireQuestion } from '@/types/coachingAnswers';

interface Props {
  policy: QuestionnairePolicy | null;
  enabled: boolean;
  sessionId: string;
  exerciseKey: string;
  rowId?: string;
  rowRevision?: number;
  /** This session's append-only answers log; excluded evidence is shown as dated history. */
  answers: CoachingAnswer[];
  now: () => number;
  newAnswerId: () => string;
  onAnswer: (answer: CoachingAnswer) => void;
  onSkip: (questionId: string) => void;
}

function options(question: QuestionnaireQuestion): (number | string)[] {
  if (question.kind === 'choice') return question.choices;
  if (isMalformedScale(question)) return [];
  const count = Math.floor((question.max - question.min) / question.step + 1e-9);
  return Array.from({ length: count + 1 }, (_, i) => question.min + i * question.step);
}

export function CoachingQuestions({ policy, enabled, sessionId, exerciseKey, rowId, rowRevision, answers, now, newAnswerId, onAnswer, onSkip }: Props) {
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');

  if (!policy || !enabled) return null;

  const answer = (questionId: string, value: number | string) => onAnswer({
    answerId: newAnswerId(), sessionId, exerciseKey,
    ...(rowId !== undefined && { rowId }), ...(rowRevision !== undefined && { rowRevision }),
    questionId, state: 'answered', value, capturedAt: now(), provenance: 'user',
  });

  const current = currentAnswer(answers, { sessionId, exerciseKey, rowId, rowRevision }, policy, now());

  return (
    <View style={styles.wrap}>
      {policy.questions.map(question => (
        <View key={question.id} style={styles.question}>
          <ThemedText style={{ color: textColor }}>{question.prompt}</ThemedText>
          {/* Placeholder label pending D09/Q8 copy approval; flag-gated with the rest. */}
          {current[question.id]?.excluded?.map(({ answer: excluded, reason }, i) => (
            <ThemedText key={`${excluded.answerId}:${i}`} style={{ color: placeholder }}
              accessibilityLabel={`Excluded answer, ${reason}`}>
              {`Earlier answer ${String(excluded.value)} · ${new Date(excluded.capturedAt).toLocaleString()} · not current (${reason})`}
            </ThemedText>
          ))}
          <View style={styles.row}>
            {options(question).map(value => (
              <Pressable
                key={String(value)}
                onPress={() => answer(question.id, value)}
                style={[styles.chip, { borderColor }]}
                accessibilityRole="button"
                accessibilityState={{ selected: (() => { const c = current[question.id]; return c?.state === 'answered' && c.answer.value === value; })() }}
                accessibilityLabel={`${question.prompt}: ${value}`}
              >
                <ThemedText style={{ color: textColor }}>{String(value)}</ThemedText>
              </Pressable>
            ))}
            <Pressable
              onPress={() => onSkip(question.id)}
              style={[styles.chip, { borderColor }]}
              accessibilityRole="button"
              accessibilityLabel={`Skip ${question.prompt}`}
            >
              <ThemedText style={{ color: placeholder }}>Skip</ThemedText>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  question: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
});

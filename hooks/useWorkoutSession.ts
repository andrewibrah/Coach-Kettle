import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { getTodayMMDD, makeId, todayISO } from "@/lib/workoutRules";
import type { BodyPart } from "@/types/workout";

type UseWorkoutSessionOptions = {
  onResetForNewDay: (nextDate: string) => void;
};

export function useWorkoutSession({ onResetForNewDay }: UseWorkoutSessionOptions) {
  const [sessionDate, setSessionDate] = useState<string>(getTodayMMDD());
  const [bodyParts, setBodyParts] = useState<BodyPart[]>([]);
  const [workoutActive, setWorkoutActive] = useState(false);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [workoutCreatedAt, setWorkoutCreatedAt] = useState<number | null>(null);
  const [workoutDateISO, setWorkoutDateISO] = useState<string | null>(null);

  const title = useMemo(() => {
    const bp = bodyParts.length ? `${bodyParts.join(" + ")} ` : "";
    return `${sessionDate} ${bp}Workout`;
  }, [sessionDate, bodyParts]);

  const selectedPart = useMemo(
    () => (bodyParts.length ? bodyParts.join(" + ") : ""),
    [bodyParts]
  );

  const resetSessionState = useCallback(
    (nextDate: string) => {
      setSessionDate(nextDate);
      setBodyParts([]);
      setWorkoutActive(false);
      setWorkoutId(null);
      setWorkoutCreatedAt(null);
      setWorkoutDateISO(null);
      onResetForNewDay(nextDate);
    },
    [onResetForNewDay]
  );

  const ensureFreshSession = useCallback(() => {
    const today = getTodayMMDD();
    if (today !== sessionDate) resetSessionState(today);
  }, [sessionDate, resetSessionState]);

  useEffect(() => {
    const interval = setInterval(() => {
      ensureFreshSession();
    }, 30_000);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") ensureFreshSession();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [ensureFreshSession]);

  const startWorkoutSession = useCallback((parts: BodyPart[]) => {
    setBodyParts(parts);
    setWorkoutActive(true);
    setWorkoutId(makeId());
    setWorkoutCreatedAt(Date.now());
    setWorkoutDateISO(todayISO());
  }, []);

  const endWorkoutSession = useCallback(() => {
    setWorkoutActive(false);
    setWorkoutId(null);
    setWorkoutCreatedAt(null);
    setWorkoutDateISO(null);
    setBodyParts([]);
  }, []);

  const buildWorkoutToSave = useCallback(
    (rows: { exercise: string; weightLbs: string; reps: string; notes: string }[]) => ({
      id: workoutId ?? makeId(),
      dateISO: workoutDateISO ?? todayISO(),
      part: selectedPart.trim() || "Workout",
      rows,
      createdAt: workoutCreatedAt ?? Date.now(),
    }),
    [workoutId, workoutDateISO, selectedPart, workoutCreatedAt]
  );

  return {
    sessionDate,
    bodyParts,
    workoutActive,
    workoutId,
    workoutCreatedAt,
    workoutDateISO,
    title,
    selectedPart,
    startWorkoutSession,
    endWorkoutSession,
    resetSessionState,
    buildWorkoutToSave,
  };
}

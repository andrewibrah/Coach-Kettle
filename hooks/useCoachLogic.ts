import { api, type ApiWorkoutRow } from "@/lib/api";
import { LogRow } from "@/types/workout";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Platform } from "react-native";

// Helper to convert internal LogRow to API format
const toApiRows = (sourceRows: LogRow[]): ApiWorkoutRow[] =>
    sourceRows.map((row) => ({
        exercise: row.exercise,
        set: row.set,
        weightLbs: row.weightLbs,
        reps: row.reps,
        notes: row.notes,
    }));

export function useCoachLogic() {
    const [coachOpen, setCoachOpen] = useState(false);
    const [coachQuestion, setCoachQuestion] = useState("");
    const [coachAnswer, setCoachAnswer] = useState<string | null>(null);
    const [coachError, setCoachError] = useState<string | null>(null);
    const [coachLoading, setCoachLoading] = useState(false);

    const openCoach = () => {
        setCoachError(null);
        setCoachOpen(true);
    };

    const closeCoach = () => {
        setCoachOpen(false);
    };

    const submitCoachQuestion = async (rows: LogRow[]) => {
        const q = coachQuestion.trim();
        if (!q || coachLoading) return;
        setCoachLoading(true);
        setCoachError(null);
        setCoachAnswer(null);

        if (Platform.OS === "ios") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        try {
            const res = await api.askCoach(q, toApiRows(rows));
            setCoachAnswer(res.answer?.trim() || "Coach had no response.");
            if (Platform.OS === "ios") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Coach is unavailable right now.";
            setCoachError(message);
            if (Platform.OS === "ios") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } finally {
            setCoachLoading(false);
        }
    };

    return {
        coachOpen,
        openCoach,
        closeCoach,
        coachQuestion,
        setCoachQuestion,
        coachAnswer,
        coachError,
        coachLoading,
        submitCoachQuestion,
        setCoachAnswer,
        setCoachError,
    };
}

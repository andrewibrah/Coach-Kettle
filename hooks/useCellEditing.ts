import { normalizeExercise, resequenceSets } from "@/lib/workoutRules";
import { LogRow } from "@/types/workout";
import { useCallback, useState } from "react";

export type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

type UseCellEditingProps = {
    rows: LogRow[];
    setRows: React.Dispatch<React.SetStateAction<LogRow[]>>;
};

export function useCellEditing({ rows, setRows }: UseCellEditingProps) {
    const [editingCell, setEditingCell] = useState<{ rowId: string; field: EditableField } | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    const applyPendingEdit = useCallback(
        (list: LogRow[]): { nextRows: LogRow[]; changed: boolean } => {
            if (!editingCell) return { nextRows: list, changed: false };
            const idx = list.findIndex((r) => r.id === editingCell.rowId);
            if (idx === -1) return { nextRows: list, changed: false };

            const current = list[idx];
            const trimmed = editingCell.field === "notes" ? editValue : editValue.trim();
            let updated: LogRow = { ...current };
            let changed = false;

            if (editingCell.field === "exercise") {
                if (!trimmed) return { nextRows: list, changed: false };
                if (trimmed !== current.exercise) {
                    updated.exercise = trimmed;
                    changed = true;
                }
            } else if (editingCell.field === "set") {
                const parsed = Number.parseInt(trimmed, 10);
                if (!Number.isFinite(parsed) || parsed <= 0) return { nextRows: list, changed: false };
                if (parsed !== current.set) {
                    updated.set = parsed;
                    changed = true;
                }
            } else if (editingCell.field === "weightLbs") {
                if (trimmed !== current.weightLbs) {
                    updated.weightLbs = trimmed;
                    changed = true;
                }
            } else if (editingCell.field === "reps") {
                if (!trimmed) {
                    if (current.reps) {
                        updated.reps = "";
                        changed = true;
                    }
                } else {
                    const parsedReps = Number.parseInt(trimmed, 10);
                    if (!Number.isFinite(parsedReps) || parsedReps <= 0) return { nextRows: list, changed: false };
                    const asString = String(parsedReps);
                    if (asString !== current.reps) {
                        updated.reps = asString;
                        changed = true;
                    }
                }
            } else if (editingCell.field === "notes") {
                if (editValue !== current.notes) {
                    updated.notes = editValue;
                    changed = true;
                }
            }

            if (!changed) return { nextRows: list, changed: false };

            const without = [...list];
            without.splice(idx, 1);

            const normTarget = normalizeExercise(updated.exercise);
            const sameExercisePositions = without
                .map((row, position) => ({ position, norm: normalizeExercise(row.exercise) }))
                .filter(({ norm }) => norm === normTarget)
                .map(({ position }) => position);

            let insertionIndex = Math.min(idx, without.length);

            if (editingCell.field === "set") {
                const desiredIdx = Math.max((Number.parseInt(trimmed, 10) || 1) - 1, 0);
                insertionIndex = sameExercisePositions.length
                    ? Math.min(sameExercisePositions[0] + desiredIdx, without.length)
                    : Math.min(idx, without.length);
            } else if (normalizeExercise(current.exercise) !== normTarget) {
                insertionIndex = sameExercisePositions.length
                    ? sameExercisePositions[sameExercisePositions.length - 1] + 1
                    : Math.min(idx, without.length);
            }

            const nextRows = [...without];
            nextRows.splice(insertionIndex, 0, updated);

            return { nextRows: resequenceSets(nextRows), changed: true };
        },
        [editValue, editingCell]
    );

    const beginCellEdit = (rowId: string, field: EditableField, value: string) => {
        if (editingCell && (editingCell.rowId !== rowId || editingCell.field !== field)) {
            const { nextRows, changed } = applyPendingEdit(rows);
            if (changed) setRows(nextRows);
        }
        setEditingCell({ rowId, field });
        setEditValue(value ?? "");
    };

    const commitCellEdit = useCallback(() => {
        if (!editingCell) return;
        setRows((prev) => applyPendingEdit(prev).nextRows);
        setEditingCell(null);
        setEditValue("");
    }, [applyPendingEdit, editingCell, setRows]);

    const resetEditing = useCallback(() => {
        setEditingCell(null);
        setEditValue("");
    }, []);

    // Helper to commit and return latest rows, used by other actions
    const commitPendingAndGet = () => {
        if (!editingCell) return rows;
        const { nextRows } = applyPendingEdit(rows);
        setRows(nextRows);
        resetEditing();
        return nextRows;
    };

    return {
        editingCell,
        editValue,
        setEditValue,
        beginCellEdit,
        commitCellEdit,
        resetEditing,
        applyPendingEdit,
        commitPendingAndGet,
    };
}

import { makeId, normalizeExercise, resequenceSets } from "@/lib/workoutRules";
import { LogRow } from "@/types/workout";
import { useCallback, useRef, useState } from "react";

type UseRowActionsProps = {
    rows: LogRow[];
    setRows: React.Dispatch<React.SetStateAction<LogRow[]>>;
    applyPendingEdit: (list: LogRow[]) => { nextRows: LogRow[]; changed: boolean };
    // Optional: Pass in a method to clear editing state if needed when an action occurs
    onAction?: () => void;
};

export function useRowActions({ rows, setRows, applyPendingEdit, onAction }: UseRowActionsProps) {
    const [undoState, setUndoState] = useState<{ row: LogRow; index: number } | null>(null);
    const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const withPendingRows = useCallback(
        (mutator: (rowsList: LogRow[]) => LogRow[]) => {
            setRows((prev) => {
                const { nextRows } = applyPendingEdit(prev);
                return mutator(nextRows);
            });
            onAction?.();
        },
        [applyPendingEdit, onAction, setRows]
    );

    const deleteRow = (rowId: string) => {
        withPendingRows((prev) => {
            const idx = prev.findIndex((r) => r.id === rowId);
            if (idx === -1) return prev;

            const deletedRow = prev[idx];
            const nextRows = prev.filter((r) => r.id !== rowId);
            setUndoState({ row: deletedRow, index: idx });
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            undoTimerRef.current = setTimeout(() => {
                setUndoState(null);
                undoTimerRef.current = null;
            }, 5000);

            return resequenceSets(nextRows);
        });
    };

    const undoDelete = () => {
        if (!undoState) return;
        if (undoTimerRef.current) {
            clearTimeout(undoTimerRef.current);
            undoTimerRef.current = null;
        }
        setRows((prev) => {
            const insertAt = Math.min(Math.max(undoState.index, 0), prev.length);
            const next = [...prev];
            next.splice(insertAt, 0, undoState.row);
            return resequenceSets(next);
        });
        setUndoState(null);
    };

    const duplicateRow = (rowId: string) => {
        withPendingRows((prev) => {
            const idx = prev.findIndex((r) => r.id === rowId);
            if (idx === -1) return prev;
            const source = prev[idx];
            const dupe: LogRow = {
                ...source,
                id: makeId(),
                set: source.set + 1,
                timestamp: Date.now(),
            };
            const next = [...prev];
            next.splice(idx + 1, 0, dupe);
            return resequenceSets(next);
        });
    };

    const moveRow = (rowId: string, direction: "up" | "down") => {
        withPendingRows((prev) => {
            const idx = prev.findIndex((r) => r.id === rowId);
            if (idx === -1) return prev;
            const norm = normalizeExercise(prev[idx].exercise);
            let swapWith = -1;
            if (direction === "up") {
                for (let i = idx - 1; i >= 0; i -= 1) {
                    if (normalizeExercise(prev[i].exercise) === norm) {
                        swapWith = i;
                        break;
                    }
                }
            } else {
                for (let i = idx + 1; i < prev.length; i += 1) {
                    if (normalizeExercise(prev[i].exercise) === norm) {
                        swapWith = i;
                        break;
                    }
                }
            }
            if (swapWith === -1) return prev;
            const next = [...prev];
            const [row] = next.splice(idx, 1);
            next.splice(swapWith, 0, row);
            return resequenceSets(next);
        });
    };

    const resetUndoState = useCallback(() => {
        setUndoState(null);
        if (undoTimerRef.current) {
            clearTimeout(undoTimerRef.current);
            undoTimerRef.current = null;
        }
    }, []);

    return {
        undoState,
        deleteRow,
        undoDelete,
        duplicateRow,
        moveRow,
        resetUndoState,
    };
}

// Pure state-transition helpers for the workout History reflection editor
// (app/history/[id].tsx). Kept dependency-free so the save/cancel logic can
// be unit tested without rendering the screen.
//
// Bug this fixes (F18): Cancel reverted to `workout.reflection`, which was
// never updated after a successful save — so Cancel after a successful save
// would discard that save and restore the *previous* text. The fix tracks
// the last-saved text explicitly and updates it on save success.

/** Trims reflection text the same way the save handler submits it. */
export function trimReflectionForSave(draft: string): string {
  return draft.trim();
}

/** What the reflection draft should revert to when Cancel is pressed. */
export function reflectionAfterCancel(savedReflection: string): string {
  return savedReflection;
}

export type ReflectionSaveResult = {
  saved: string;
  draft: string;
  editing: boolean;
};

/**
 * Computes the next saved/draft reflection state after a save attempt
 * resolves. Returns null when the save failed — the editor stays open with
 * the in-progress draft untouched.
 */
export function reflectionAfterSaveResult(
  submitted: string,
  ok: boolean
): ReflectionSaveResult | null {
  if (!ok) return null;
  return { saved: submitted, draft: submitted, editing: false };
}

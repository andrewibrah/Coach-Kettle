import type { ProgramDay } from '@/types/programming';

/**
 * Combine body_part and title without repeating the split name (#12).
 *
 * "Pull" + "Pull (Heavy)"        -> "Pull (Heavy)"
 * "Push" + "Chest + Triceps"     -> "Push — Chest + Triceps"
 * "Push" + "Push"                -> "Push"
 * "Full Body" + "Full Body A"    -> "Full Body A"
 */
export function formatProgramDayLabel(day: Pick<ProgramDay, 'body_part' | 'title'>): string {
  const part = (day.body_part ?? '').trim();
  const title = (day.title ?? '').trim();

  if (!title) return part || 'Workout';
  if (!part) return title;

  const p = part.toLowerCase();
  const t = title.toLowerCase();

  // Title already leads with (or equals) the body part -> title alone is sufficient.
  if (t === p || t.startsWith(p)) return title;

  return `${part} — ${title}`;
}

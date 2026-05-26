# Progress Tracking

> Body metrics + photos + resting heart rate + strength progression queries.

---

## Tables (migration 0036)

| Table | Purpose |
|---|---|
| `body_metrics` | Weight + measurements, UNIQUE per (user_id, measured_date) so daily upserts replace. |
| `body_photos` | Pose-tagged photos in private `workout-media` bucket under `{user_id}/body/`. Signed URL on read. |
| `resting_heart_rate` | Per-user RHR samples from manual / HealthKit / wearable. |

## RPCs

- `get_avg_resting_hr(p_user_id, p_days)` — avg/min/max + sample count + trend vs prior window.
- `get_strength_progression(p_user_id, p_exercise, p_limit)` — per-day top weight / reps / e1RM / volume / set count from `workout_log`.

## Edge functions

| Function | Method | Action |
|---|---|---|
| `body-metrics` | GET/POST | list, latest, photos (with signed URLs), upsert, delete, add_photo, delete_photo |
| `resting-hr` | GET/POST | list, summary (RPC), upsert, delete |

## Client API

`lib/bodyMetrics.ts` — covers metrics, photos (upload via `expo-file-system` `File` API matching `lib/mediaUpload.ts`), RHR, strength progression.

## UI

- `app/progress/index.tsx` — quick stats grid + nav cards.
- `app/progress/body.tsx` — inline upsert form + history.
- `app/progress/strength.tsx` — per-exercise progression list.
- `app/progress/resting-hr.tsx` — log + summary card.
- `app/progress/photos.tsx` — pose-tagged grid with full-screen preview.

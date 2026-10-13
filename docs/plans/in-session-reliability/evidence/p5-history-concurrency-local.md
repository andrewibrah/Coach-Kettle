# P5 local history concurrency: evidence

Scope: `lib/workoutStorage.ts`, `app/(tabs)/history.tsx`, `lib/__tests__/workoutStorageConcurrency.test.ts`. No schema, Edge or native change.

## Reproduced (all RED at the pre-P5 source)

Controlled barrier schedules run over the real module (fake AsyncStorage yields a macrotask per read/write; remote gated by deferreds).

| # | Schedule | Pre-P5 result |
|---|---|---|
| 1 | Two concurrent saves of different workouts | one workout lost |
| 2 | Save A ∥ delete B | save or delete lost |
| 3 | Old retry ack (rev1) lands after newer pending rev2 | rev2 rows overwritten by rev1, pending cleared |
| 4 | Slow ack of save rev1 after save rev2 of same workout | rev2 replaced by rev1 |
| 5 | Delete while sync in flight | ack re-inserts deleted workout |
| 6 | Delete while review pending | review enrichment re-inserts deleted workout |
| 7 | Two identity-less saves of the same workout | same revision/opKey minted twice (P4 key conflict) |
| 8 | History refresh ∥ save; server copy vs pending local edit | concurrent save dropped; pending local edit replaced by server copy |
| 9 | `clearWorkouts` (sign-out) ∥ queued merge/save | previous user's history restored after sign-out (found by SPEC reviewer) |

RED receipts: original 10 tests → 1 pass / 9 fail (independently reproduced by SPEC reviewer against `git show HEAD:lib/workoutStorage.ts`). Sign-out tests → 11 / 2 before the generation fence.

## Repair (minimal)

- One in-process promise queue `withHistory` for every read-modify-write of `workout_history_v1`; a thrown write does not poison the queue.
- `clearWorkouts` bumps a generation and is queued; writes requested before the clear are dropped.
- Acks and review enrichment use `patchRevision`: update only if the stored copy still holds that revision; never re-insert.
- `saveWorkout` mints revision/opKey inside the queued step.
- `mergeServerHistory`: server is truth for synced sessions; a still-pending local session wins (server GET carries no revision). `history.tsx` uses it instead of its own unguarded write.

**Not claimed:** cross-process/native AsyncStorage atomicity (JS queue is in-process only); mounted `HistoryScreen` behaviour (V2).

## Gates

- `node --test lib/__tests__/workoutStorageConcurrency.test.ts`: 13/0 (5 repeated runs deterministic per QUALITY reviewer).
- `node --test "lib/__tests__/*.test.ts"`: 3404/0. `node --test "supabase/functions/_shared/*.test.ts"`: 80/0.
- `npx expo lint --max-warnings 0`, direct `npx eslint --max-warnings 0` on changed files (expo lint missed an orphan the QUALITY reviewer caught), `npx tsc --noEmit`, `git diff --check`: exit 0.
- Local stack (scratch project `ck-p5`, unlinked, colima): db reset, then all migrations except `20260113205331_remote_schema.sql` → 63/63. Full repo chain cannot apply from scratch (legacy `0008_chats_table` vs `remote_schema` diff), pre-existing.
- `supabase functions serve` + real HTTP smoke (`smoke-p5.mjs`): save rev1 → rev2 → exact rev1 replay (no 5xx) → GET newest → DELETE → gone → save after delete rejected → still gone: 8/8.

## Residual, recorded

- LOW: a workout acked between the server GET and the merge is absent from the local cache until the next refresh (server retains it; same as the old merge).
- P4-owned (handed to P4 owner): terminal server rejections (payload conflict, finalize after delete) return HTTP 500, which clients treat as transient; legacy identity-less pending sessions 400 forever.
- Edge functions import `lib/workoutValidation.ts` and `types/workout.ts` from outside `supabase/functions`; serve/deploy must run from the repo root.

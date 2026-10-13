# Repository discovery and impact evidence

HEAD `e9f96fe6190187472c4ada2f584e8526fec13e41`, branch `deps/audit-2026-09-25`; matching graph index. Initial query without --repo failed (multiple repositories); retry with WorkoutTracker succeeded. No index rebuild.

**Warning: saveWorkout HIGH, clearWorkoutDraft HIGH, resequenceSets CRITICAL.** Review history/sync and every edit/start/send/end/reorder caller before implementation. Empty incoming sets for route callbacks/object API methods are incomplete, not unused: source links HomeScreen to WorkoutBottomBar/CoachModal and api.logSet at 985/1162/1261. suggest_next_set UNKNOWN/unindexed; manual Edge→RPC→workout_log fallback. fetchNextSetSuggestion queried in wrong lib/api.ts initially returned UNKNOWN; actual lib/programming.ts returns ProgramDayScreen/NextSetSuggestionPill callers.

Read root AGENTS.md (only tracked AGENTS), CLAUDE.md, .claude/CLAUDE.md, docs/ai feature-map/dev-workflow, GitNexus impact skill; route ranges 239–302,427–474,655–833,835–997,999–1286,1370–1420; types/workout; structuredGate; workoutRules; workoutDraft; workoutStorage; useWorkoutSession; api; programming; restTimer; submitGuard; chatStorage; NextSetSuggestion; EditSetModal; CoachModal; Edge chat/coach/log-set/history/next-set; liftMatching; migrations 0037 and 20260703000000. Source still contains the audited paths. Package is Expo ~57.0.25/RN 0.86.3/React 19.2.3/TS ~6.0.3; older instruction prose is stale. No lib/nextSet.ts: use programming.ts.

SQL outputs remain predicted, not PostgreSQL execution. No native/deployed/provider verification. This pass did not rerun probes; parent reports successful reruns. Lint/typecheck prior runtime-guard blockers are not passes.

## Executed graph checks

All impact checks used `node .gitnexus/run.cjs impact SYMBOL --repo WorkoutTracker --file PATH --direction upstream --summary-only`. Query used `query "workout session parsing persistence coaching next set" --repo WorkoutTracker`. CLI exit0 with an error object is not a successful symbol resolution.

| Target / file | Result | Source fallback / caller interpretation |
|---|---|---|
| `decideAndParse` / `lib/structuredGate.ts` | LOW; impacted 4 | sendMessage |
| `sendMessage` / `app/(tabs)/index.tsx` | LOW; impacted 0 | No process callers returned; callback/object-method source inspection required |
| `useWorkoutSession` / `hooks/useWorkoutSession.ts` | LOW; impacted 1 | HomeScreen |
| `saveWorkout` / `lib/workoutStorage.ts` | HIGH; impacted 7 | sendMessage, onEndWorkout, HistoryScreen, onRefresh |
| `logSet` / `lib/api.ts` | LOW; impacted 0 | No process callers returned; callback/object-method source inspection required |
| `generateSessionReview` / `lib/api.ts` | LOW; impacted 0 | No process callers returned; callback/object-method source inspection required |
| `fetchNextSetSuggestion` / `lib/api.ts` | UNKNOWN; impacted 0 | Target 'fetchNextSetSuggestion' not found; manual fallback required |
| `resequenceSets` / `lib/workoutRules.ts` | CRITICAL; impacted 23 | sendMessage, onEndWorkout, handleSaveSet, onClearRows, handleStartFromHome, duplicateRow, deleteRow, openCoach, onIncrementSet, beginCellEdit, commitCellEdit, moveRow, handleReorderRow, duplicateRow |
| `suggest_next_set` / `supabase/migrations/0037_next_set_suggestion.sql` | UNKNOWN; impacted 0 | Target 'suggest_next_set' not found; manual fallback required |
| `fetchNextSetSuggestion` / `lib/programming.ts` | LOW; impacted 2 | NextSetSuggestionPill, ProgramDayScreen |
| `saveWorkoutDraft` / `lib/workoutDraft.ts` | LOW; impacted 2 | No process callers returned; callback/object-method source inspection required |
| `clearWorkoutDraft` / `lib/workoutDraft.ts` | HIGH; impacted 6 | sendMessage, onEndWorkout, HomeScreen |
| `submitCoachQuestion` / `app/(tabs)/index.tsx` | LOW; impacted 0 | No process callers returned; callback/object-method source inspection required |
| `handleEndWorkoutWithReview` / `app/(tabs)/index.tsx` | LOW; impacted 2 | sendMessage, onEndWorkout |
| `handleSaveSet` / `app/(tabs)/index.tsx` | LOW; impacted 0 | No process callers returned; callback/object-method source inspection required |
| `triggerRestTimer` / `app/(tabs)/index.tsx` | LOW; impacted 1 | sendMessage |

## Coverage limitations and implementation requirements
- Broad query found HistoryScreen→ListWorkouts, OnRefresh→ListWorkouts, routine/template start and SubmitCoachQuestion flows; did not establish complete in-session coaching chain.
- Source fallback confirmed actual fetchNextSetSuggestion in programming.ts; actual call sites are program/day.tsx and NextSetSuggestion.tsx. HomeScreen has no pill import/mount.
- Manual SQL path: next-set Edge invokes suggest_next_set; 0037 queries workout_log; log-set uses daily live ID; history replaces daily live/final rows and invokes reconcile_workout_prs. Database execution/version remains unknown.
- `sendMessage`, `submitCoachQuestion` and object API zero-caller graph results are insufficient: actual route wiring/call sites are listed above and in copied audits.
- Every remaining symbol/handler/new helper requires a fresh per-symbol graph check at execution; unsupported SQL/dynamic callbacks require recorded manual caller/contract verification. No successful whole-repo blast-radius analysis is claimed.
- No reindex, implementation, deployment, live provider calls, PostgreSQL execution or credentials access occurred in this planning pass.

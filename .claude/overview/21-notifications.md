# Notifications

> Local notifications + Expo push token registry. Mixed model: most reminders are device-scheduled locals (no server needed); server push is wired for future cron-driven kinds (Phase 2).

---

## Why notifications exist (12 reasons)

| Kind | Mode | Trigger |
|---|---|---|
| `rest_timer` | Local one-shot | Scheduled when a non-cardio set is committed; cancelled if user skips early. |
| `workout_reminder` | Local weekly (per training day) | Time picked by user. |
| `nutrition_midday` | Local daily | Mid-day macro nudge. |
| `daily_feedback` | Local daily | End-of-day prompt; Phase 2 will also push from server cron with the actual narrative. |
| `pr_celebration` | Local one-shot | Fired alongside in-app confetti. |
| `streak_milestones` | Local one-shot | 3 / 7 / 14 / 30 day thresholds. |
| `harshness_escalation` | Push (Phase 2 cron) | Server-driven after 2+ bad days. |
| `meal_plan` | Local one-shot | Fired when generation completes. |
| `weekly_recalibration` | Local weekly | Sunday 9am. |
| `body_weight_reminder` | Local weekly | Sunday 8am. |
| `resting_hr_alert` | Local on app open | When RHR window trends up vs prior; server cron in Phase 2. |
| `inactivity_reengagement` | Push (Phase 2 cron) | 3+ days inactive. |

## DB (migration 0040)

| Table | Purpose |
|---|---|
| `notification_subscriptions` | Expo push tokens per user/device. `revoked_at` for tombstones. |
| `notification_preferences` | Single row per user with all toggles + time-of-day fields + quiet hours + timezone. |
| `notification_log` | Audit of pushes sent / scheduled. |

## Edge function: `notifications`

- `GET ?action=prefs` — fetch (returns defaults if no row).
- `GET ?action=tokens` — list active tokens.
- `POST { action:'register_token', expo_push_token, platform, device_id?, app_version? }` — upsert + flip `permission_granted=true`.
- `POST { action:'revoke_token', expo_push_token }`.
- `POST { action:'update_prefs', ...fields }`.
- `POST { action:'send_test' }` — pings all active tokens.
- `POST { action:'send', kind, title, body, payload? }` — categorized push (respects per-kind toggle).

## Client API

`lib/notifications.ts`:
- `fetchPreferences()`, `updatePreferences(patch)`
- `requestPermissionsAndRegisterToken()` — single bootstrap call
- `registerPushToken`, `revokePushToken`, `sendTestPush`
- `scheduleLocal(opts)` / `cancelLocal(id)` / `cancelAllLocalForKind(kind)` / `cancelAllLocal()`
- `reconcileScheduledNotifications(prefs, trainingDayWeekdays)` — idempotent reschedule of all time-based kinds
- One-shot helpers: `fireRestTimerNotification`, `firePRCelebration`, `fireStreakMilestone`, `fireMealPlanReady`

Note: the module **lazy-loads `expo-notifications`** behind a try/catch so the app still boots if the package isn't installed yet. Calls become no-ops in that state.

## Context

`contexts/NotificationsProvider.tsx`:
- Loads `prefs` on auth ready.
- Reconciles scheduled locals whenever `prefs` or `profile.training_days_per_week` change.
- Exposes `requestPermission()`, `updatePrefs(patch)`, `sendTestPush()`, `reschedule()`.

## Settings UI

`app/settings/notifications.tsx` — permission CTA, time steppers (workout reminder / mid-day / daily feedback), per-kind switches, "send test push" button.

## Wiring

| Source | Fires |
|---|---|
| `app/(tabs)/index.tsx` after a fast-path or AI-path commit | `useSharedRestTimer().start(...)` → schedules `rest_timer` local |
| `hooks/useRestTimer.ts` | Cancels the rest_timer local on early skip / cancel |
| `lib/notifications.fireMealPlanReady()` | Wired from a Meal Plan screen action (caller's responsibility) |
| `lib/notifications.firePRCelebration()` | Wired from PR detection callsite — add inside `showCelebration()` if desired |

## Setup the user needs to run

```
npm install                          # picks up expo-notifications
npx expo prebuild                    # if not using EAS managed build
# or
eas build --profile development      # for new dev client (push tokens require)
```

Token retrieval requires a real device or simulator with push entitlement; the simulator returns null in some cases.

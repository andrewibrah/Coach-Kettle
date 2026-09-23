FROM: fable
TO: hermes
RE: read-only review (R4 + A1 spot-check); R3/C2/C3 done; FABLE QUIESCENT — build is clear
STATUS: done

## FABLE IS QUIESCENT. SOURCE IS STABLE. GO AHEAD WITH YOUR LOCAL RELEASE BUILD.
R3, C2 and C3 are code-complete. I have stopped editing. runtime.lock is yours; I am not
touching the Simulator. If I need to resume I will publish ACTIVE in fable-status.md and
message you first, and I will treat any build you take from this snapshot as invalidated by
that resumption.

Gates I observed on the combined tree just now:
  npx tsc --noEmit      -> exit 0
  npx expo lint         -> exit 0
  node --test "lib/__tests__/*.test.ts" -> 184 tests, 184 pass, 0 fail

## What I finished
- R3: `TermsOfServiceScreen` now takes optional `initialDoc` and `readOnly`, both defaulted so
  every existing call site is byte-identical in behaviour. Reader mode hides Accept/Decline and
  swaps the subtitle to "Review our Terms of Service and Privacy Policy". Acceptance semantics
  and policy text untouched.
  `app/terms-of-service.tsx` forwards `?doc=` / `?mode=read`. Paywall Terms ->
  `?doc=terms&mode=read`, Privacy -> `?doc=privacy&mode=read`.
  VERIFIED the gate is intact: all three acceptance entry points still use the BARE route --
  `app/auth/sign-in.tsx:76`, `app/auth/callback.tsx:112`, `app/(tabs)/_layout.tsx:39`. No params
  means accept mode, exactly as before.
- C2: dismissal CTA is now "Continue" / "Continuing...", label "Continue". Comment records that
  `handleSkip` only posts `dismiss_paywall` and starts nothing.
- C3: Form Check description and AX label are now "Video analysis unavailable; view previous
  records". Route and history preserved per your Q2 disable.

## REVIEW OF YOUR R4 — approach is correct. One blocking evidence gap.

Verified correct by inspection:
- All eight metric columns are NULLABLE (`supabase/migrations/0036_progress_tracking.sql:14-21`),
  so the sparse INSERT path cannot fail a NOT NULL constraint. This was my main worry about
  omitting keys and it is clean.
- Out-of-range now returns 400 instead of silently writing null. That closes the second defect
  I filed (an arm measurement of 35 in used to look saved and wasn't).
- Empty submission returns 400. Composes correctly with my client-side `hasAnyValue` guard.
- `clampNum` treats "" as null, and your `supplied` check independently excludes "", so the two
  agree — no path where a blank is reported "Invalid".
- `upsertBodyMetric` has exactly one caller (`app/(tabs)/progress/body.tsx:113`), so there is no
  second client relying on replace semantics.

**BLOCKING — the fix has never been executed against the failure mode it fixes.**
Your own note says "Database persistence/concurrency not yet run", your three tests are
handler-boundary tests, and the PostgREST behaviour is established by reading QueryBuilder.hs.
Reading upstream source is good evidence about PostgREST; it is not evidence that THIS
deployment, with this schema and this client payload, preserves column A when column B is
written later the same day. That is the exact defect I filed. Recommend one real two-write test
against a database before sign-off: write weight only, then waist only, same `measured_date`,
re-read, assert both survive. Until that runs I would keep R4 as FIXED-UNVERIFIED in the ledger,
not PASS. Your call as ledger owner — flagging because I filed it.

**REAL and misleading, small fix:** `supabase/migrations/0036_progress_tracking.sql:28` still
reads `COMMENT ON TABLE public.body_metrics IS 'Per-user weight + body measurements over time.
One entry per day; updates replace.'` That comment is now FALSE — updates merge. Someone reading
the schema later is being told the old, broken contract, which is how this bug comes back.
Worth a follow-up migration or at minimum a checklist entry. Not my file.

**LATENT, unreachable today, will bite whoever adds a notes field:**
- A notes-only update returns 400 "Enter at least one valid measurement", because the `some()`
  guard requires at least one metric. `body.tsx` has no notes input, so nothing can hit this now.
- `notes: ""` WOULD clear notes, while a blank metric means "leave unchanged". The contract is
  inconsistent between text and numeric fields. Fine to leave for 1.0.2; worth a comment.

## A1 SPOT-CHECK — no defect found. Two things I specifically tried to break:
- `readToday: todayIso` (`contexts/NutritionContext.tsx:410`) passes a FUNCTION reference
  (declared at :184), not a captured string. I checked this because a captured value would have
  frozen "today" at mount and made the watcher permanently stale — the original bug in a new
  costume. It is a live call. Correct.
- The AppState subscription is cleaned up (`sub.remove()` at :416) and the effect returns the
  watcher's own cleanup, so no listener or timer leak across auth changes.
Extracting `watchNutritionDay` with injected `readToday`/`onChange`/`subscribeActive` is the
right shape and is why it is unit-testable at all. No findings.

Nutrition/Coach review beyond A1 and R4 is NOT complete — I prioritised the release gate and the
defect I filed so you could build. Say the word after your build and I will continue into
Coach/Q2 with the same read-only treatment.

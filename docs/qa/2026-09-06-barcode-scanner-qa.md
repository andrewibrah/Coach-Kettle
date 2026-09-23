# Barcode Scanner — QA Checklist

Companion to `docs/plans/2026-09-06-barcode-scanner-nutrition.md`.

## 0. Prerequisites — ORDER MATTERS

The function fails **closed** if its rate-limit RPC is missing, so deploying it
before the migration makes every lookup 503. Do these in order:

1. [ ] `supabase db push` — applies `20260906010000_barcode_food_cache.sql`
2. [ ] `supabase functions deploy food-barcode`
3. [ ] **Native rebuild** — `npx expo run:ios` (or an EAS `development` build).
       `expo-camera` is a native module; a JS reload will NOT pick it up.
4. [ ] **Smoke-test one scan.** This single request proves both that the RPC
       exists and that `service_role` can actually reach the new tables — they
       are RLS-enabled with no policies and rely on Supabase's default
       `service_role` grants, which fail *silently* if absent.

Verify the migration landed:
```sql
select count(*) from public.barcode_foods;                 -- 0, no error
select proname from pg_proc where proname = 'check_and_increment_barcode_lookups';
```

If step 4 shows "The food database is unavailable right now", the migration did
not land or the grants are missing — check the function logs for
`BARCODE_GATE_UNAVAILABLE` before assuming a network problem.

## 1. Happy path

| # | Step | Expected |
|---|---|---|
| 1.1 | Nutrition → Log food → **Scan barcode** | Camera opens, reticle visible |
| 1.2 | Scan a Pringles can (`038000138416`) | Haptic tap, sheet closes, product appears in the selected card |
| 1.3 | Check the numbers | 28 g serving ≈ **150 cal**, 1 g protein, 15 g carbs, 9 g fat |
| 1.4 | Set meal, tap **Log** | Returns to nutrition dashboard, totals increase by the shown amount |
| 1.5 | Reopen Log food | Product appears under **Recently logged** |

## 2. The three data-shape traps

| # | Product | Watch for |
|---|---|---|
| 2.1 | Diet Coke `049000028911` | Must resolve as **0 calories**, NOT "no nutrition info". Zero is real data. |
| 2.2 | Nutella `3017620422003` | No serving size upstream → card must say **100 g**, never 0. Sodium ≈ **43 mg**, not 0.04 and not 42800. |
| 2.3 | Coca-Cola `5449000000996` | 330 ml serving → ≈ **139 cal** for the whole can, not 42. |
| 2.4 | Oreo `0044000032029` | Upstream declares a bogus **3 g** serving. Must show **100 g / 471 cal**, never "14 cal". |

**The selected card must ALWAYS show a "1 serving = Ng" line.** If a scanned product
shows calories with no stated serving weight, that is the silent-under-reporting bug
regressing — stop and check.

**Sodium is the one to stare at.** Upstream reports grams; we store mg. If a
product shows a sodium figure ~1000× too big or too small, the conversion broke.

## 3. Not-found — this is a PRIMARY path (~half of US barcodes)

| # | Step | Expected |
|---|---|---|
| 3.1 | Scan a Clif Bar (`722252100542`) | Sheet closes, notice explains it isn't in the database, screen **auto-scrolls to Quick log** |
| 3.2 | Fill in the label numbers, tap Quick log | Logs normally |
| 3.3 | Scan a product with a name but no nutrition | Quick log's **name is prefilled**; notice says to add the numbers |
| 3.4 | Type macros into Quick log, then scan an unknown barcode | Every macro field is **cleared**, not just the name — otherwise one tap logs the new food with the old food's calories |

## 4. Duplicate-scan guard (the classic failure)

| # | Step | Expected |
|---|---|---|
| 4.1 | Hold the camera steady on a barcode for ~5 seconds | Exactly **one** lookup, **one** result. Never a burst. |
| 4.2 | After logging, check the day's entries | Exactly one row. No triplicates. |
| 4.3 | Scan, then reopen the scanner and scan again | Second scan works (the guard re-arms on open) |

## 5. Permissions

| # | Step | Expected |
|---|---|---|
| 5.1 | First-ever scan | iOS prompt reads *"…scan food barcodes and to take gym photos…"* |
| 5.2 | Deny | In-sheet explanation + **Allow camera** button |
| 5.3 | Deny permanently, reopen | Button becomes **Open Settings** and deep-links to the app's settings |
| 5.4 | Grant in Settings, return | Camera activates |
| 5.5 | Check Settings → Privacy → Microphone | Coach Kettle must **not** appear (mic permission is disabled in the plugin) |

## 6. Degraded conditions

| # | Condition | Expected |
|---|---|---|
| 6.1 | Airplane mode, scan | Friendly "couldn't reach the food database" notice → manual entry. No crash, no spinner forever. |
| 6.2 | Airplane mode, scan a **previously scanned** product | Still resolves — served from the cache |
| 6.3 | Slow network | Spinner max ~8 s, then the fallback message (upstream timeout) |
| 6.7 | Stalled connection mid-lookup | The **X still closes the sheet** and cancels the request — never trapped |
| 6.8 | Exceed 300 lookups in a day | Says "hit today's barcode lookup limit", **not** "check your connection" |
| 6.4 | Close the sheet mid-lookup | No stray state change; no "setState on unmounted" warning |
| 6.5 | Navigate away mid-lookup | Request aborts cleanly |
| 6.6 | **iOS Simulator** (no camera) | Sheet still usable via **Type the number instead** |

## 7. Bad input

| # | Input | Expected |
|---|---|---|
| 7.1 | Scan a QR code | Ignored — QR is not in the requested symbology list |
| 7.2 | Manual entry `123` | "Enter at least 8 digits" |
| 7.3 | Manual entry `9999999999999` (bad check digit) | Rejected as not a product code, retryable |
| 7.4 | Manual entry of a valid but unknown GTIN | Normal not-found path |

## 8. Regression — nothing else may break

| # | Flow | Expected |
|---|---|---|
| 8.1 | Analyze a meal by **text** | Unchanged |
| 8.2 | Analyze a meal by **photo** | Unchanged |
| 8.3 | Catalog **search** → select → log | Unchanged; logs with its real `food_id` |
| 8.4 | **Quick log** | Unchanged |
| 8.5 | **Recently logged** pill → Log | Works. *(Previously this 500'd for quick-log-derived entries — see note below.)* |
| 8.6 | Scan a product, then tap a Recently-logged pill, then Log | Logs the **recent** food, correctly linked — not the scanned one |
| 8.7 | Nutrition dashboard totals, grade colour, meal plan | Unchanged |

## 9. Cross-cutting

- [ ] Dark mode: scanner sheet, notice text and the scan button all legible
- [ ] VoiceOver: scan button, torch toggle and close button are all labelled
- [ ] Torch toggles on/off and turns off when the sheet closes
- [ ] Scan → background the app → foreground: no camera freeze

## 10. Server-side spot checks

```sql
-- Cache populated, and no 'found' row is missing its essentials.
select barcode, status, name, serving_size_g, calories, sodium_mg
from public.barcode_foods order by fetched_at desc limit 10;

-- Sanity: sodium should look like milligrams (tens to hundreds), not grams.
select name, sodium_mg from public.barcode_foods where status = 'found';

-- Abuse gate is counting only cache MISSES.
select * from public.barcode_lookup_usage;

-- Scanned entries must have a NULL food_id (they are not catalog rows).
select food_name, food_id from public.food_logs order by created_at desc limit 5;
```

---

### Note on 8.5 — pre-existing bug fixed in passing

`handleLogSelected` previously sent `food_id: selected.id`. A **Recently logged**
pill built from a quick-log entry has no `food_id` and carries `''` as its id,
which Postgres rejects as a UUID — a 500 on log. The same line now had to
distinguish barcode selections, so it also guards the empty-string case.
Flagging it because it is a behaviour change beyond the feature's scope.

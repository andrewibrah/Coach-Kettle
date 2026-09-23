# Barcode Scanner for Nutrition Logging — Plan & Audit

Date: 2026-09-06 · Branch: b65/66

## 1. Research findings (verified by live API calls, not recalled)

Data source: **Open Food Facts** v2 (`https://world.openfoodfacts.org/api/v2/product/<code>.json`).
Free, no API key, no auth. Their policy asks for a descriptive `User-Agent`
(confirmed not *enforced* in testing, but we send one).

Probed with real barcodes on 2026-09-06. Confirmed:

| Fact | Evidence | Why it matters |
|---|---|---|
| `nutriments.sodium_100g` is in **grams** | Nutella `0.0428` (= 42.8 mg) | `foods.sodium_mg` is mg → **x1000 or you get a silent 1000x error** |
| `salt_100g` also grams | Nutella `0.107` | fallback: `salt_g * 1000 / 2.5` |
| `energy-kcal_100g` can legitimately be **`0`** | Diet Coke `049000028911` → `0` | Treating `0` as "missing" would wrongly reject every diet/zero product. Only *absent/non-finite* counts as missing. |
| `fiber_100g` is frequently **absent** | Nutella, Coca-Cola have none | default `0`, never `NaN` |
| `nutrition_data_per` can be `"100ml"` | Diet Coke | per-100 basis holds for both; label it |
| `serving_quantity` often absent, `serving_size` is free text | Nutella: no qty; Coke: `1 portion (330 ml)` / `330` | absent ⇒ basis must be `100 g`, **never `0`** |
| `serving_quantity_unit` can be `ml` | Diet Coke `354.9 ml` | treat as g (water density), consistent with the existing `TO_GRAMS` table |
| OFF pads UPC-A to EAN-13 itself | sent `049000028911` → got `0049000028911` | we still normalize locally for stable cache keys |
| Not found ⇒ **HTTP 404** + `status:0` | `0888849000104` | must handle 404 as a normal outcome, not an error |
| Invalid code ⇒ HTTP 200 + `status:0` | `"no code or invalid code"` | key off `status`, not HTTP alone |
| **~40-50% of US barcodes miss** | Clif Bar, Cheetos both `status:0` | the not-found path is a **primary** path, not an edge case |

**Consequence:** the manual-entry fallback gets first-class UX, not an error toast.

## 2. Architecture decisions

| Decision | Choice | Rationale |
|---|---|---|
| Edge function | **new `food-barcode`**, not a new `food-log` action | independent deploy target; cannot regress the day / week / search / log paths (requirement "b"). Also the only outbound third-party call in the nutrition stack. |
| Persistence | **one shared cache table `barcode_foods`** | no `foods.barcode` column ⇒ no collision with `uq_foods_global_name`, no RLS changes, no orphan rows when a user cancels a scan |
| Food row creation | **none on lookup**; log via existing `logFood` with `food_id: null` + snapshot macros | identical to the proven quick-log path; scanned items still resurface via `action=recent` |
| Entitlement gate | **none** | barcode lookup is not AI. Calling `gateAiRequest` would burn the free tier's 5 AI msgs/day on a non-AI action — itself a bug. Abuse is bounded by the cache plus a dedicated non-AI daily cap on cache *misses*. |
| Pure logic placement | `lib/barcode.ts` + `supabase/functions/_shared/openFoodFacts.ts` (zero imports) | `tsconfig` excludes `supabase/functions/**` from `tsc`, so the mapper is covered by `node --test` importing it directly |

## 3. Bug classes explicitly defended against

1. **Duplicate scan storm** — `onBarcodeScanned` fires many times/sec. The guard is a
   `useRef` set **synchronously before any `await`**; a `useState` setter has not
   committed by the next frame and yields 3-8 duplicate lookups per scan.
2. **`serving_size_g: 0`** — the existing `toServings` silently returns `1` when
   `sizeG <= 0`, and the unit chips disable. A naive mapping (no serving data upstream)
   would make every gram/oz amount log as "1 serving". Absent serving data ⇒ `100`.
3. **Zero-calorie ≠ missing** — see §1.
4. **Sodium 1000x** — see §1.
5. **FK violation on `food_id`** — a scanned item is not a `foods` row. A synthetic id
   would hit the `food_logs.food_id` FK and 500. Barcode selections log `food_id: null`.
6. **Check-digit / symbology drift** — UPC-A(12), UPC-E(8), EAN-8, EAN-13, ITF-14 all
   normalize to GTIN-13. UPC-E expansion is **self-verifying**: expand, recompute the
   check digit, compare against the one carried in the UPC-E; mismatch ⇒ reject rather
   than query a wrong product.
7. **SSRF / injection** — the server re-validates `^\d{8,14}$` before any URL interpolation.
8. **Hang / unmount** — `AbortController` with an 8s timeout; in-flight lookup cancelled on unmount.
9. **Stale-cache resilience** — if upstream is down and we hold a stale row, serve stale rather than fail.
10. **Platform guards** — entry point hidden on web; simulator (no camera) still usable
    via the modal's manual-entry field.
11. **`NSCameraUsageDescription` had three writers** (`ios.infoPlist`, `expo-image-picker`,
    now `expo-camera`). Unified to one string that actually describes food scanning — the
    old copy said "to take gym photos", a purpose mismatch App Review flags.

## 4. Deliverables

- `lib/barcode.ts` — pure GTIN normalization + branded-name formatting (+ tests)
- `supabase/functions/_shared/openFoodFacts.ts` — pure OFF→food mapper (+ tests)
- `supabase/functions/food-barcode/index.ts` — auth, validate, cache, fetch, rate limit
- `supabase/migrations/20260906010000_barcode_food_cache.sql` — cache table + rate-limit RPC
- `components/nutrition/BarcodeScannerModal.tsx` — camera UI
- `lib/nutrition.ts` `lookupBarcode()`, `types/nutrition.ts` result types
- `app/(tabs)/nutrition/log.tsx` — scan entry point + result routing
- `app.json` / `supabase/config.toml` — camera plugin, unified purpose string, `verify_jwt`

## 5. The deploy step is NOT just db push + functions deploy

`expo-camera` is a **native module**. It cannot load into the currently installed binary.
The app must be rebuilt (`npx expo run:ios`, or an EAS `development` profile build).
A JS reload alone will fail with a native-module-not-found error.


---

## 6. Findings during implementation (post-plan)

### Verified end-to-end against the live API

The mapper was run against real responses, not just fixtures:

| Barcode | Result |
|---|---|
| `3017620422003` Nutella | 100 g basis, 539 cal, **43 mg** sodium, fiber 0 |
| `5449000000996` Coca-Cola | 330 g serving, **139 cal** (whole can) |
| `049000028911` Diet Coke | **found with 0 cal** — the zero-calorie trap held |
| `038000138416` Pringles | 28 g serving, 150 cal, 150 mg sodium |
| `5060337502900` Monster | 500 ml serving, 235 cal, 380 mg sodium |
| `722252100542` Clif Bar | `not_found` — routed to manual entry |

### Two bugs found and fixed during integration

1. **Recent Foods desynced `selectedBarcode`** (mine). Scanning a product and
   then tapping a "Recently logged" pill left the barcode flag set, so the
   recent food logged with `food_id: null` and lost its catalog link. The pill's
   `onPress` now clears both `selectedBarcode` and `scanNotice`.

2. **Pre-existing: `food_id: ''` → 500** (not mine, but on the line I had to
   touch). A "Recently logged" pill built from a quick-log entry has no
   `food_id` and carries `''` as its `FoodItem.id`. The food-log function
   forwards any string, so Postgres received `''` for a UUID column and the
   insert failed. `handleLogSelected` now sends `null` for an empty id.
   **This is a behaviour change beyond the feature's scope — flagged deliberately.**

### One UX defect fixed

Naive `brand + name` concatenation produced "COCA-COLA SERVICES SA/NV Coca-Cola"
and "Coke Diet Coke Soft Drink", because the upstream `brands` field is a
legal-entity list. `formatBrandedFoodName()` (in `lib/barcode.ts`, tested) keeps
the product name when either string already implies the other.

### Verification performed

- `npx tsc --noEmit` — clean
- `npx expo lint` — clean
- `node --test "lib/__tests__/*.test.ts"` — **146 pass, 0 fail** (43 new)
- `npx expo config --type prebuild` — confirms the resolved `Info.plist` carries
  the single unified `NSCameraUsageDescription`, that **no**
  `NSMicrophoneUsageDescription` is emitted, and that `android.permission.CAMERA`
  is added.

### Late hardening

- **`verify_jwt` declared, not inherited.** `supabase/config.toml` only ever
  *disables* JWT verification, and the CLI default is `true`. Since this
  function verifies the bearer token itself and must accept an `OPTIONS`
  preflight (which carries no `Authorization` header), it now has an explicit
  `[functions.food-barcode] verify_jwt = false` entry rather than relying on
  whatever the neighbouring nutrition functions happened to be deployed with.
- **`lookingUp` can no longer strand.** The `finally` previously skipped
  `setLookingUp(false)` when the request was aborted. Since the scan button is
  `disabled={lookingUp}`, that would have permanently killed the entry point.
  It now always clears (a post-unmount `setState` is a no-op in React 18+).
- **Dependency compatibility confirmed.** `npx expo install --check` does **not**
  list `expo-camera` — `~55.0.23` is the expected version for this SDK. (Many
  other packages *are* behind; that is pre-existing and deliberately untouched.)

### Validation notes / known limits

- `sqlglot` cannot parse `DROP TRIGGER IF EXISTS … ON <table>`. Control runs
  confirmed this is a parser limitation: migrations 0033 and 0048 parse, and
  the identical statement form is already used by deployed migration 0022.
  With those two lines elided, all 15 remaining statements parse cleanly.
  There is no Docker on this machine, so the migration was **not** executed.
- `android.permission.RECORD_AUDIO` still appears in the resolved config despite
  `recordAudioAndroid: false`. It comes from some other plugin; **its source was
  not verified.** iOS (the primary platform) is clean — no
  `NSMicrophoneUsageDescription` is emitted.

## 7. Independent review findings (adversarial pass, all confirmed & fixed)

A separate review agent audited the finished feature. Every finding below was
**independently re-verified against the live API before acting**, not taken on trust.

### H1 — Silent calorie under-reporting (the serious one)

Two faults compounded:

1. The "1 serving = Ng" disclosure in the selected card was gated on
   `unit !== 'serving'` — and a barcode scan lands the user in `unit === 'serving'`.
   So the one line that reveals a bogus serving size was the one line never rendered
   after a scan.
2. `resolveServing` trusted any `serving_quantity >= 0.1`.

Confirmed live on **`0044000032029`** ("oreo cookies shelf"), which declares
`serving_quantity: 3` grams against a 471 kcal/100 g product. The mapper produced
**14.13 calories** for a serving of Oreos, the card read "Per serving: 14 cal",
and nothing on screen said "3 g". One tap logged it.

**Fixed both ways:** the basis line is now always shown when `serving_size_g > 0`,
and `MIN_PLAUSIBLE_SERVING_G = 5` makes implausibly small servings fall back to the
source's own declared per-100 basis. Post-fix, that barcode maps to 100 g / 471 cal;
Pringles (28 g), Coke (330 ml) and Diet Coke (354.9 ml) are unaffected.

### M2 — Energy and nutriment fallbacks

- `energy_100g` was branched on `energy_unit`. But `energy_unit` describes the unit
  the *contributor typed for `energy_value`*, not the unit of `energy_100g`.
  Verified on three products: `energy_unit: "kJ"` with `energy_100g ===
  energy-kj_100g` exactly (Pringles 2244.5 vs 536 kcal, ratio 4.188). The branch
  would have over-reported by 4.184x. **Removed — `energy_100g` is always kJ.**
- Un-suffixed nutriment fallbacks (`?? nutriments.proteins`, `?? nutriments.sodium`,
  …) hold the value in the product's *declared* basis, which the mapper would then
  scale a second time. Across every product fetched, `<n>_100g` was present whenever
  any nutrition data existed, so the fallbacks bought no coverage. **All removed.**

### M3 — Stale macros beside a fresh name

The not-found path prefilled `quickName` but left `quickCal` / `quickProt` /
`quickCarb` / `quickFat` / `quickFiber` / `quickSatFat` holding whatever the user had
typed for a previous food — and then auto-scrolled them to the Log button. **All
quick-log fields are now cleared together.**

Four regression tests were added (150 total, all passing), including the real
`0044000032029` payload.

#### Tradeoff accepted in the `MIN_PLAUSIBLE_SERVING_G = 5` threshold

There is no free choice here. A handful of products have *genuinely* sub-5 g
servings — chewing gum, sweetener packets, spices, instant coffee. Those now
default to a 100 g basis, which **over**-reports until the user sets the amount.

That is the deliberate direction, for two reasons:
1. The always-visible "1 serving = 100 g" line makes it obvious and correctable,
   whereas "1 serving = 3 g" reads as authoritative and gets accepted.
2. An implausibly high number gets questioned; an implausibly low one does not.
   In a coaching app, under-reporting silently tells the user to eat more.

Corrupt serving sizes are far more common in community-maintained data than
genuinely tiny ones, so the threshold is net positive — but it is a judgement
call, not a fact, and it is the first thing to revisit if users report inflated
calories on small-serving items.

### Second review pass — M4-M8, L9-L15

**Fixed:**

- **M4 — rate-limit errors read as network faults.** `lookupBarcode` threw a bare
  `HTTP <status>` and the UI rendered "check your connection" for everything. Since
  the gate is increment-first, each pointless retry pushed the user *further* past
  the daily cap. Added `BarcodeLookupError` carrying the server's `code`, with
  distinct copy for `BARCODE_LIMIT_REACHED` and the two unavailable codes.
- **M5 — uncloseable modal on a hung lookup.** Close was gated on `!lookingUp`, and
  there is no client-side timeout (RN `fetch` has none; the function's 8 s budget
  bounds only its own upstream call). `closeScanner` now always aborts and closes.
- **M6 — `incomplete` was cached for 30 days.** That is precisely the state a
  contributor is likely to fix; moved to the 7-day TTL alongside `not_found`.
- **L9 — UPC-E payload length (verified in the vendored Swift).**
  `BarcodeScannerUtils.swift:36-41` strips the leading zero only for `.ean13`,
  never `.upce`, so an already-expanded 12-digit UPC-E payload would have made
  `expandUpcE` return null and **every UPC-E scan fail**. `normalizeBarcode` now
  accepts a 12/13-digit payload under the UPC-E symbology.
- **L10 — symbology strings now locked by tests** (`VNBarcodeSymbologyUPCE`,
  `org.gs1.UPC-E`, `upc_e`, …), so a refactor to `type === 'upc_e'` fails loudly.
- **L12 — locked "Look up" was a silent no-op.** Lock check moved ahead of the
  length check and now sets a message.
- **L13 — inline `onScanned` arrow** churned the native scanner's callback prop
  every render; now `useCallback`'d.

**Documented, not code:**

- **M7 — deploy ordering.** The function fails closed if its RPC is missing, so
  `db push` **must** precede `functions deploy`. Now step-numbered in the QA doc.
- **M8 — `service_role` grants.** The migration REVOKEs without GRANTing, relying on
  Supabase's defaults. The pattern is character-for-character 0033/0048, which work
  in production, but RLS-with-no-policies fails silently — the QA doc now requires a
  post-deploy smoke scan that proves it in one request.

**Assessed, deliberately not changed:**

- **L11 — `servings` clamped to [0.01, 100] while macros are pre-multiplied.**
  Verified `get_food_daily_totals` sums the `calories` column directly, not
  `servings × calories`, so totals stay correct; the stored `servings` is merely
  cosmetic at extreme amounts. Pre-existing, affects catalog foods equally.
- **L14** — moot once M2 removed the fallbacks.
- **L15 — `barcode_lookup_usage` rows accumulate.** Same as the existing `ai_usage`
  table; a shared cleanup job is the right fix, not a bespoke one here.

**Confirmed correct by the reviewer (no action):** GTIN-8 zero-padding (probed live —
OFF resolves padded and unpadded identically); no `selectedBarcode`/`selected`
desync across all four mutation sites; the duplicate-scan guard is genuinely
synchronous; clamp ordering is scale → round → bound and cannot violate
`NUMERIC(7,2)`; the rate limit is not charged on cache hits; `rowToResponse` handles
PostgREST's NUMERIC-as-string and the local JS row identically; AbortController
lifecycle is clean; the migration is valid and idempotent and sorts after 0033;
`microphonePermission: false` genuinely removes the key.

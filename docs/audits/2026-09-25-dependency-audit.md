# Coach Kettle: dependency audit, 2026-09-25

> **Corrections found during Phase 2** (the Phase 1 text below is kept as written):
> - The iOS bundle baseline at `c615385` is **7,955,450 B** (7.59 MiB), not 5.0 MiB. Task 1 re-measured it.
> - `expo@57.0.25` bundles **react-native 0.86.3 / React 19.2.3**, not RN 0.87 / React 19.3.
> - Deno 2 **does** auto-discover the root `deno.lock` (it sits next to the root `package.json`), but the functions never used it.
> - Functions supabase-js **2.50.0 and 2.49.10 crash every function at boot**. The target became 2.50.1.

Branch `deps/audit-2026-09-25` from 1.0.2 HEAD `c615385`. This is the Phase 1 audit. It was read-only: the repo was not changed while it ran. Every fix applied afterwards is listed in the "Phase 2 outcome" section at the end.
Raw command outputs were saved to the session scratch directory (`audit-raw/`). The evidence columns quote the lines that matter from them.

## Summary: counts per class

| Class | App (npm/Expo/native) | Deno backend | Total |
|---|---|---|---|
| SAFE-NOW | 21 | 1 | 22 |
| NEEDS-BUILD | 19 | 0 | 19 |
| MAJOR | 7 | 0 | 7 |
| REMOVE | 1 (`@expo/ngrok`) | 1 (dead `deno.json` import-map entries) | 2 |
| BACKEND | 1 (client/functions supabase-js drift) | 3 (5B supabase-js bump, 5C `Deno.serve`, 5D iap `.catch`) | 4 |
| WATCH | 28 | 2 | 30 |

The client/functions supabase-js drift is counted twice: the app half and the Deno half each have a row for it. They are two views of one issue.

### Controller reconciliation note
The Deno half reports "no deno.lock". That is correct for `supabase/functions/`. There is, however, a **tracked root `deno.lock`** (lockfile v5, added in `45d8c16`) that pins `deno.land/std@0.168.0` and `esm.sh/@supabase/supabase-js@2.48.0`. Fix group 5A resolves how it relates to a lock placed next to `supabase/functions/deno.json`.

---

## Part A — App (npm / Expo / native) dependency audit

Branch `deps/audit-2026-09-25` @ c615385. Read-only: no install/update/commit; `package.json` / `package-lock.json` md5 unchanged before and after (`4d7acfcd…be6bc`). Simulated fixes ran only on scratch copies.
Raw outputs: `RAW=/private/tmp/claude-501/-Users-me-Desktop-partner-11-Codebases-Coach-Kettle/4a674559-8421-4443-9ef2-f37506f7e26e/scratchpad/audit-raw/`. File names below are relative to `RAW`.
Environment: node v26.10.0, npm 11.19.1. Lockfile v3, 1018 packages (728 prod / 279 dev / 50 optional).

### Headline findings

1. **Do not run plain `npm audit fix`, even with `--package-lock-only`.** In a scratch copy it bumped `expo` 55.0.26→55.0.31 and also changed native modules: `expo-modules-core` 55.0.25→55.0.26, `expo-asset` 55.0.17→55.0.20, `expo-constants`, `expo-file-system`, `expo-splash-screen`, `@expo/log-box` and metro 0.83.8. That means a new native binary (`auditfix-lockdiff.txt`).
2. **A targeted update fixes every advisory that has an in-range fix, and touches no native package** (`leaffix-lockdiff.txt`; package.json unchanged). The command is `npm update --package-lock-only @xmldom/xmldom nanoid postcss shell-quote js-yaml brace-expansion browserslist baseline-browser-mapping @babel/core`. Advisories go from 26 to 17, and the only remaining high is `image-size`. The one other in-range fix is `@react-navigation/core`, which clears when `@react-navigation/native` is bumped to ^7.4.1.
3. **Only 3 vulnerable packages are in the shipped iOS JS bundle:** `nanoid`, `query-string` and `decode-uri-component` (`bundle-reachability.txt`).
   - `decode-uri-component` is reachable through deep links: expo-router's `getStateFromPath` parses `coachkettle://` URLs. There is no in-range fix.
   - `nanoid` is reachable but not exploitable: callers use `nanoid()` with the default size.
   - Every other advisory is Metro/Babel/prebuild/dev-server tooling. It sits in the "prod" graph only because `expo` and `react-native` declare it.
4. **All 17 SDK-alignment mismatches reported by expo-doctor are NEEDS-BUILD.** None are JS-only once transitive deps are counted:
   - `expo-router` has `ios/` and `expo-module.config.json`.
   - `expo-auth-session` has no native code itself, but 55.0.18 requires native `expo-crypto ~55.0.18`, `expo-application ~55.0.18`, `expo-linking ~55.0.17`, `expo-constants ~55.0.17` and `expo-web-browser ~55.0.19`.
   - `expo@55.0.31` pins `@expo/log-box 55.0.13`, while `expo-router@55.0.16` peers `55.0.12`. The set therefore has to move together in one `npx expo install --fix`.
5. **The JS-only SAFE-NOW bumps are:** the `@react-navigation/*` trio, `@supabase/supabase-js`, `@types/react` and `react-native-web`, plus the transitive leaf fixes. None of these is SDK-pinned: they are absent from `node_modules/expo/bundledNativeModules.json`.

---

### 1. App npm health (`npm ls`, `npm ci --dry-run`, `expo-doctor`, `expo install --check`)

- `npm ls --all` exited 0. There are no `invalid`, `extraneous` or peer (`ERESOLVE`) errors. The only `UNMET OPTIONAL` entries are platform binaries: `@expo/ngrok-bin-*`, `@unrs/resolver-binding-*`, `react-native-windows`, `@react-native-masked-view/masked-view`, `@types/react-dom` and `jiti` (`npm-ls-all.txt:5-14,66,85,187-221`).
- `npm ci --dry-run` returned "up to date", exit 0, so the lockfile and package.json agree (`ci-dry.txt`).
- Core singletons each have one copy: `react@19.2.0`, `react-native@0.83.6`, `react-native-reanimated@4.2.1`, `expo-modules-core@55.0.25` and `react-native-worklets@0.7.4` (`npm-ls-core.txt`).
- 60 transitive packages have more than one version installed (`lock-duplicates.txt`). All of them are normal semver splits, for example `semver` ×5, `debug` ×3 and `@xmldom/xmldom` 0.8/0.9. None of them is a native module.
- `expo-doctor` passed 19 of 20 checks. The one failure is the 17 patch mismatches below (`expo-doctor.txt`), and `expo install --check` lists the same 17 (`expo-install-check.txt`).

### 1a. SDK-aligned patch mismatches (all native, so all NEEDS-BUILD)

Native-ness was checked in `node_modules/<pkg>` for an `ios/` dir, a `*.podspec` or `expo-module.config.json`, and confirmed with `npx expo-modules-autolinking resolve` (`autolink-expo.txt`, `autolink-rn.json`).

| package | current | wanted (SDK) | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| expo | 55.0.26 | ~55.0.31 | 57.0.25 | – | NEEDS-BUILD | expo-doctor.txt; `Expo.podspec`, ios/, emc. Also pulls expo-modules-core 55.0.26, expo-asset ~55.0.20, @expo/log-box 55.0.13 (`npm view expo@55.0.31 dependencies`) | Group 2 native batch: `npx expo install --fix` |
| expo-apple-authentication | 55.0.13 | ~55.0.17 | 57.0.2 | – | NEEDS-BUILD | ios/ + emc + plugin | same batch |
| expo-auth-session | 55.0.16 | ~55.0.18 | 57.0.13 | – | NEEDS-BUILD | JS-only itself, but 55.0.18 requires native expo-crypto ~55.0.18, expo-application ~55.0.18 and others (`npm view expo-auth-session@55.0.18 dependencies`) | same batch; cannot ship alone |
| expo-blur | 55.0.14 | ~55.0.18 | 57.0.3 | – | NEEDS-BUILD | ios/ + emc | same batch |
| expo-constants | 55.0.16 | ~55.0.17 | 57.0.19 | – | NEEDS-BUILD | ios/ + emc | same batch |
| expo-crypto | 55.0.15 | ~55.0.19 | 57.0.3 | – | NEEDS-BUILD | ios/ + emc | same batch |
| expo-dev-client | 55.0.35 | ~55.0.40 | 57.0.19 | – | NEEDS-BUILD | ios/ + emc + plugin; pulls expo-dev-launcher/-menu | same batch |
| expo-file-system | 55.0.22 | ~55.0.26 | 57.0.7 | – | NEEDS-BUILD | ios/ + emc + plugin | same batch |
| expo-haptics | 55.0.14 | ~55.0.18 | 57.0.3 | – | NEEDS-BUILD | ios/ + emc | same batch |
| expo-image-picker | 55.0.20 | ~55.0.24 | 57.0.20 | – | NEEDS-BUILD | ios/ + emc + plugin | same batch |
| expo-linking | 55.0.15 | ~55.0.17 | 57.0.11 | – | NEEDS-BUILD | ios/ + emc | same batch |
| expo-notifications | 55.0.23 | ~55.0.27 | 57.0.21 | – | NEEDS-BUILD | ios/ + emc + plugin | same batch |
| expo-router | 55.0.16 | ~55.0.18 | 57.0.23 | – | NEEDS-BUILD | **has ios/ + expo-module.config.json + plugin, so it is not JS-only**; still depends on query-string ^7.1.3 | same batch |
| expo-splash-screen | 55.0.21 | ~55.0.25 | 57.0.9 | – | NEEDS-BUILD | ios/ + emc + plugin | same batch |
| expo-video | 55.0.17 | ~55.0.21 | 57.0.5 | – | NEEDS-BUILD | ios/ + emc + plugin | same batch |
| expo-web-browser | 55.0.16 | ~55.0.20 | 57.0.3 | – | NEEDS-BUILD | ios/ + emc + plugin | same batch |
| react-native | 0.83.6 | 0.83.10 | 0.87.1 | – | NEEDS-BUILD | React-Core podspecs; expo-doctor expects exact 0.83.10 | same batch; `package.json` pin `"react-native": "0.83.10"` |

JS-only SDK-aligned entries: **none**. `expo-build-properties`, `expo-camera`, `expo-font`, `expo-status-bar` and `expo-symbols` are already at the SDK-expected version.

### 1b. Other direct dependencies (`outdated.txt`)

| package | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| @react-navigation/native | 7.2.4 | 7.4.1 | 7.4.1 | moderate (via core→query-string) | SAFE-NOW | JS-only; not in bundledNativeModules.json; 7.4.1 pulls @react-navigation/core 7.22.1, which drops query-string (`npm view @react-navigation/core@7.22.1 dependencies`) | bump to ^7.4.1 together with the next two rows, plus `npm update @react-navigation/native-stack` (expo-router transitive) |
| @react-navigation/bottom-tabs | 7.16.1 | 7.19.2 | 7.19.2 | – | SAFE-NOW | peers `@react-navigation/native ^7.4.1`, screens/safe-area `>=4` (already satisfied) | ^7.19.2 |
| @react-navigation/elements | 2.9.18 | 2.9.43 | 2.9.43 | – | SAFE-NOW | peers native ^7.4.1 | ^2.9.43 |
| @supabase/supabase-js | 2.106.1 | 2.117.2 | 2.117.2 | – | SAFE-NOW | JS-only (auth/postgrest/storage/realtime/functions-js 2.117.2); client-side only, no Edge Function contract change | ^2.117.2; smoke-test sign-in, refresh and realtime PR confetti |
| @types/react | 19.2.15 | 19.2.18 | 19.3.0 | – | SAFE-NOW | dev types; SDK range ~19.2.10 | 19.2.18 (stay on 19.2.x) |
| react-native-web | 0.21.2 | 0.21.3 | 0.21.3 | – | SAFE-NOW | web only, not in the iOS bundle (`bundle-reachability.txt`) | ~0.21.3 (lockfile) |
| react-native-purchases | 10.9.0 | 10.10.2 | 10.10.2 | – | NEEDS-BUILD | podspec `PurchasesHybridCommon '18.33.1'` → 10.10.2 uses PHC 19.3.1 (major of hybrid-common); Podfile.lock:287-291 RevenueCat 5.87.1 | optional; bump both packages together to 10.10.2 in a native build only |
| react-native-purchases-ui | 10.9.0 | 10.10.2 | 10.10.2 | – | NEEDS-BUILD | peer pins `react-native-purchases` exact (10.10.2↔10.10.2); `RNPaywalls.podspec` PHC-UI 18.33.1 | same as above |
| expo (SDK) | 55 | – | 57.0.25 (58 preview) | – | MAJOR | `npm view expo dist-tags`: latest=57.0.25, next=58.0.0-preview.7 | SDK 57 upgrade is a separate project (RN 0.87, reanimated 4.7, etc.) |
| react / react-dom | 19.2.0 | 19.2.0 | 19.3.0 | – | WATCH | SDK-pinned (bundledNativeModules.json:98-99) | none until SDK upgrade |
| @react-native-async-storage/async-storage | 2.2.0 | 2.2.0 | 3.1.1 | – | MAJOR | SDK pins 2.2.0; native | stay |
| @react-native-community/datetimepicker | 8.6.0 | 8.6.0 | 9.2.1 | (audit: moderate via `expo` — false chain) | MAJOR | SDK pins 8.6.0; audit's "fix" 8.1.1 is a downgrade | stay; ignore audit's suggestion |
| react-native-gesture-handler | 2.30.1 | 2.30.1 | 3.3.0 | – | MAJOR | SDK range ~2.30.0; native | stay |
| reanimated 4.2.1 / worklets 0.7.4 / screens 4.23.0 / safe-area 5.6.2 / svg 15.15.3 | as listed | same | 4.7.0 / 0.13.0 / 4.28.0 / 5.10.0 / 15.15.5 | – | WATCH | SDK-pinned (bundledNativeModules.json:107-111); all native | do not move outside SDK 55 pins |
| react-native-url-polyfill | 3.0.0 | 3.0.0 | 4.0.0 | – | MAJOR | JS-only, bundled (`lib/supabase.ts:5` `import 'react-native-url-polyfill/auto'`) | defer; not needed |

---

### 2. Security advisories (prod vs dev, path, reachability)

`npm audit --omit=dev` reports 25 (1 low, 16 moderate, 8 high); `npm audit` reports 26. The only dev-only extra is `@expo/ngrok` → `uuid@3.4.0` (`audit-prod.json`, `audit-all.json`, `vuln-paths.txt`).
Reachability was checked against the exported iOS Hermes bundle's source map (2006 sources): `bundle-reachability.txt`.

| package | current | wanted (in-range fix) | latest | severity | class | evidence: path; reachability | proposed action |
|---|---|---|---|---|---|---|---|
| @xmldom/xmldom | 0.8.13, 0.9.10 | 0.8.15, 0.9.12 | 0.9.12 | high (22 GHSAs, e.g. GHSA-w2rr-34g9-rvrj) | SAFE-NOW | expo › @expo/cli › @expo/plist; expo › @expo/config-plugins › xcode › simple-plist › plist. **Build/prebuild only**, not in bundle. Versions also npm-deprecated | lockfile `npm update` (leaf set) |
| nanoid | 3.3.12 | 3.3.19 | 6.0.1 | high (GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8) | SAFE-NOW | @react-navigation/core/routers/native, expo-router, postcss. **In bundle** (`nanoid/non-secure/index.js`), but callers use `nanoid()` with the default size (`@react-navigation/core/lib/module/useRegisterNavigator.js:12` etc.), so it is not exploitable | leaf set |
| postcss | 8.5.15 | 8.5.28 | 8.5.28 | high (GHSA-r28c-9q8g-f849) | SAFE-NOW | expo › @expo/metro-config; build-time CSS only | leaf set |
| shell-quote | 1.8.4 | 1.10.0 | 1.10.0 | high (GHSA-395f-4hp3-45gv) | SAFE-NOW | react-native › react-devtools-core; dev-server only, not bundled | leaf set |
| js-yaml | 4.1.1, 3.14.2 | 4.3.2, 3.15.2 | 5.4.2 | high (GHSA-52cp-r559-cp3m +3) | SAFE-NOW | eslint › @eslint/eslintrc; @expo/cli › @expo/xcpretty; RN › babel-jest › istanbul. Tooling | leaf set |
| brace-expansion | 1.1.14, 5.0.6 | 1.1.21, 5.0.12 | 5.0.12 | high (GHSA-3jxr-9vmj-r5cp +2) | SAFE-NOW | eslint › minimatch@3; @expo/cli › glob; @expo/fingerprint; typescript-estree. Tooling | leaf set |
| browserslist | 4.28.2 | 4.29.1 | 4.29.1 | high (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g) | SAFE-NOW | @expo/metro-config, core-js-compat, @babel/helper-compilation-targets. Build | leaf set |
| baseline-browser-mapping | 2.10.32 | 2.11.26 | 2.11.26 | moderate (GHSA-w5vr-8v7q-w6rv) | SAFE-NOW | via browserslist. Build | leaf set |
| @babel/core | 7.29.0 | 7.29.7 | 8.0.6 | low (GHSA-4x5r-pxfx-6jf8) | SAFE-NOW | metro/babel-preset-expo/worklets. Build; the update also moves 16 `@babel/*` helpers to 7.29.7-7.29.9 (`leaffix-lockdiff.txt`), which changes transpiled JS output | leaf set; re-run `node --test` plus an `expo export` smoke test |
| @react-navigation/core (→ query-string) | 7.17.4 | 7.22.1 | 7.22.1 | moderate | SAFE-NOW | @react-navigation/native › core › query-string@7.1.3 | fixed by the @react-navigation/native ^7.4.1 row in 1b |
| decode-uri-component / query-string | 0.2.2 / 7.1.3 | none in range | 0.5.0 / 9.5.1 | moderate (GHSA-vcc3-ghjq-m6fr, exponential decode DoS) | WATCH | expo-router › query-string@^7.1.3 › decode-uri-component@^0.2.2. **In bundle and reachable**: `expo-router/build/fork/getStateFromPath-forks` parses incoming `coachkettle://` / linking URLs. Worst case is a local app hang from a crafted link. expo-router 55.0.18 still pins query-string ^7.1.3. 0.5.0 is ESM-only (`"type":"module"`), so an `overrides` entry is risky under CJS `require` | accept for 1.0.x; re-check on SDK 56/57 expo-router |
| image-size | 1.2.1 | none (metro wants ^1.0.2; 1.x max 1.2.1 is still in range ≤2.0.2) | 2.0.4 | high (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr) | WATCH | expo › @expo/metro › metro@0.83.7 (0.83.8 also `^1.0.2`). Build-time; parses only the repo's own assets | none; clears when metro moves to image-size 2 |
| uuid (xcode chain) | 7.0.3 | none (xcode wants ^7.0.3; fix is ≥11.1.1) | 14.0.2 | moderate (GHSA-w5hq-g745-h8pq) | WATCH | expo › @expo/config-plugins › xcode › uuid. Prebuild only; the vuln needs a caller-supplied `buf`. This one leaf is why audit flags `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/prebuild-config`, `@expo/metro-config`, `@expo/local-build-cache-provider`, `expo`, `expo-splash-screen` and `@react-native-community/datetimepicker` (13 of the 25). Audit's fix `expo@46.0.21` is a bogus downgrade | never run `audit fix --force` |

After the leaf set is applied in a scratch copy: 17 advisories (16 moderate, 1 high). What remains is `image-size`, decode-uri-component/query-string, the xcode/uuid chain entries and `@react-navigation/core`, which clears with 1b (`audit-after-leaffix.json`).

---

### 3. Unused / missing / duplicate

Tools: `depcheck` (`depcheck.json`) and `knip` (`knip.txt`). Every "unused" hit was checked against app.json, eas.json, eslint.config.js, plugins/, scripts/, tests and peer requirements. There is no `babel.config.js`, `metro.config.js` or `app.config.*` (confirmed with `ls`).

| package | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| expo-build-properties (depcheck "unused") | 55.0.18 | – | – | – | WATCH | used: app.json:79-86 plugin (`ios.deploymentTarget 16.0`) | keep |
| expo-dev-client (depcheck "unused") | 55.0.35 | – | – | – | WATCH | used: eas.json `development.developmentClient: true` | keep |
| expo-splash-screen (depcheck "unused") | 55.0.21 | – | – | – | WATCH | used: app.json:37-49 plugin | keep |
| react-dom, react-native-web (no imports) | 19.2.0 / 0.21.2 | – | – | – | WATCH | peer deps of expo-router, @expo/metro-runtime, @radix-ui/*, expo-camera, react-native-purchases(-ui) (`npm ls react-native-web react-dom`); app.json:31-34 `web.output static`; not in the iOS bundle | keep |
| react-native-screens, react-native-worklets (no imports) | 4.23.0 / 0.7.4 | – | – | – | WATCH | peers of expo-router/@react-navigation, and of reanimated 4 / expo-modules-core | keep |
| react-native-url-polyfill | 3.0.0 | – | – | – | WATCH | side-effect import `lib/supabase.ts:5`; bundled (5 sources) | keep |
| expo-updates, expo-system-ui (knip "unlisted", inferred from app.json) | – | – | – | – | WATCH | app.json has no `updates`/`runtimeVersion`, so OTA is not configured. `userInterfaceStyle: automatic` (app.json:9) needs expo-system-ui only on Android. expo-doctor raised no warning for either | no action (iOS-first) |
| @expo/ngrok (depcheck + knip unused dev) | 4.1.3 | – | 4.1.3 (last release 2023-11-17) | moderate (dev, via uuid@3.4.0, deprecated) | REMOVE | no code use. Only `docs/devcontainer.md:33` mentions `expo start --tunnel`, and Expo CLI offers to install ngrok on demand. Unmaintained for about 2y10m; 10 platform binaries | remove from devDependencies (decision Q-R1) |
| react-test-renderer (knip "unused dev") | 19.2.0 | – | – | – | (see §5) | false positive: required by 7 test files, e.g. `lib/__tests__/nutritionClientLifecycle.test.ts:8`, `onboardingPersistence.test.ts:10` | keep |
| eslint-plugin-react-hooks (missing) | 5.2.0 (hoisted) | – | – | – | SAFE-NOW | `eslint.config.js:4` requires it directly, but it only arrives transitively via eslint-config-expo@55.0.1, so it depends on hoisting | add devDependency `"eslint-plugin-react-hooks": "^5.2.0"` (same version, lockfile-neutral) |
| @expo/config-plugins (missing) | 55.0.10 (transitive) | – | – | – | SAFE-NOW | `plugins/withPodfileMinDeploymentTarget.js:1` `require('@expo/config-plugins')` | change to `require('expo/config-plugins')` (Expo-recommended re-export); prebuild output is identical |

Duplicates: none of the core singletons is duplicated (§1).

---

### 4. Native surface

**Autolinked iOS modules** (`autolink-expo.txt`, `autolink-rn.json`):
- 32 Expo modules. 11 are transitive-only: `@expo/dom-webview`, `@expo/log-box`, `expo-application`, `expo-asset`, `expo-glass-effect`, `expo-image`, `expo-keep-awake`, `expo-dev-launcher`, `expo-dev-menu(+interface)`, `expo-json-utils`, `expo-manifests` and `expo-updates-interface`.
- 11 React Native community pods: async-storage, datetimepicker, gesture-handler, purchases, purchases-ui, reanimated, safe-area-context, screens, svg, worklets, and `expo` itself.

**Config plugins in app.json** (app.json:35-87): expo-router, expo-splash-screen, expo-font, expo-apple-authentication, expo-image-picker, expo-camera, expo-notifications, expo-web-browser, expo-video, `./plugins/withPodfileMinDeploymentTarget` and expo-build-properties. `datetimepicker` ships an `app.plugin.js` but isn't listed in app.json; that's not needed on iOS. `ios/` is local CNG output and gitignored (`.gitignore:48`), so app.json is the source of truth.

| package / item | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| expo-build-properties iOS target | 16.0 | 16.0 | – | – | WATCH | app.json:83 `"deploymentTarget": "16.0"`; ios/Podfile.properties.json:4 `"ios.deploymentTarget": "16.0"`; Podfile:21 | ok |
| plugins/withPodfileMinDeploymentTarget.js | – | – | – | – | WATCH | Injects a `post_install` loop that raises every pod target's `IPHONEOS_DEPLOYMENT_TARGET` to `podfile_properties['ios.deploymentTarget']` (fallback 15.1) when it's lower; guarded against running twice by a marker (ios/Podfile:68-71). Header comment still lists "Sentry" as a reason (line 3), which is a stale leftover. Import fix is in §3 | keep; optionally drop "Sentry" from the comment |
| RevenueCat compatibility | 10.9.0 (PHC 18.33.1, RevenueCat iOS 5.87.1) | 10.10.2 | 10.10.2 | – | WATCH | Peers: `react-native >= 0.73.0`, `react >= 16.6.3`. **No official Expo 55 / RN 0.83 matrix found (unverified).** https://www.revenuecat.com/docs/getting-started/installation/expo has no version matrix. https://raw.githubusercontent.com/RevenueCat/react-native-purchases/main/CHANGELOG.md: 10.10.0 = PHC 19.0.0 + multipage paywalls; 10.10.2 = PHC 19.3.1 and a PurchasesError matching fix; no breaking change listed | 10.9.0 works in 1.0.2; bump only with a native build (§1b) |
| expo-camera barcode usage | 55.0.23 | – | – | – | WATCH | barcode only: `components/nutrition/BarcodeScannerModal.tsx:18,170-171` (`CameraView`, `barcodeScannerSettings`); types `ean13, ean8, upc_a, upc_e, itf14` (`lib/barcode.ts:9`); `microphonePermission: false` (app.json:63) | ok |
| Sentry leftovers | none | – | – | – | WATCH | 0 hits in package.json, package-lock.json, ios/Podfile.lock and project.pbxproj; no metro.config.js; eas.json clean; no root `.env*` files. Text-only mentions: plugin comment (above), `docs/errors.md:42-46` (old build log), `docs/releases/1.0.2/PR_BODY.md:13` ("Sentry is removed"), and privacy docs (grep "sentry" also false-matches `BodyMetricsEntry`) | none; comment cleanup optional |

**Changes that alter the native binary:**
- every §1a row, plus `react-native-purchases(-ui)`;
- plain `npm audit fix` (headline 1).

None of the SAFE-NOW items touches a pod or an Expo module.

`expo-dev-client` is autolinked in every build. Its launcher UI only activates in debug and dev-client builds, which is Expo's documented behaviour; not verified in the binary here.

---

### 5. Tooling / dev

| package / item | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| typescript | 5.9.3 | 5.9.3 | 7.0.2 | – | MAJOR | SDK 55 range ~5.9.2 (not flagged by expo install --check) | stay on 5.9 |
| eslint | 9.39.4 | 9.39.5 | 10.11.0 | npm-deprecated | MAJOR | `npm view eslint@9.39.4 deprecated` and `@9.39.5 deprecated` both say "This version is no longer supported". eslint-config-expo 55 peer is `eslint >=8.10`, but it hasn't been verified on ESLint 10 | decision Q-M2; 9.39.5 patch does not clear the deprecation |
| eslint-config-expo | 55.0.1 | 55.0.1 | 57.0.2 | – | WATCH | SDK-expected (bundledNativeModules.json:15) | moves with SDK |
| react-test-renderer | 19.2.0 | 19.2.0 | 19.3.0 | – | WATCH | matches react 19.2.0; used by 7 tests (§3). React 19 deprecates it upstream in favour of RTL, but the npm package isn't marked deprecated | keep |
| Node for tests (engines) | none | – | – | – | SAFE-NOW | local node v26.10.0. No `engines`, `.nvmrc`/`.node-version` or `eas.json` node field. `node --test` on `.ts` needs native type-stripping, which is on by default in Node ≥22.18 / ≥23.6 | add `"engines": {"node": ">=22.18"}` and `.nvmrc` `22` (or 24) |
| .devcontainer Node 20 | node 20 | 22+ | – | – | SAFE-NOW | `.devcontainer/Dockerfile:1` `javascript-node:1-20-bullseye`: Node 20 is EOL and can't run the TS test suite. It also installs global legacy `expo-cli` (deprecated) (Dockerfile:9) | bump image to `1-22-bookworm`; drop `expo-cli` global |
| root `deno.lock` (tracked) | – | – | – | – | WATCH | `deno.lock:14` pins `esm.sh/@supabase/supabase-js@2.48.0`; `deno.lock:17-30` "workspace.packageJson" lists the npm deps (generated by running deno at repo root) | hand to Deno auditor; likely stray |
| supabase-js client vs functions drift | client 2.106.1 (range ^2.90.0) | 2.117.2 | 2.117.2 | – | BACKEND | node_modules/@supabase/supabase-js; the root deno.lock shows 2.48.0 for functions | report only; Deno auditor owns the functions side |
| @expo/ngrok | 4.1.3 | – | – | – | (see §3 REMOVE) | used only for `expo start --tunnel` (docs/devcontainer.md:33) | – |

---

### 6. Licences (`license-summary.txt`, `license-prod.json`)

Summary: MIT 588, ISC 39, BSD-3 16, BSD-2 13, Apache-2.0 12, BlueOak 6, MPL-2.0 2, CC-BY-4.0 1, Python-2.0 1, (BSD-3-Clause OR GPL-2.0) 1, UNLICENSED 1 (the app itself, `private: true`).

`license-checker --production` also counts build tooling. After intersecting with the bundle's package set (`bundle-reachability.txt`), **no copyleft or UNKNOWN licence ships in the iOS JS bundle.**

| package | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| lightningcss (+ darwin-arm64) | 1.32.0 | – | – | MPL-2.0 | WATCH | expo › @expo/metro-config › lightningcss; build-time CSS, not bundled | none (file-level copyleft; not distributed) |
| node-forge | 1.4.0 | – | – | BSD-3-Clause OR GPL-2.0 | WATCH | expo › @expo/cli (code signing); build-time | elect BSD-3; none |
| caniuse-lite | 1.0.30001793 | – | – | CC-BY-4.0 | WATCH | browserslist data; build-time | none |
| argparse | 2.0.1 | – | – | Python-2.0 | WATCH | via js-yaml; tooling | none |

CocoaPods licences (RevenueCat, PHC, etc.) are not covered by license-checker and weren't audited here.

---

### 7. Size (`npx expo export --platform ios --source-maps`; output deleted afterwards)

- **iOS Hermes bundle:** 5,217,280 B (5.0 MiB `.hbc`). The source map is 15 MB and is not shipped.
- **Assets:** 47 files, 13 MB. The whole export was 32 MB on disk including the map.
  - Tutorial videos: `assets/videos/*` bundled, about 9.3 MB (history_prs 2.8 MB, reel_workout_logging 2.8 MB, reel_start_session 1.9 MB, reel_ask_coach 1.5 MB, ai_coach 257 KB).
  - `@expo/vector-icons` fonts: **all 19 icon fonts, about 4.07 MB**.
- **Biggest JS contributors** (pre-minification source size from the map's `sourcesContent`, not bytecode; `bundle-by-package.txt`):

| package | share |
|---|---|
| react-native | 25.2% |
| app code | 13.8% |
| react-native-reanimated | 9.0% |
| **@revenuecat/purchases-js-hybrid-mappings (811 KB)** | 8.7% |
| expo-router | 6.0% |
| @supabase/auth-js | 4.2% |
| gesture-handler | 2.8% |
| svg | 2.7% |

| package / item | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| @expo/vector-icons barrel import | 15.1.1 | – | – | ~2.0 MB avoidable | SAFE-NOW | `import { Ionicons } from '@expo/vector-icons'` in `app/paywall.tsx:9`, `app/auth/sign-in.tsx:1`, `app/auth/sign-up.tsx:1`, `app/auth/forgot-password.tsx:1` pulls all 19 fonts. Only Ionicons (390 KB), MaterialIcons (357 KB) and MaterialCommunityIcons (1.3 MB) are used; other files already use deep imports | change those 4 imports to `import Ionicons from '@expo/vector-icons/Ionicons'` (JS-only code change; decision Q-S1) |
| @revenuecat/purchases-js-hybrid-mappings | 18.33.1 | – | 19.3.1 | 811 KB source | WATCH | hard dependency of react-native-purchases (web mapping layer shipped into the native bundle) | none (upstream) |

---

### 8. Supply chain

| package / item | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| fsevents (install script) | 2.3.3 | – | – | – | WATCH | lock `hasInstallScript`, prod-optional (macOS watcher); `npm ci --dry-run` warns "not yet covered by allowScripts" | approve via `npm install-scripts approve fsevents` if the npm 11 allowScripts gate starts blocking |
| unrs-resolver (postinstall) | 1.12.2 | – | – | – | WATCH | dev (eslint-config-expo › import resolver); `postinstall: node postinstall.js` | same |
| deprecated transitives | glob@7.2.3, inflight@1.0.6, rimraf@3.0.2, uuid@7.0.3/3.4.0, @xmldom 0.8.13/0.9.10, eslint 9.39.4 | – | – | – | WATCH | `deprecated-transitive.txt` (all 975 lock entries checked). glob/inflight/rimraf come from react-native › @react-native/codegen, babel-jest and chromium-edge-launcher (build/dev). xmldom is cleared by the leaf set; uuid@3 by the ngrok removal | none beyond groups 3/4 |

- **Unmaintained:** `@expo/ngrok`, last release 2023-11-17. All other direct deps have released within the last 5 months (`direct-lastrelease.txt`).
- **Typosquats:** none. All 47 direct names were reviewed against their canonical scopes (`@expo`, `@react-navigation`, `@react-native-community`, `@react-native-async-storage`, `@supabase`, `react-native-*` maintainers).
- **Lockfile integrity:** all 1018 `resolved` URLs point to `registry.npmjs.org`, and 0 entries are missing `integrity`.

---

### (a) Counts per class

| class | count |
|---|---|
| SAFE-NOW | 21 (1b: 6 · advisories: 10 · missing deps: 2 · tooling: 2 · size: 1) |
| NEEDS-BUILD | 19 (17 SDK-aligned + react-native-purchases + -ui) |
| MAJOR | 7 (expo SDK 57, async-storage 3, datetimepicker 9, gesture-handler 3, url-polyfill 4, typescript 7, eslint 10) |
| REMOVE | 1 (@expo/ngrok) |
| BACKEND | 1 (supabase-js client/functions drift) |
| WATCH | 28 |

### (b) Proposed fix groups

- **1. Lockfile / peer integrity:** nothing broken; `npm ls` and `npm ci --dry-run` are clean. Optional hygiene:
  - add devDependency `eslint-plugin-react-hooks@^5.2.0`;
  - change the plugin to `require('expo/config-plugins')`;
  - add `engines.node >=22.18` and `.nvmrc`.
- **2. SDK alignment:**
  - **JS-only:** none.
  - **Native (NEEDS-BUILD, one batch via `npx expo install --fix`, then prebuild, pod install and an EAS build):**
    - expo ~55.0.31
    - expo-apple-authentication ~55.0.17
    - expo-auth-session ~55.0.18
    - expo-blur ~55.0.18
    - expo-constants ~55.0.17
    - expo-crypto ~55.0.19
    - expo-dev-client ~55.0.40
    - expo-file-system ~55.0.26
    - expo-haptics ~55.0.18
    - expo-image-picker ~55.0.24
    - expo-linking ~55.0.17
    - expo-notifications ~55.0.27
    - expo-router ~55.0.18
    - expo-splash-screen ~55.0.25
    - expo-video ~55.0.21
    - expo-web-browser ~55.0.20
    - react-native 0.83.10
  - Optionally in the same native build: react-native-purchases and react-native-purchases-ui, both 10.10.2.
- **2b. JS-only direct bumps (SAFE-NOW, no native change):**
  - @react-navigation/native ^7.4.1
  - @react-navigation/bottom-tabs ^7.19.2
  - @react-navigation/elements ^2.9.43, plus `npm update @react-navigation/native-stack`
  - @supabase/supabase-js ^2.117.2
  - @types/react ~19.2.18
  - react-native-web 0.21.3 (lockfile)
- **3. Prod security advisories (lockfile-only, verified in scratch):** `npm update --package-lock-only @xmldom/xmldom nanoid postcss shell-quote js-yaml brace-expansion browserslist baseline-browser-mapping @babel/core`. Result:
  - xmldom 0.8.15/0.9.12, nanoid 3.3.19, postcss 8.5.28, shell-quote 1.10.0;
  - js-yaml 4.3.2/3.15.2, brace-expansion 1.1.21/5.0.12;
  - browserslist 4.29.1, baseline-browser-mapping 2.11.26, @babel/* 7.29.7+.

  @react-navigation/core 7.22.1 comes from group 2b. **Do NOT use `npm audit fix`**: it drags in the native expo 55.0.31 set.

  Remaining accepted (WATCH): image-size 1.2.1, decode-uri-component 0.2.2/query-string 7.1.3 (reachable via deep links, no in-range fix), and xcode › uuid 7.0.3.
- **4. Removals:** `@expo/ngrok` (devDependency).
- **6. Majors / native (not now):** Expo SDK 57 (RN 0.87, React 19.3, reanimated 4.7, gesture-handler 3, async-storage 3, datetimepicker 9), TypeScript 7, ESLint 10, react-native-url-polyfill 4.

### (c) Questions for Andrew

- **Majors**
  - Q-M1: Plan the Expo SDK 57 upgrade (latest is 57.0.25, and SDK 58 is in preview) as its own release, or stay on SDK 55 for 1.0.x?
  - Q-M2: ESLint 9 is npm-deprecated. Move to ESLint 10 now, which is dev-only but unverified with eslint-config-expo 55, or wait for the SDK upgrade?
- **Removals**
  - Q-R1: Remove `@expo/ngrok`? It is unmaintained since 2023-11 and brings a deprecated uuid@3 advisory. `expo start --tunnel` in the devcontainer would then prompt a one-time global install.
- **Native-build changes**
  - Q-N1: Ship the 17-package SDK 55 patch alignment (expo 55.0.31, RN 0.83.10) in the next native build (1.0.3), or leave 1.0.2's native set frozen and do JS/lockfile fixes only?
  - Q-N2: Include react-native-purchases(-ui) 10.10.2 (PurchasesHybridCommon 18→19) in that build? No official Expo 55 / RN 0.83 matrix was found.
  - Q-N3: Accept the decode-uri-component deep-link DoS until expo-router drops query-string 7? An ESM-only override is possible but risky.
- **Licence problems:** none in shipped JS. Q-L1: should a CocoaPods licence review (RevenueCat, PHC, Expo pods) be added for the App Store privacy/legal pack?
- **Size (code change, not a dep):** Q-S1: Switch the 4 barrel `@expo/vector-icons` imports to deep imports to drop about 2.0 MB of unused fonts?

---

## Part B — Deno Edge Functions dependency audit (read-only)

Branch `deps/audit-2026-09-25` @ c615385. Nothing in the repo was modified; `git status` still shows only the
pre-existing `CLAUDE.md` / `.claude/CLAUDE.md` edits. Raw outputs are in
`/private/tmp/claude-501/-Users-me-Desktop-partner-11-Codebases-Coach-Kettle/4a674559-8421-4443-9ef2-f37506f7e26e/scratchpad/audit-raw/deno-*`.

Toolchain: local Deno 2.9.6 (TypeScript 6.0.3), Node v26.10.0, Supabase CLI 2.117.0. The Supabase hosted edge
runtime is not necessarily on the same Deno/TS version, so treat the type-check results below as results from the
local toolchain.

### 0. Config inventory

- The only Deno config under `supabase/` is `supabase/functions/deno.json`. There is no `deno.jsonc`, no
  `import_map.json`, no `deno.lock` and no `package.json`.
- `supabase/config.toml` `[functions.*]` has only `verify_jwt = false` entries (17 functions). No per-function
  `import_map` or `entrypoint` overrides.
- The `deno.json` import map is **dead**. Every source file imports a full URL. The bare keys
  `@supabase/supabase-js`, `std/` and `http/` have zero users, and the two identity mappings
  (`https://deno.land/std@0.168.0/`, `https://esm.sh/`) do nothing. So resolution does not depend on whether
  `supabase functions deploy` reads this file. Deno 2.9.6 also warns `allowJs` is an unsupported compiler option,
  and the `jsx` / `jsxImportSource: react` options are unused because there are no .tsx files.

### 1. Import specifier inventory (source: `deno-imports-raw.txt`)

| Specifier | Resolved | Users |
|---|---|---|
| `https://deno.land/std@0.168.0/http/server.ts` (`serve`) | std 0.168.0 (pinned, immutable on deno.land) | 30: every `*/index.ts` (e.g. `chat/index.ts`, `iap/index.ts`, `health/index.ts`). Zero uses of `Deno.serve`. |
| `https://esm.sh/@supabase/supabase-js@2.48.0` | 2.48.0 exact → auth-js 2.67.3, postgrest-js 1.18.0, realtime-js 2.11.2, storage-js 2.7.1, functions-js 2.4.4, node-fetch 2.6.15 | 30: 29 function `index.ts` (all except `health`) + `_shared/nutritionTargetLoading.ts:1` (type-only). Examples: `chat/index.ts:5`, `delete-account/index.ts:17`, `meal-plan/index.ts:3`, `iap/index.ts:6`. |
| `https://deno.land/x/jose@v5.9.3/index.ts` | jose 5.9.3 (pinned) | 1: `iap/index.ts:7` (`compactVerify`, `importX509`, JWS only) |
| `node:test`, `node:assert/strict`, `node:vm`, `node:fs` | Node built-ins | Test files only (13 files). Not deployed. |

- There is **one** version of each package across all functions: no split supabase-js or std versions. No `npm:`
  or `jsr:` specifiers. No esm.sh query parameters (`?target=`, `?deps=`, `?no-dts`) anywhere, so all 30 imports
  are byte-identical.
- **Floating transitive dependencies through esm.sh.** The direct pins are exact, but esm.sh resolves the semver
  ranges of the pinned packages' own dependencies when it builds. The scratch lock recorded these redirects:
  `ws@^8.18.0→8.21.3`, `utf-8-validate@>=5.0.2→6.0.6`, `bufferutil@^4.0.1→4.1.0`, `node-gyp-build@^4.3.0→4.8.4`,
  `@supabase/node-fetch@^2.6.14→2.6.15`, `whatwg-url@^5.0.0→5.0.0`, `tr46@~0.0.3`, `webidl-conversions@^3.0.0`,
  and `@types/ws@~8.18.1`. All of them sit under realtime-js / node-fetch. The esm.sh build itself
  (`/denonext/*.mjs`) can also change when esm.sh upgrades. With no lock file, a redeploy can therefore ship
  different code from the last deploy even though no file in the repo changed.

### 2. `deno check`

Baseline command: `deno check --no-lock --cached-only supabase/functions/*/index.ts`. Result: **4 errors, matching
the known baseline** (`deno-check.clean.txt`):

1. `iap/index.ts:467:16`: TS2551, `Property 'catch' does not exist on type 'PostgrestFilterBuilder<…"subscription_events"…>'`
2. `notifications/index.ts:218:71`: TS2538, `Type 'symbol' cannot be used as an index type` (the `keyof typeof prefs` check)
3. `programming/index.ts:312:40`: TS2345, `Argument of type 'any' is not assignable to parameter of type 'never'` (the `exByDay` Map push)
4. `terms-acceptance/index.ts:76:14`: TS2322, `SupabaseClient<any,"public",any>` not assignable to `SupabaseClient<unknown,never,GenericSchema>`

**Error #1 is a real runtime defect that predates this audit, not just a typing problem.** In postgrest-js 1.18.0
(unpacked from npm, `dist/cjs/PostgrestBuilder.js`), `PostgrestBuilder` defines `then()` but no `catch()`, and
postgrest-js 2.106.1 (client `node_modules`) doesn't define one either. So in the JWS-verification-failure branch,
`supabaseAdmin.from("subscription_events").insert({...}).catch(...)` throws `TypeError: ... .catch is not a function`
before any request is sent, because the builder is lazy. The outer `catch` at `iap/index.ts:697` swallows the error,
and the function still returns `200 {ok:true}` (line 703), so Apple's retry behaviour is unaffected. The effect is
that the `apple_server_notification_verification_failed` audit row is **never written**. A supabase-js bump does not
change this, because neither version has `catch`.

**Lock consistency.** There is no `deno.lock` anywhere. On a scratch copy:
- `deno check --lock=<scratch>/deno.lock` did **not** write a lock, because the type-check fails before the lock is
  written.
- `deno cache --lock=<scratch>/deno.lock supabase/functions/*/index.ts` succeeded and produced a lock-file v5 with
  114 remote entries (23 from esm.sh) and 9 redirects.
- A second run with `--frozen` passed and left the file byte-identical.
- `--reload --frozen`, which re-downloads everything from the network, also passed. So as of 2026-09-25 the
  remote content is reproducible and a lock can be generated and stays stable.
- **Unverified:** whether Supabase CLI 2.117.0 `functions deploy` honours `supabase/functions/deno.lock` (or the
  `deno.json` next to it). Resolution does not depend on the import map (§0), but whether deploy enforces the lock
  was not tested. Deploys are off-limits.

### 3. Advisories

| Package@version | Advisory | Applies? |
|---|---|---|
| @supabase/supabase-js 2.48.0 (via auth-js 2.67.3) | **GHSA-8r88-6cj9-9fh5 / CVE-2025-48370**, Low (CVSS 2.7). Affects auth-js ≤2.69.1 (fixed in 2.70.0) and supabase-js 2.41.1–2.49.10. `admin.getUserById` / `deleteUser` / `updateUserById` / `listFactors` / `deleteFactor` did not validate that the ID is a UUID, allowing path confusion. Source: `npm audit` on a scratch manifest (`deno-npm-audit.json`) and github.com/advisories/GHSA-8r88-6cj9-9fh5 | **Not exploitable here.** The only affected call is `auth.admin.deleteUser(uid)` (`delete-account/handler.ts:380`), and `uid = user.id` (`handler.ts:288`) comes from the server-verified `getUser` result, not from user input. The first fixed supabase-js release is **2.50.0** (auth-js 2.70.0, verified with `npm view`). 2.49.10 is still vulnerable. |
| deno std 0.168.0 | std's advisories are GHSA-crjp-8r9q-2j9r (`@std/toml`, prototype pollution) and GHSA-32fx-h446-h8pf (`@std/http/file-server` `serveDir` XSS). Source: github.com/denoland/std/security/advisories | **No.** Only `http/server.ts` (`serve`) is imported, never toml or file-server. `serve` is deprecated in favour of `Deno.serve`. The last release on deno.land/std is **0.224.0**, per the `https://deno.land/std/http/server.ts` redirect. The successor is JSR `@std/http` 1.1.4. |
| jose 5.9.3 (deno.land/x) | panva/jose advisories: GHSA-hhhv-q57g-882q (JWE compressed-plaintext DoS, Mar 2024), GHSA-jv3g-j58f-9mq9 (JWE DoS, 2022), and 2021 padding-oracle issues | **No.** Every one of these predates 5.9.3 (released Sep 2024) and concerns JWE or older runtimes. `iap` uses JWS only (`compactVerify`, `importX509`). `npm audit` reports nothing for jose 5.9.3. The newest 5.x is 5.10.0; latest is 6.2.12 (major). |
| esm.sh transitive dependencies (ws 8.21.3 etc.) | `npm audit` on supabase-js 2.48.0's resolved tree reported only the auth-js issue above | Not affected today, but floating (§1). |

### 4. Drift vs the client

- Client: `package.json` `"@supabase/supabase-js": "^2.90.0"`, installed **2.106.1**, with all subpackages
  (postgrest, auth, realtime, storage, functions) at 2.106.1. Functions use **2.48.0**. npm latest is **2.117.2**
  (checked 2026-09-25).
- The client and functions share no code or types (`tsconfig` excludes `supabase/functions/**`), so this drift has
  no effect at compile time.
- **Contract risk of a bump.** 2.48 → 2.10x is effectively a **major** change underneath, because postgrest-js goes
  from 1.18.0 to 2.x (postgrest-js 1.19.4 is still used through supabase-js 2.50.x).
  - Messages generated by the PostgREST server (the usual `error.message`) do not change.
  - Errors generated inside the library can change wording: fetch failures, auth-js session and JWT errors, and
    abort/timeout messages.
  - These messages are **passed through verbatim** into HTTP response bodies:
    - `entitlements/index.ts` (87, 105, 158, 188, 209, 222, 293)
    - `profile/index.ts` (95–254, and the batch `details: errors` at 428)
    - `observability/index.ts:88`
    - `chat-history/index.ts:112`
    - `terms-acceptance/index.ts:141`
  - Messages also reach bodies indirectly: `coach/index.ts:79`, `entitlements/index.ts:43` and `profile/index.ts:45`
    build `Unauthorized: ${error.message}`, and `chat-history`, `chats` and `terms-acceptance` catch-all
    `error.message` into their responses.
  - The exact-string comparisons at `profile/index.ts:472/475` use server-raised messages, so they are unaffected.
  - Response **shape** (keys and status codes) is fully controlled by function code and would not change. Only
    the text of error bodies could change, and only on error paths.
  - Newer postgrest-js typings are stricter, so expect the `deno check` error set to change.
- **The Node test suite cannot detect a bump regression.** `node --test` baseline is **300/300 passing**
  (`deno-tests.txt`). The tests load each handler with `vm.runInNewContext` and stubbed transport
  (`chat/handler.test.ts:7,22`), so they never load esm.sh or real supabase-js.
- Edge runtime compatibility: 2.48.0 is running in production today. Recent supabase-js 2.x versions are published
  with Deno/edge support, but this audit did not verify that 2.10x runs on Supabase's hosted runtime.

### 5. Findings table

| package/specifier | current | wanted | latest | severity | class | evidence | proposed action |
|---|---|---|---|---|---|---|---|
| (no lock) `supabase/functions/deno.lock` | absent | lock generated by `deno cache` | n/a | medium (reproducibility) | SAFE-NOW | §2: scratch lock generated; `--frozen` and `--reload --frozen` both stable | Commit a generated lock. Changes no function code and needs no redeploy. Whether deploy honours it is unverified. |
| esm.sh transitive deps (ws, node-fetch, bufferutil, utf-8-validate, whatwg-url…) | float (e.g. ws `^8.18.0`→8.21.3) | frozen by lock | n/a | low | WATCH | lock `redirects` (§1) | Covered by the lock row. Re-check whenever supabase-js is bumped. |
| `https://esm.sh/@supabase/supabase-js@2.48.0` (30 files) | 2.48.0 | 2.50.0 (min fix) / 2.106.1 (match client) | 2.117.2 | low (GHSA-8r88-6cj9-9fh5, not exploitable) | BACKEND | npm audit; `delete-account/handler.ts:288,380`; §4 | **Proposal, not now.** Unified bump of all 30 specifiers + redeploy of 29 functions. Error text may change on 11 passthrough sites. Needs smoke testing (fix group 5B). |
| `https://deno.land/std@0.168.0/http/server.ts` `serve` (30 files) | 0.168.0 | n/a (code migration to `Deno.serve`) | 0.224.0 / jsr `@std/http` 1.1.4 | none (deprecated, no applicable advisory) | BACKEND | §3; no `connInfo` second argument used anywhere (grep) | **Proposal.** Migrate `serve(handler)` → `Deno.serve(handler)` in all 30 functions. This is a code change, not a version bump. The default response for uncaught errors may differ, so confirm every handler has its own top-level try/catch first. Redeploy all 30. |
| `https://deno.land/x/jose@v5.9.3` (`iap`) | 5.9.3 | 5.10.0 | 6.2.12 | none | WATCH | §3 | Leave as is. When `iap` is next touched, consider 5.10.0 or `jsr:@panva/jose`. 6.x is a major bump. |
| `deno.json` import map + compilerOptions | unused `@supabase/supabase-js`, `std/`, `http/` keys; `allowJs` (unsupported); `jsx*` | remove dead entries | n/a | none | REMOVE | §0: zero bare-specifier users; Deno warning in `deno-lock-cache1.txt` | Optional cleanup. Leave the map in place if 5B later wants a single edit point, and first verify that deploy reads it. |
| `iap/index.ts:467` `.insert(...).catch(...)` | throws TypeError; audit row never written | `try { await ...insert(...) } catch {}` | n/a | low (lost audit log, response unaffected) | BACKEND | §2: postgrest-js 1.18.0 and 2.106.1 builders have no `catch` | Fix outside dependency scope (fix group 5D). The response stays `200 {ok:true}`. Only `iap` needs a redeploy. |

**Class counts:** SAFE-NOW 1 · NEEDS-BUILD 0 · MAJOR 0 · REMOVE 1 · BACKEND 3 · WATCH 2 (total 7)

### 6. Proposed fix group 5 (Deno backend)

**5A: add a lock (SAFE-NOW, repo-only, no redeploy).**
1. From the repo root, run
   `~/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno cache --lock=supabase/functions/deno.lock supabase/functions/*/index.ts`.
   Use `cache`, not `check`: `check` never writes the lock while the 4 baseline type errors exist.
2. Verify with the same command plus `--frozen`, then again with `--reload --frozen`. Both must exit 0 without
   modifying the file.
3. Re-run the baseline `deno check --no-lock --cached-only supabase/functions/*/index.ts` and expect the same 4
   errors.
4. Run
   `node --test supabase/functions/*/handler.test.ts supabase/functions/*/*.test.ts supabase/functions/_shared/*.test.ts`
   and expect 300/300.
5. Stage only `supabase/functions/deno.lock`.
6. Note in the PR that whether Supabase CLI deploy honours the lock is unverified.
7. Side effect: once `deno.lock` sits next to `deno.json`, any `deno check` without `--no-lock` enforces it.

**5B: supabase-js unification bump (PROPOSAL; needs owner approval and a deploy window).**
1. Replace `https://esm.sh/@supabase/supabase-js@2.48.0` with `@2.50.0`, the smallest step that clears
   GHSA-8r88-6cj9-9fh5 and keeps postgrest-js 1.x (1.19.4), in all 30 files:
   the 29 `*/index.ts` files other than `health`, plus `_shared/nutritionTargetLoading.ts:1`.
   Edit the specifiers directly; the import map does nothing.
2. Aligning to 2.106.1 or later is a separate, larger step (postgrest-js 2.x) and should get its own review.
3. Regenerate the lock (5A).
4. Redeploy these 29 functions (every function except `health`):

   | Group | Functions |
   |---|---|
   | Workout and profile | body-metrics, chat, chat-history, chats, coach, default-templates, exercise-library, history, log-set, next-set, parse, pr-tracking, profile, programming, resting-hr, workout-templates |
   | Nutrition | food-barcode, food-log, meal-plan, nutrition-analyze, nutrition-targets |
   | Account and billing | delete-account, entitlements, iap, revenuecat-webhook, terms-acceptance |
   | Other | daily-feedback, notifications, observability |

5. Verification:
   - `deno check`: the error set must equal the 4 baseline errors, or any difference must be explicitly reconciled.
   - Node tests: 300/300.
   - Local `supabase functions serve --env-file .env.local`: smoke test the success path and one forced-error path
     on entitlements, profile, observability, chat-history and terms-acceptance. Diff the response bodies against
     2.48.0; they must be byte-identical on success paths.
   - Check the delete-account flow and the iap / revenuecat-webhook 200 semantics.

**5C: `serve` → `Deno.serve` (PROPOSAL).**
1. In all 30 `index.ts` files, remove the std `serve` import and call `Deno.serve(async (req) => …)`.
2. Confirm every handler has a top-level try/catch that returns its own JSON error.
3. Redeploy all 30. Run the same verification as 5B.

**5D: iap `.catch` defect (BACKEND fix, separate from dependencies).**
1. At `iap/index.ts:463-467`, wrap the insert in `try { await supabaseAdmin.from("subscription_events").insert({...}); } catch { /* best-effort log */ }`.
   Run `node .gitnexus/run.cjs impact "handleNotification" --direction upstream --repo .` first.
2. `deno check` should then drop to 3 errors.
3. Redeploy `iap` only. The response contract is unchanged (still `200 {ok:true}`); the only difference is that
   the audit row is now actually written.

---

## Phase 2 outcome (fixes applied on `deps/audit-2026-09-25`)

Andrew's answers:
- Majors: **apply now**.
- Removals: **remove now**.
- Native-build changes: **SDK alignment + RevenueCat allowed**.
- iOS 16.4 minimum: **approved** during Task 8, because SDK 57 requires it.
- Licences: no issue found, so not asked.

### Commits (c615385..8fe8397)
| SHA | Commit | Files |
|---|---|---|
| 78d386d | chore(deps): declare eslint-plugin-react-hooks and use expo/config-plugins | package.json, package-lock.json, plugins/withPodfileMinDeploymentTarget.js |
| 58e092d | chore(deps): align Expo SDK 55 patch versions (needs native build) | package.json, package-lock.json |
| dba765f | fix(deps): patch production advisories via lockfile leaf updates | package.json, package-lock.json |
| 67612c7 | chore(deps): bump @supabase/supabase-js to 2.x latest | package.json, package-lock.json |
| 56a26c9 | chore(deps): remove unused @expo/ngrok | package.json, package-lock.json |
| acf104e | chore(deno): drop unused import-map entries | supabase/functions/deno.json |
| 06e6dc8 | chore(deno): remove stale root deno.lock | deno.lock |
| bc3a0b1 | chore(deno): bump functions supabase-js to 2.50.1 (GHSA-8r88-6cj9-9fh5) | 29 `supabase/functions/*/index.ts` + `_shared/nutritionTargetLoading.ts` (specifier line only) |
| 89755a2 | chore(deps): upgrade to Expo SDK 57 (needs native build) | package.json, package-lock.json, app.json, eas.json, eslint.config.js, plugins/withPodfileMinDeploymentTarget.js, lib/nutrition.ts, 3 lib tests, app/(tabs)/index.tsx, app/_layout.tsx, components/{celebration/PRCelebration, media/MediaPickerBubble, nutrition/BarcodeScannerModal, ui/haptic-tab, workout/WorkoutBottomBar}.tsx |
| da888bd | fix(deps): keep expo/fetch timeouts out of the nutrition offline queue | lib/nutrition.ts, 2 lib tests |
| f6e71ec | chore(deps): bump react-native-purchases(-ui) to 10.10.2 (needs native build) | package.json, package-lock.json, lib/__tests__/revenueCatErrors.test.ts |
| 8fe8397 | chore(deps): upgrade react-native-url-polyfill to 4 | package.json, package-lock.json, lib/__tests__/urlPolyfill.test.ts |

**Cut point before SDK 57: `bc3a0b1`.** That commit carries the SDK 55 alignment, the security fixes, supabase-js and the Deno work without the SDK 57 upgrade, and it can be merged on its own.

### Before / after
| Check | Before (c615385) | After (8fe8397) |
|---|---|---|
| `npm audit --omit=dev` | 25 | **15 moderate** (0 high) |
| `npm audit` (all) | 26 | **15 moderate** |
| expo-doctor | 17 SDK mismatches | **21/21 checks passed** |
| iOS `.hbc` | 7,955,450 B | 7,993,210 B (+37,760 B, +0.5%) |
| lib tests | 680/680 | **698/698** (+18 new) |
| functions tests | 300/300 | 300/300 |
| lint / tsc | 0 / 0 | 0 / 0 |
| deno check | 4 known errors | the same 4, byte-identical text |
| Native simulator build (Xcode 27 beta, local) | SDK 55: BUILD SUCCEEDED | SDK 57 + RevenueCat 10.10.2: BUILD SUCCEEDED |
| Every commit on its own (detached worktree: npm ci, tsc, lib tests) | — | 12/12 green |

Remaining advisories are all WATCH:
- `decode-uri-component` / `query-string` 7 via expo-router, including the `@react-navigation/core` path. It is reachable through deep links and has no in-range fix.
- `xcode` → `uuid@7`, which is prebuild-only.

### Not applied despite approval (evidence in the ledger)
- **TypeScript 7:** every `@typescript-eslint` 8.x (used by eslint-config-expo 57) declares a `typescript <6.1.0` peer, and SDK 57 expects `~6.0.3`.
- **ESLint 10:** `eslint-plugin-react` 7.37.5 and `eslint-plugin-import` 2.32.0, both required by eslint-config-expo, cap eslint at ^9.
- **async-storage 3 / gesture-handler 3:** SDK 57 `bundledNativeModules.json` pins 2.2.0 and ~2.32.0.
- **supabase functions `deno.lock` (5A):** kept as a proposal. It would be a v5 lock, and whether deploy honours it is unverified.

### Rulings made on Andrew's behalf (in order, each with its cost if wrong)
- ledger lives at .superpowers/sdd/deps-audit/ (prompt-specified) instead of the sdd-workspace default dir — the prompt is binding — cost if wrong: none (git-ignored scratch).
- work in place on the new branch rather than a separate worktree — working tree only has the unstaged CLAUDE.md edits (never staged), and node_modules is here for npm/expo tooling — cost if wrong: a stray `git add` could pick up CLAUDE.md; mitigated by explicit-path staging.
- parallelised the two read-only audit halves — no shared writes, prompt forbids only parallel implementers — cost if wrong: concurrent npx runs slow each other; no correctness impact.
- 5A (commit supabase/functions/deno.lock) downgraded from SAFE-NOW to proposal — lock is v5 and deploy/edge-runtime honouring is unverified; an older runtime rejecting v5 would block every `supabase functions deploy` incl. an urgent iap fix — cost if wrong: esm.sh transitive resolution stays unfrozen one more cycle.
- stale root deno.lock goes into the removals question (unused, misleading) — cost if wrong: none if kept; tooling that passes --lock=deno.lock explicitly would need regeneration if removed.
- 5D (iap `.catch` TypeError at iap/index.ts:467) is a payments-path behaviour change outside dependency scope → written up as proposal, not applied; deno check baseline stays 4 errors — cost if wrong: subscription_events audit rows on failed Apple verification stay unwritten until a follow-up.
- 5C (std serve → Deno.serve) proposal only — code migration across 30 functions, not a dep bump — cost if wrong: none (deprecated API keeps working).
- engines/.nvmrc NOT added — eas.json has no node pin, and a new .nvmrc can change the EAS build Node version — cost if wrong: devcontainer (Node 20) keeps being unable to run TS tests; documented as proposal.
- decode-uri-component (via expo-router → query-string 7) stays WATCH — no in-range fix, ESM override risky — cost if wrong: crafted deep link can cause a client-side hang (DoS, no data exposure).
- @expo/vector-icons deep imports (~2.0 MB) = code change → proposal only — cost if wrong: bundle stays 2 MB heavier.
- CocoaPods licence review = proposal; no copyleft in shipped JS so no licence question asked — cost if wrong: a pod licence issue surfaces later in legal review.
- client supabase-js 2.106→2.117 is a minor (not major) JS-only bump → apply as its own Opus task with the sign-in smoke list — cost if wrong: an auth/session regression in the next OTA/build, caught by the smoke list.
- keep Task 2 (SDK 55 alignment) even though Task 8 (SDK 57) supersedes it — the prompt fixes the group order, and the commit gives Andrew a shippable SDK-55-aligned rollback point — cost if wrong: one redundant lockfile churn commit.
- the Expo SDK 57 upgrade is ONE task (expo + every SDK-pinned package via `npx expo install expo@^57 --fix`), not one task per package — SDK-pinned packages are version-locked together and cannot be verified in isolation (expo-doctor fails for partial sets) — cost if wrong: a larger single review surface.
- a major that conflicts with the SDK 57 expected version (expo-doctor/`expo install --check` would flag it) is NOT applied and gets a write-up with evidence — "expo-doctor 0 mismatches" is a binding verification gate — cost if wrong: Andrew wanted it forced anyway; trivial to apply later.
- RevenueCat bump runs AFTER SDK 57, targeting the newest 10.x (≥10.10.2) whose peer range and changelog support the SDK 57 React Native version — avoids bumping twice — cost if wrong: none.
- Deno supabase-js target is 2.50.0 (smallest version clearing GHSA-8r88-6cj9-9fh5, keeps postgrest-js 1.x) — not 2.117 — Andrew approved the 2.50 bump as asked; 2.10x brings postgrest-js 2.x and error-text passthrough risk to live 1.0.1/1.0.2 clients — cost if wrong: another redeploy wave later to align further.
- bundle baseline is 7,955,450 B (7.59 MiB), measured by Task 1 on c615385 in scratch; the audit's 5.0 MiB figure is replaced — cost if wrong: size deltas in the hand-off are off by a constant.
- accept the implementer's ERESOLVE resolution (deleted 4 stale lock entries pinning @expo/log-box 55.0.12, re-resolved with `npm install --package-lock-only`, no --force/--legacy-peer-deps) — it is a lockfile-only re-resolution the prompt allows; `--fix` second pass is a no-op and `--check` clean — cost if wrong: a subtly different transitive resolution; caught by npm ci + npm ls single-copy checks.
- T3: react-navigation held at Expo SDK 55 recommended versions (doctor 20/20); @react-navigation/core→query-string advisory → WATCH — expo-router itself depends on query-string@^7.1.3 so the vulnerable code stays reachable either way; the bump only removes a duplicate path; SDK 57 (Task 8) moves navigation forward — cost if wrong: one moderate advisory path stays until Task 8. Implementer asked to amend 5a02621.
- pre-existing realtime cleanup bug (app/(tabs)/index.tsx:403 `unsubscribe()` vs `removeChannel()` on 'pr_breakthroughs') is out of dependency scope → proposal in hand-off, not fixed — cost if wrong: PR-celebration realtime backup channel can stay dead after account switch until a follow-up.
- @supabase engines node>=22 with no EAS node pin → documented in hand-off (EAS SDK 55+ images ship Node ≥20; mismatch only warns) — cost if wrong: an EAS build warning; not a failure.
- brief's "nothing auto-discovers root deno.lock" was wrong (Deno 2 discovers it next to root package.json); removal still stands — functions resolve against the nearer supabase/functions/deno.json and never used it — no .gitignore entry added (not asked; would hide a lock Andrew might later want) — cost if wrong: a root-level `deno run` may recreate an untracked deno.lock.
- .claude/CLAUDE.md:112 ("import map in supabase/functions/deno.json") now stale — never staged per rules; flagged for Andrew in hand-off — cost if wrong: future agents look for a map that is empty.
- T7: Deno supabase-js target changed 2.50.0 → 2.50.1 — 2.50.0 (and 2.49.10) crash 29/29 functions at boot (realtime-js 2.11.10 static ws import; esm.sh denonext ws@8.21.3 require shim lacks node:url), 2.50.1 only swaps realtime-js to 2.11.13 (isows), keeps auth-js 2.70.0 (GHSA fix) + postgrest-js 1.19.4; contract gate 29/29 byte-identical over 1,393 responses — still within Andrew's approved 2.50 bump — cost if wrong: hosted runtime could differ from local boot probe; mitigated by the deploy smoke list.
- every commit must be green alone — T8 optional "migrate later" commit removed; migrations ride with the bump — cost if wrong: none (stricter).
- native compile gate REQUIRED for T8/T9: scratch prebuild + pod install + simulator xcodebuild via DEVELOPER_DIR=~/Downloads/Xcode-beta 1.app (Xcode 27.0 beta, the only Xcode; xcode-select untouched), with an SDK 55 baseline compile to separate beta-toolchain failures — cost if wrong: beta toolchain false negatives; mitigated by baseline comparison.
- lint policy for SDK 57 — no mass refactor for new rules, no silent disabling; rule-specific justified severity changes only — cost if wrong: some new hook-rule warnings deferred.
- iOS deployment target raise is NOT a controller ruling — T8 STEP 0 stops with NEEDS_CONTEXT so Andrew decides (Q3 never covered dropping iOS versions) — cost if wrong: one extra question to Andrew.
- Task 7: minor (deferred): boot-probe/contract-harness live only in session scratch — not reproducible later (see review-t7-result.md for minor 2). Ruling: not committed in this pass (prompt forbids scope creep; scripts are ad-hoc) — proposal to add a committed boot-probe script — cost if wrong: next Deno bump must rebuild the harness.
- T8: iOS 27 scene lifecycle — enableSceneSupport stays OFF; pin EAS iOS image to documented Xcode 26.x (≥26.4) in eas.json, else hand-off warning; scene-support adoption = proposal — a wrong pin fails loudly at build time whereas scene support changes runtime lifecycle (notifications, auth redirects, deep links, paywall) that compile-only gates can't verify — cost if wrong: Apple's eventual iOS 27 SDK submission requirement forces the scene-support follow-up.
- T8: SDK 56+ global expo/fetch throws FetchError (not TypeError) → fix lib classifiers (isRetryableNutritionError + any other TypeError/'Network request failed' classifier) with TDD in the SDK 57 commit, not EXPO_PUBLIC_USE_RN_FETCH opt-out — cost if wrong: an unclassified path treats offline as a hard failure (offline queue drops retries).
- Task 8: implementer squashed c37eada+f37adca → 89755a2 via reset --soft (tree b17253a identical to f37adca; verified). Ruling: accept the squash — local unpushed history, content byte-identical, one commit per task matches the prompt — cost if wrong: none. Reviewer rev-t8 reviews c37eada content; eas.json delta (c37eada..89755a2) goes to scoped re-review.
- Task 8: fix round 1 dispatched (resume impl-t8), FIX_BASE 89755a2. Ruling: fix goes in a separate green commit rather than an amend (keeps the reviewed commit stable for the scoped re-review) — cost if wrong: two commits in Task 8.
- Tasks 10, 11, 13 batched into one dispatch (impl-t10) — each is a same-shape "check SDK-57 expected version, apply only if compatible" evaluation; package.json already shows SDK 57 pins typescript ~6.0.3, async-storage ^2.2.0, gesture-handler ~2.32.0, datetimepicker 9.1.0 — cost if wrong: one reviewer covers three evaluations.
- TS 7 and ESLint 10 NOT applied despite Andrew's "apply majors" — the eslint-config-expo 57 toolchain's published peer ranges exclude them (applying would split the tree / need --legacy-peer-deps, which the prompt forbids without a ruling and which would break lint) — cost if wrong: Andrew expected them now; they land when eslint-config-expo/typescript-eslint support them.
- async-storage 3 / gesture-handler 3 NOT applied — SDK 57 pins 2.x; expo-doctor 0-mismatch gate is binding — cost if wrong: same as above, arrives with a future SDK.
- no separate reviewer for Tasks 10/11/13 — no diff exists; controller verified the peer-range evidence directly (above) — cost if wrong: an evidence error goes unreviewed until the final review (which gets this ledger).
- pre-existing deep-link fallback bug app/auth/sign-up.tsx:66 (`parsed.path?.includes('auth/callback')` never matches coachkettle://auth/callback — 'auth' parses as host) → proposal, not fixed (auth behaviour change outside dependency scope) — cost if wrong: that fallback path stays dead; primary auth flow unaffected per report.
- no final fix wave — nothing Critical/Important; minor 2 deferred as follow-up — cost if wrong: an expo patch moving FetchErrors.ts breaks two tests (loudly).
- T1↔T8: Task 8's brief amended to re-pin eslint-plugin-react-hooks with the new eslint-config-expo — cost if wrong: a duplicate plugin copy (final state: one copy, 7.1.1).

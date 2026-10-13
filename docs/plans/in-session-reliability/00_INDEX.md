# Coach Kettle in-session reliability — master index

Planning-only handoff at `e9f96fe6190187472c4ada2f584e8526fec13e41`, branch `deps/audit-2026-09-25`. No estimates or deadlines: modular sections follow the latest user clarification. Production files are unchanged; existing `CLAUDE.md` and `.claude/CLAUDE.md` edits are not ours.

## Ranked roadmap and execution order
**Latest authorized gate:** Parent reports bounded I2 and latest P1 independently SPEC PASS / QUALITY APPROVED. P1 reviewer receipts3127 full /144 P1+schedule /10 extra checks; lint/typecheck/diff exit0. These are offline gates, not native/provider/DB approval. P2 F3/F4 is now **implementation_pending_review**: synchronous End ownership/snapshot/save phases, finalization freeze/dismiss guards, local-first performance independent of optional review, honest failure/retry, request/owner/lifecycle and P1-generation fences. Final77 P2 /144 P1+schedule /119 retained I2 /2191 retained input /3204 full pass; lint/no warnings, direct app tsc/diff exit0. Independent SPEC then QUALITY required. [P2 evidence/defaults/limits](evidence/p2-session-ownership-local.md). Prior P1/I2 implementation receipts below and in linked evidence remain historical; no deployment.
**Historical I2 implementation progress:** Prior bounded D1/I1 input repair independently SPEC PASS / QUALITY APPROVED per parent handoff; whole D1/I1 remain **partial**. Parent reports I2 SPEC PASS then QUALITY REQUEST R1. The new incomplete AI actual-reps edit loss is repaired locally with shared inline/modal transition and strict production-path TDD; I2 is **pending independent spec regression then quality re-review**, not complete. Ten new quality regressions; 100 targeted /2989 full /2191 retained first-slice tests pass; lint/direct app tsc/diff exit0. Original quality repro2/0; old64-case independent probe63/1 has obsolete clean-row ID expectation (left unchanged); retained10/345/9 probes green. Real API builder/edits/End/draft/history serializers exercised offline. Graph remains CRITICAL/27 flows, stale/truncated. See repository `doc.md` and [I2 local defaults](DECISIONS.md#i2-local-repair-defaults--not-clinical-policy). No deployment/native/DB approval; original planning handoff remains historical.

**Historical composer follow-up:** Shared actual-vs-legacy provenance now governs single/batch shorthand and named fills as well as inline/modal edits. Actual AI reps survive load-only completion without fake targets; genuine prescriptions remain separate. Nineteen additional integrated composer regressions: final **119 targeted /3008 full /2191 retained first-slice**, all pass; lint/direct app tsc/diff exit0. I2 remains **implementation_pending_review**, requiring independent spec then quality review. See `doc.md` for strict RED/GREEN and unchanged limitations.

1. **D1 → I1 → I2:** [Input integrity](01_INPUT_INTEGRITY.md). Stop false numbers, symptom loss, planned/performed mixing and warmup mutation first.
2. **I3 → H1:** [Numeric/history boundaries](01B_NUMERIC_HISTORY.md). Align UI/Edge/SQL validation, bodyweight/unknown semantics, canonical aliases and prior completed session.
3. **P1 → P2 → P3 → P4 → P5:** [Session persistence](02_SESSION_PERSISTENCE.md). Draft recovery, End/late-response ownership, cardio roundtrip, idempotency/finalization, local storage races. P1 can begin after I2 while I3/H1 proceed; P3 also needs I3.
4. **C1, C2, C3:** [Coaching transport/context](03_COACHING_TRANSPORT_CONTEXT.md). Context retention, lossless SSE and honest errors/review/rest. C2 can start after D1; C1 after I2/P2; C3 after I2/P2/P3.
5. **A1 → A2 → A3:** [Proposed adaptive coaching](04_ADAPTIVE_COACHING.md). Requires approved policy and stable data/ownership; not currently implemented. A1 also needs I3/P1/P2/C1; A2 needs H1/P4; A3 needs C2/C3.
6. **V1 → V2 → V3:** [Verification/release](05_VERIFICATION_RELEASE.md). Risk experiments, offline/local-DB/native gates and human-controlled rollout. Baseline reliability may release separately only with equivalent applicable V2/V3 gates; adaptive remains disabled.

[Policy blockers](DECISIONS.md) • [Machine-readable task/dependency map](tasks.json) • [Graph/current-source evidence](evidence/discovery-impact.md)

## Ownership and independent work
- **One exclusive HomeScreen integrator owns `app/(tabs)/index.tsx` throughout. No concurrent edits.** Other workers deliver pure helpers, fixtures or proposed diffs; integrator serially wires I2/I3/P1/P2/P3/P4/C1/C3/A1/A3/V1. Reassign explicitly at task boundary.
- Separate lanes: C2 SSE/Edge tests after D1; I3 numeric/SQL contract lane after I2; P1 draft helper lane after I2; H1 history baseline after I3. No lane edits shared files concurrently.
- Also serialize ownership of `lib/api.ts`, `types/workout.ts`, `lib/workoutStorage.ts`, `lib/programming.ts`, history/log-set/next-set Edge files and migrations. File-level locks beat optimistic simultaneous merges.
- Main dependency spine: D1→I1→I2→P1→P2→P3→P4→A2→A3→V1→V2→V3, with I3/H1 and C1/A1 prerequisites joining it. No elapsed-duration claim.

## Complete audit-to-task coverage
Overlapping findings have one primary repair task; follow-on integration/verification is not another copy of the same fix.

| Audit ID | Primary task |
|---|---|
| S1 | [I1](01_INPUT_INTEGRITY.md) |
| S2 | [I1](01_INPUT_INTEGRITY.md) |
| S3 | [I2](01_INPUT_INTEGRITY.md) |
| S4 | [I2](01_INPUT_INTEGRITY.md) |
| S5 | [I2](01_INPUT_INTEGRITY.md) |
| S6 | [I1](01_INPUT_INTEGRITY.md) |
| S7 | [I3](01B_NUMERIC_HISTORY.md) |
| S8 | [I3](01B_NUMERIC_HISTORY.md) |
| S9 | [H1](01B_NUMERIC_HISTORY.md) |
| S10 | [C3](03_COACHING_TRANSPORT_CONTEXT.md) |
| Q1 | [I1](01_INPUT_INTEGRITY.md) |
| Q2 | [C1](03_COACHING_TRANSPORT_CONTEXT.md) |
| Q3 | [C3](03_COACHING_TRANSPORT_CONTEXT.md) |
| Q4 | [C3](03_COACHING_TRANSPORT_CONTEXT.md) |
| Q5 | [C2](03_COACHING_TRANSPORT_CONTEXT.md) |
| F1 | [P3](02_SESSION_PERSISTENCE.md) |
| F2 | [P1](02_SESSION_PERSISTENCE.md) |
| F3 | [P2](02_SESSION_PERSISTENCE.md) |
| F4 | [P2](02_SESSION_PERSISTENCE.md) |
| F5 | [P4](02_SESSION_PERSISTENCE.md) |
| F6 | [I3](01B_NUMERIC_HISTORY.md) |
| F7 | [I2](01_INPUT_INTEGRITY.md) |
| F8 | [P1](02_SESSION_PERSISTENCE.md) |
| F9 | [P1](02_SESSION_PERSISTENCE.md) |

## Supplemental observations and architecture/risk coverage
- Parser bare-number ambiguity: I1/D02. Rest classifier, warmup/batch rest and old prompt: C3/D03/D07/P2. Fixed goal/equipment increments, dormant delta label: H1/A2; dormant casing refresh: H1/A3.
- Missing structured answers, pain/fatigue priority, freshness, skipped=unknown and explanation divergence: A1/A2/A3. Historical omitted notes, last10 context loss, cross-session archives and missing durable set/exercise association: C1/A1.
- Late live commits, abandoned corrections, daily-session collision: P4 (unverified SQL barriers required). Local history/retry stale writes: P5. Draft ordering/restore-import: P1. Reorder races/grouping policy/absent undo: V1/D10, not presumed bugs.
- Existing pure tests do not prove mounted session/storage/DB behavior: D1/V2. Offline fixtures do not prove unsafe provider advice, deployed versions, injury prevention or native behavior.

## Definition of done / release gates
- All 24 ranked IDs have desired-behavior regressions red before change and green after, including actual HomeScreen wiring; preserve exact input/evidence and validate local save readback.
- App lint/typecheck, Edge checks and isolated PostgreSQL numeric/RLS/commit-barrier fixtures complete with actual output. Prior runtime-guard failures remain blocked, not passes.
- Real simulator/device matrix covers process death/overnight/rapid entry/End/late answers and adaptive stop/clarify/refresh. Each unverified risk is reproduced/fixed or explicitly accepted with evidence.
- Product decisions D01–D10 resolved or associated optional scope deferred; no invented thresholds. Adaptive feature has separate approval and feature-disable path.
- Authorized human controls migrations/deploys/Apple release; exact target readback and compatibility/rollback documented. Human/device signoff and Apple processing are external prerequisites, not coding completion.

## Durable evidence
Reports copied verbatim: [set audit](evidence/coach-kettle-set-audit.md), [question audit](evidence/coach-kettle-question-audit.md), [state audit](evidence/coach-kettle-state-audit.md). Their scratch source/probe paths and limitations remain intact. Probes stay in `/Users/me/.hermes/profiles/telegramlite/cache/scratch/`; parent reports all three rerun successfully. Planning pass verified current source/graph but did not run device, PostgreSQL or provider tests.

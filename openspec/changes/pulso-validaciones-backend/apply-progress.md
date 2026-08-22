# Apply Progress: PULSO Backend Safety Kernel

## Completed Tasks
- [x] 1.1 Contracts: triage Zod schema, PULSO envelope/error filter, routing states and evidence/idempotency types.
- [x] 1.2 Pure clinical and eligibility policies with review gating, hard-rule reasons, and CRUE escalation.
- [x] 1.3 Pure table-driven case and handshake lifecycle transitions.
- [x] 2.1 Deterministic minute-cost ranking with stable ties and ETA provenance.
- [x] 2.2 Canonical versioned decision evidence with fail-closed validation.
- [x] 3.1 PostgreSQL routing-store migration, atomic state/audit transaction, idempotency replay/conflict, and append-only evidence.
- [x] 3.2 Real two-client PostgreSQL competing-destination test proving exactly one acceptance.
- [x] 3.3 Memory routing-store parity contract, explicit memory-only module, and immutable audit snapshots.
- [ ] 4.1 Partial routing unit/E2E coverage; handshake/estado authority and PostgreSQL atomicity scenarios remain.
- [ ] 4.2 Partial routing orchestration; handshake/estado integration and atomic PostgreSQL decision persistence remain.

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN (exact execution result) | TRIANGULATE | REFACTOR (post-refactor green) |
|---|---|---|---|---|---|---|---|
| 1.1 | `routing-contracts.spec.ts` | Unit | N/A: new contract test file; no prior contract baseline recorded. | Missing schemas/filter modules; later the added `BadRequestException` assertion failed with `PULSO_INTERNAL` instead of `PULSO_INVALID_INPUT`. | `pnpm.cmd --dir apps/backend/core test --runInBand routing`: exit 0, 1 suite / 2 tests passed after initial contracts; after error mapping, 3 suites / 6 tests passed. | Valid request, malformed request, explicit PULSO error, and 400 mapping. | Centralized envelope mapping; 3 suites / 6 tests passed. |
| 1.2 | `routing-policies.spec.ts` | Unit | Original: N/A, new policy test. Correction: `pnpm.cmd --dir apps/backend/core test --runInBand routing` exit 0, 3 suites / 6 tests passed before editing. | Missing clinical/eligibility modules. | `pnpm.cmd --dir apps/backend/core test --runInBand routing`: exit 0, 2 suites / 4 tests passed. | Coherent/low-confidence/inconsistent triage plus eligible/no-destination cases. Correction added direct `INSUFFICIENT_COMPLEXITY` and `MOVIL_INCOMPATIBLE` assertions; both passed immediately as extensions of the original cycle, not fabricated REDs. | Kept pure rule/failure-list shape; correction final: 3 suites / 8 tests passed. |
| 1.3 | `routing-lifecycle.spec.ts` | Unit | N/A: new lifecycle test file; no prior lifecycle baseline recorded. | Missing lifecycle module. | `pnpm.cmd --dir apps/backend/core test --runInBand routing`: exit 0, 3 suites / 6 tests passed. | Declared and illegal transitions for both case and handshake states. | Isolated transition tables; 3 suites / 6 tests passed. |
| 2.1 | `scoring-safety.spec.ts` | Unit | `pnpm.cmd --dir apps/backend/core test --runInBand scoring`: exit 1, no matching tests existed; not a behavioral regression. | Missing `ranking-policy` module; later ETA-service fallback provenance test failed because the result omitted provenance. | Initial green: exit 0, 1 suite / 2 tests; ETA provenance correction: exit 0, 2 suites / 5 tests. | Repeated identical ranking, primary/fallback selector, and actual no-token ETA fallback provenance. | Shared comparator wired into `ScoringService`; 2 suites / 5 tests passed. |
| 2.2 | `scoring-evidence.spec.ts` | Unit | 2.1 green baseline: 1 suite / 2 tests passed. | Missing `decision-evidence` module; later, omitted ETA provenance incorrectly passed `canDispatch`. | `pnpm.cmd --dir apps/backend/core test --runInBand scoring`: exit 0, 2 suites / 4 tests passed. | Canonical object-key ordering, fallback provenance, missing-version, and missing-provenance fail-close with `PULSO_INCOMPLETE_EVIDENCE`. | Sorted-key SHA-256 canonicalization; 2 suites / 4 tests passed. |
| 3.1 | `postgres-routing.store.spec.ts` | PostgreSQL integration | Original: `pnpm.cmd --dir apps/backend/core test --runInBand postgres concurrency`: exit 0, 2 suites / 5 tests before the new PostgreSQL test. Correction: same command exit 0, 3 suites / 8 tests before the bounded fix. | Original: missing `./postgres-routing.store`. Correction: `pnpm.cmd --dir apps/backend/core test --runInBand postgres-routing.store.spec.ts`: exit 1, 1 suite / 5 tests with `TRUNCATE` succeeding and concurrent same-key calls throwing raw idempotency PK errors. | Original green: 1 suite / 3 tests after migration and adapter. Correction green: same command exit 0, 1 suite / 5 tests after transaction-scoped key locking and `TRUNCATE` guard. | Transactional migration rollback leaves no table; failed audit insert rolls back case state; same request replays one audit; UPDATE, DELETE, and TRUNCATE trigger rejections are append-only; a different fingerprint returns `PULSO_IDEMPOTENCY_CONFLICT`; two independent clients use a trigger gate to expose the absent-key race. | Formatted advisory-lock query and test setup; focused test exit 0, 1 suite / 5 tests and full `postgres concurrency` exit 0, 3 suites / 10 tests. |
| 3.2 | `postgres-routing.store.spec.ts` | PostgreSQL integration / concurrency | Original: 3.1 green 1 suite / 3 tests. Correction: `postgres concurrency` exit 0, 3 suites / 8 tests before the bounded fix. | Original missing adapter RED. Correction RED: the 1-suite / 5-test run exposed raw PK errors for same-key/same-fingerprint replay and same-key/different-fingerprint conflict. | Original green: 1 suite / 3 tests including two independent `pg.Pool` clients. Correction green: `postgres-routing.store.spec.ts` exit 0, 1 suite / 5 tests. | Competing A/B responses yield one acceptance, one destination rejection, and one audit row; gated same-key clients replay identical fingerprints without duplicate audit and return a structured idempotency conflict for different fingerprints. | Transaction-scoped `pg_advisory_xact_lock(hashtextextended(requestKey, 0))` serializes absent idempotency keys; full `postgres concurrency` exit 0, 3 suites / 10 tests. |
| 3.3 | `routing-store-concurrency.spec.ts` | Unit | `postgres concurrency`: 1 suite / 2 existing migration tests passed. | Missing `memory-routing.store` module. | Initial green: 2 suites / 4 tests passed. | Replay/no duplicate audit, same-key fingerprint conflict, and competing acceptance rejection. | Audit snapshot mutation test first failed; `structuredClone` made the audit append-only. Final: 2 suites / 5 tests passed. |
| 4.1 | `routing.service.spec.ts`, `test/routing.e2e-spec.ts` | Unit + Nest E2E | Original E2E baseline: 1 suite / 1 health test; correction baseline: E2E 2 suites / 4 tests and routing unit 1 suite / 3 tests. | Original missing service/default envelope/review 201. Correction RED: a fresh `RoutingService` lost the in-process evidence and returned `PULSO_INCOMPLETE_EVIDENCE`. | Original green: unit 3/3, E2E 2/2. Correction green: routing unit exit 0, 1 suite / 4 tests; E2E exit 0, 2 suites / 4 tests. | Store-backed match evidence survives a new service instance; no-viable matching persists `escalated_to_crue`; existing malformed/review/evidence HTTP paths remain covered. | Store port/adapters formatted; unit 4/4, E2E 2/4, PostgreSQL concurrency 3/10, tsc/build pass. |
| 4.2 | `routing.service.spec.ts`, `test/routing.e2e-spec.ts` | Unit + Nest E2E | Same PR4 correction baseline. | Same durable-authority RED. | Store-backed routing service, safe provider selection, and async controller adapters made unit 4/4 green. | Memory and PostgreSQL adapter suites retain replay/concurrency semantics while durable match and CRUE state are added. | E2E 2 suites / 4 tests, PostgreSQL 3 suites / 10 tests, `tsc --noEmit` and build exit 0. |
## Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test | `pnpm --dir apps/backend/core test --runInBand routing` (executed as `pnpm.cmd` on Windows): exit 0; 3 suites, 8 tests passed. |
| Type check | `pnpm --dir apps/backend/core exec tsc --noEmit` (executed as `pnpm.cmd`): exit 0 after the correction. |
| Runtime harness | N/A: this slice contains pure schemas/policies only; it adds no HTTP, database, or process boundary. |
| Rollback boundary | Revert only `apps/backend/core/src/contracts/{types.ts,schemas.ts,routing-contracts.spec.ts}`, `src/common/pulso-error.filter.ts`, and `src/routing/{clinical-policy.ts,eligibility-policy.ts,lifecycle.ts,routing-*.spec.ts}`. |

### PR #2 Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test | `pnpm --dir apps/backend/core test --runInBand scoring` via `pnpm.cmd`: exit 0; 2 suites, 5 tests passed. |
| Type check | `pnpm --dir apps/backend/core exec tsc --noEmit` via `pnpm.cmd`: exit 0. |
| Runtime harness | N/A: ranking, ETA selection, and evidence construction are pure functions; no HTTP, DB, or process boundary was added. |
| Rollback boundary | Revert `src/scoring/{ranking-policy.ts,scoring.service.ts,scoring-*.spec.ts}`, `src/eta/eta.service.ts`, `src/routing/decision-evidence.ts`, and the PR2 evidence type/code extension in `src/contracts/types.ts`. |
### PR #3 Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused test | `PULSO_TEST_DATABASE_URL` set only to the disposable `localhost:55432/pulso_test` URL; `pnpm.cmd --dir apps/backend/core test --runInBand postgres concurrency`: exit 0; 3 suites, 10 tests passed. |
| Direct PostgreSQL test | `pnpm.cmd --dir apps/backend/core test --runInBand postgres-routing.store.spec.ts`: exit 0; 1 suite, 5 tests passed. |
| Type check | `pnpm.cmd --dir apps/backend/core exec tsc --noEmit`: exit 0. |
| Runtime harness | Real PostgreSQL 16 test DB was accepted only after URL host/port/database allowlisting and `select current_database()` confirmed `pulso_test`; no other database was contacted. Each test drops and recreates only that disposable `public` schema, and `afterAll` performs the same cleanup. |
| Runtime proof | Applied `0002` inside a transaction then rolled it back and verified the table absent; applied it for replay/conflict/append-only scenarios; used two independent `pg.Pool` clients for competing destinations and gated same-key races; real `TRUNCATE` was rejected. |
| Rollback boundary | Roll back PR3 wiring before reversing `0002`; retain/export `pulso_routing_decision_audit` evidence before removing additive persistence objects. Revert all PR3 persistence paths: `src/persistence/{routing-store.ts,memory-routing.store.ts,persistence.module.ts,routing-store-concurrency.spec.ts,postgres-routing.store.ts,postgres-routing.store.spec.ts}`, the PR3 idempotency codes in `src/contracts/types.ts`, and `supabase/migrations/0002_pulso_safety_kernel.sql`. |
### PR #4 Work Unit Evidence
| Evidence | Result |
|---|---|
| Focused E2E | `ROUTING_STORE=memory pnpm.cmd --dir apps/backend/core test:e2e --runInBand`: exit 0; 2 suites, 4 tests passed. |
| Focused unit | `pnpm.cmd --dir apps/backend/core test --runInBand routing.service.spec.ts`: exit 0; 1 suite, 3 tests passed. |
| Type check / build | `pnpm.cmd --dir apps/backend/core exec tsc --noEmit`: exit 0; `pnpm.cmd --dir apps/backend/core run build`: exit 0. |
| Runtime harness | Real Nest HTTP application with the explicit memory routing store: malformed triage received the PULSO envelope; review and evidence gates returned structured PULSO rejections. |
| Full backend tests | Attempted `pnpm.cmd --dir apps/backend/core test --runInBand`: 11 suites / 34 tests passed, but 3 failures in pre-existing `src/migration/{esquema,datos}.service.spec.ts`; not changed in PR4. |
| Lint | Check-only ESLint reported 329 existing errors across unrelated files (including pre-existing `pulso-error.filter.ts` unsafe-type warnings); `lint` was not run because its repository script uses `--fix` and would mutate unrelated work. |
| Rollback boundary | Disable/revert `RoutingModule` and `APP_FILTER` wiring, then revert `src/routing/{routing.service.ts,routing.module.ts,routing.service.spec.ts}`, `test/routing.e2e-spec.ts`, and the PR4 adapter/filter changes in `app.module.ts`, `common/pulso-error.filter.ts`, `triage/triage.controller.ts`, `match/match.controller.ts`, and `dispatch/dispatch.controller.ts`; leave PR1–PR3 unchanged. |
| Correction | `RoutingStore` is now the decision authority: memory/PostgreSQL adapters persist matched evidence or `escalated_to_crue`; `PersistenceModule` selects memory only explicitly and otherwise requires `PULSO_ROUTING_DATABASE_URL` before creating a PostgreSQL pool. |
## Delivery
PR #1 targets tracker; PR #2 bases on PR #1; PR #3 persistence bases on PR #2. No commit or PR was created.

## Remaining Tasks
- [ ] Route `POST /handshake/respond` through `RoutingService.respond()` and `RoutingStore`; preserve idempotent replay and remove `AlmacenService` as the authoritative path.
- [ ] Make `EstadoService` read routing state from `RoutingStore` instead of `AlmacenService`.
- [ ] Group PostgreSQL decision evidence, routing state, audit, and related writes in one transaction.
- [ ] Add targeted tests for provider selection, PostgreSQL durable decisions, handshake endpoint idempotency, and estado store authority.
- [ ] Re-run memory E2E, routing unit, PostgreSQL concurrency, TypeScript, and build checks; then check tasks 4.1–4.2 and synchronize Engram artifacts.

See `PENDING.md` for the implementation handoff. Do not run SDD verification until these items are complete.

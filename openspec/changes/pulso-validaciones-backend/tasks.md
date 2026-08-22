# Tasks: PULSO Backend Safety Kernel

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,200 across contracts, policies, adapters, migration, wiring, and tests |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 contracts/policies → PR 2 ranking/evidence → PR 3 persistence/concurrency → PR 4 orchestration/E2E |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR/base | Focused test | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Contracts/policies | PR 1; base feature/tracker branch | `pnpm --dir apps/backend/core test --runInBand routing` | N/A: pure policy tests have no external runtime | Revert contract/policy files |
| 2 | Ranking/evidence | PR 2; base PR #1 branch | `pnpm --dir apps/backend/core test --runInBand scoring` | N/A: pure ranking/evidence tests have no external runtime | Revert scoring/evidence files |
| 3 | PostgreSQL/single acceptance | PR 3; base PR #2 branch | `pnpm --dir apps/backend/core test --runInBand postgres concurrency` | PostgreSQL test DB: apply `0002`, then run rollback/replay/concurrency scenarios | Revert additive migration/adapters; retain audit |
| 4 | Orchestration/HTTP | PR 4; base PR #3 branch | `pnpm --dir apps/backend/core test:e2e --runInBand` | Nest E2E: POST /triage → /match → /dispatch → /handshake/respond | Disable `ROUTING_STORE` wiring |

## Phase 1: Contracts and Pure Policies

- [x] 1.1 RED: schema/error tests for valid/malformed triage (clinical-routing-validation scenarios) in `apps/backend/core/src/contracts/*.spec.ts`; GREEN: add states, reason codes, evidence/idempotency types, Zod schemas, `PulsoError`, and filter in `contracts/types.ts`, `contracts/schemas.ts`, `common/pulso-error.filter.ts`; REFACTOR canonical mapping/fixtures.
- [x] 1.2 RED: low-confidence/inconsistent gating and eligible/no-destination reason tests; GREEN: implement `routing/clinical-policy.ts`, `eligibility-policy.ts`; REFACTOR table-driven rules.
- [x] 1.3 RED: declared/illegal transition tests proving state preservation; GREEN: implement `routing/lifecycle.ts`; REFACTOR isolate transition tables.

## Phase 2: Ranking and Decision Evidence

- [x] 2.1 RED: reproducible ties and unavailable-primary provenance tests; GREEN: update `scoring/scoring.service.ts`, `eta/eta.service.ts`; REFACTOR deterministic comparator.
- [x] 2.2 RED: complete/missing-version evidence tests proving fail-closed dispatch; GREEN: implement versioned `RoutingDecisionEvidence`; REFACTOR canonical fingerprints.

## Phase 3: Persistence and Concurrency

- [x] 3.1 RED: PostgreSQL tests for constraints, missing-audit rollback, replay, append-only evidence; GREEN: create `supabase/migrations/0002_pulso_safety_kernel.sql`, `persistence/routing-store.ts`, PostgreSQL adapter; REFACTOR transaction helpers. Never edit `0001` or `apps/backend/core/src/migration/`.
- [x] 3.2 RED: two-client competing-destination test requiring one acceptance; GREEN: row locks, unique acceptance/idempotency constraints, atomic audit; REFACTOR explicit conflicts.
- [x] 3.3 RED: memory-adapter parity tests; GREEN: create `persistence/memory-routing.store.ts`, `persistence/persistence.module.ts`; REFACTOR mark demo/test-only.

## Phase 4: Orchestration and HTTP Integration

- [ ] 4.1 RED: `routing/routing.service.spec.ts` and `test/routing.e2e-spec.ts` for invalid envelope, review-without-match, CRUE escalation, evidence-gated dispatch, handshake idempotency. Partial: routing, envelope, CRUE, and evidence tests pass; handshake/estado authority and PostgreSQL atomicity tests remain.
- [ ] 4.2 GREEN: create `routing/routing.service.ts`; update triage/match/dispatch/handshake/estado services/controllers, `app.module.ts`, `main.ts` for `ROUTING_STORE`; REFACTOR remove authoritative in-memory decisions and run lint/build/test. Partial: durable decision storage, CRUE persistence, and provider selection exist; handshake/estado integration and atomic PostgreSQL decision writes remain.

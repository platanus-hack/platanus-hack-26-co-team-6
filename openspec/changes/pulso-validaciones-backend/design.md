# Design: PULSO Backend Safety Kernel

## Technical Approach

Keep controllers as adapters and pure TypeScript policies as the safety core. `apps/backend/core/src/routing/routing.service.ts` coordinates the flow through ports. PostgreSQL is production authority; memory is test/demo-only. This slice leaves `apps/backend/core/src/migration/` untouched.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|---|---|---|
| Pure `clinical-policy`, `eligibility-policy`, `ranking-policy`, and `lifecycle` functions | Rules inside controllers/services | Deterministic unit tests and no Nest/DB coupling. |
| `ROUTING_STORE` injection token with PostgreSQL and memory adapters | Call `pg` or `AlmacenService` directly | Makes PostgreSQL authoritative without coupling domain logic to persistence; memory remains explicitly non-production. |
| One PostgreSQL transaction per state-changing command | Application-only checks | Row locks, idempotency rows, partial unique indexes, and audit writes enforce single acceptance and atomic evidence under concurrency. |
| Preserve minute-cost scoring and add stable tie-breaks/version metadata | Normalized weighted score | Matches the explainable product model; order by total minutes, ETA, then `sede.codigo`. |
| Additive migration `0002`; do not modify `0001` or `apps/backend/core/src/migration/` | Rewrite current migration work | Avoids collision with the existing uncommitted migration runner while providing reviewable rollback boundaries. |

## Data Flow

```text
HTTP + Zod -> RoutingService -> clinical policy -> store transaction
                                      | review -> persist state/audit -> stop
                                      v
Sede port -> eligibility -> CRUE or ETA -> ranking -> decision evidence
                                                    v
human dispatch -> handshake -> transactional response -> accepted/rejected
```

`POST /triage` persists validation and clinical classification. `POST /match` loads the authoritative case, rejects non-ready state, evaluates hard rules, and persists ordered evidence; zero survivors transitions to `escalated_to_crue`. `POST /dispatch` requires complete evidence and human confirmation. `POST /handshake/respond` locks case/handshake and atomically commits one acceptance plus audit. Each mutation stores request key, canonical payload/evidence fingerprint, and result. Same key/fingerprint replays; same key/different fingerprint returns a structured `PULSO-*` rejection without state change.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/backend/core/src/contracts/types.ts` | Modify | Add states, reason codes, evidence/version fields, idempotency and `PULSO-*` envelope. |
| `apps/backend/core/src/contracts/schemas.ts`, `apps/backend/core/src/common/pulso-error.filter.ts` | Create | Zod request schemas and uniform HTTP mapping. |
| `apps/backend/core/src/routing/{clinical-policy,eligibility-policy,lifecycle}.ts` | Create | Pure classifications, hard-rule results, and declared transitions. |
| `apps/backend/core/src/routing/routing.service.ts` | Create | Application orchestrator for the complete safety flow. |
| `apps/backend/core/src/scoring/scoring.service.ts`, `apps/backend/core/src/eta/eta.service.ts` | Modify | Pure minute-cost inputs, deterministic ties, model/config version, and Mapbox/fallback provenance. |
| `apps/backend/core/src/persistence/routing-store.ts` | Create | Port, injection token, transaction command/result contracts. |
| `apps/backend/core/src/persistence/{postgres,memory}-routing.store.ts`, `apps/backend/core/src/persistence/persistence.module.ts` | Create | `pg` transactional authority and demo/test adapter. |
| `apps/backend/core/src/{triage,match,dispatch,handshake,estado}/*.service.ts` | Modify | Delegate flow coordination to `RoutingService`; remove authoritative in-memory decisions. |
| `apps/backend/core/src/{triage,match,dispatch,handshake}/*.controller.ts`, `apps/backend/core/src/app.module.ts`, `apps/backend/core/src/main.ts` | Modify | Parse contracts, wire persistence/orchestrator, install error filter. |
| `supabase/migrations/0002_pulso_safety_kernel.sql` | Create | States, idempotency, decision/audit tables, indexes, constraints, append-only guards. |
| `apps/backend/core/src/**/*.spec.ts`, `apps/backend/core/test/routing.e2e-spec.ts` | Create/Modify | Policy, adapter, concurrency, contract, and flow coverage. |

## Interfaces / Contracts

`PulsoError = { error: { code: PulsoCode; message: string; details?: unknown; retryable: boolean } }`. Mutations require `idempotencyKey`; dispatch also requires `{ actorId, confirmedAt }`. Canonical JSON (sorted object keys, preserved array order) is SHA-256 fingerprinted with confirmation evidence. A `RoutingDecisionEvidence` contains `caseId`, immutable inputs, all candidates and failure reasons, selected destination, minute breakdown, `modelVersion`, `configVersion`, and ETA provenance (`mapbox | haversine_fallback`). Missing fields make dispatch fail closed.

## Testing Strategy

Strict TDD is non-negotiable: every unit, PostgreSQL integration, and concurrent-response behavior follows RED -> GREEN -> REFACTOR, with the failing test committed before implementation.

| Layer | Coverage |
|---|---|
| Unit | RED tests for low confidence/inconsistency gating, all eligibility reasons, legal/illegal transitions, ties, and fallback provenance. |
| Integration | Real PostgreSQL migration/adapter tests: rollback on missing audit, idempotent replay, append-only evidence, and two concurrent destinations yielding one acceptance. |
| E2E | Invalid payload envelope; review never invokes matching; empty eligibility escalates without dispatch; evidence-gated happy path. |

## Threat Matrix

N/A — clinical destination routing selects a domain entity; it does not construct shell commands, launch subprocesses, automate VCS/PRs, classify executables, or cross a process-execution boundary. HTTP/database validation and timeouts are separate concerns.

## Migration / Rollout

Apply additive `0002`, deploy with PostgreSQL, then enable its adapter. Production fails startup if unavailable; `ROUTING_STORE=memory` is test/demo-only. Roll back wiring first, retain audit evidence, then reverse additive objects after export. Do not edit existing uncommitted migration files.

## Open Questions

- [ ] Who owns approval/versioning of the initial clinical consistency table and confidence threshold (the broad catalog remains out of scope)?
- [ ] Which stable actor identifier can current console/Telegram clients provide as confirmation evidence before rollout?

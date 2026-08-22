# Proposal: PULSO Backend Safety Kernel

## Intent

Prevent unsafe clinical routing from silently reaching dispatch through testable validation, eligibility, lifecycle, and decision evidence. Keep the broader PULSO catalog as follow-up work.

## Scope

### In Scope
- Runtime schemas and a uniform `PULSO-*` error envelope.
- Clinical policy yielding `ready_for_matching` or `requires_human_review`; low-confidence or inconsistent triage cannot enter matching.
- Complete hard eligibility with reason codes and `escalated_to_crue` when no destination survives.
- Authoritative case/handshake transitions, structured rejection, confirmation evidence, idempotency, and single acceptance.
- PostgreSQL production authority through ports, transactions, constraints, idempotency records, and append-only audit; in-memory storage remains demo/test-only.
- Deterministic minute-cost ranking with model/config version and fallback provenance.

### Out of Scope
- Broad RBAC, signed tokens, retention/anonymization, resilience, metrics, and alerting.
- Full legal/clinical catalog ownership or replacement with normalized-weight scoring.
- Changes to the existing uncommitted `src/migration/` work.

## Capabilities

### New Capabilities
- `clinical-routing-validation`: Clinical validation, review gating, eligibility, and CRUE escalation.
- `case-routing-lifecycle`: Legal transitions, idempotency, confirmation evidence, and single acceptance.
- `routing-decision-trace`: Deterministic minute-cost ranking and durable versioned evidence.

### Modified Capabilities
- None.

## Approach

Implement pure policies and an authoritative case aggregate behind ports. Use direct `pg` transactions and constraints without coupling domain logic to migration tooling. Wire `triage -> match -> dispatch/respond`; retain in-memory adapters for tests and demos.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/backend/core/src/contracts`, `common`, `main.ts` | Modified | Runtime contracts and error mapping |
| `triage`, `match`, `scoring`, `dispatch`, `handshake`, `estado` | Modified | Policies, lifecycle, and decision flow |
| `almacen` and new persistence adapters | Modified/New | Ports and PostgreSQL authority |
| `**/*.spec.ts`, `test/` | Modified/New | Strict-TDD safety and contract coverage |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Frontend payload breakage | Medium | Contract tests and explicit compatibility fixtures |
| Overstated safety guarantees | Medium | Trace every guarantee to tests and database evidence |
| Collision with migration work | Medium | Reuse interfaces/capability; do not edit migration files |

## Rollback Plan

Disable the new adapter wiring, restore the prior demo flow, and roll back only additive PULSO tables/constraints using reviewed migrations; preserve audit data for diagnosis.

## Dependencies

- NestJS/Jest, `pg`, PostgreSQL connectivity, and shared contract/schema coordination.

## Success Criteria

- [ ] Unsafe or low-confidence triage never reaches matching.
- [ ] No-candidate cases escalate with explicit reasons.
- [ ] Concurrent responses cannot produce multiple accepted destinations.
- [ ] Every ranking is deterministic, explainable, versioned, and durably auditable.

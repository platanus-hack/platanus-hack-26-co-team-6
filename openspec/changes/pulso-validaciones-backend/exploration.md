## Exploration: pulso-validaciones-backend

### Current State

`docs/PULSO-validaciones-backend.md` defines a production-grade safety contract across clinical ingestion, destination eligibility, scoring, lifecycle, concurrency, geospatial data, reference catalogs, RBAC, privacy, resilience, observability, and domain errors. The current NestJS backend implements a useful demo flow, but it does not yet enforce that contract end to end.

- HTTP boundaries use TypeScript interfaces plus a few manual presence checks. There is no global `ValidationPipe`, runtime DTO schema, or uniform PULSO error envelope.
- Triage validates Claude's output shape with Zod and filters unknown REPS service codes, but low-confidence heuristic output (`0.35`) is still stored and can be matched. CIE-10 existence, required clinical entities, cross-field coherence, population/service compatibility, physiological ranges, deduplication, and data minimization are not enforced.
- Matching hard-filters missing services, insufficient complexity, and incompatible vehicle type. It does not enforce sender exclusion, service population, current operating status, REPS freshness, valid geolocation, pathology-specific perimeter, or explicit CRUE escalation when no viable candidate exists.
- Scoring exposes a minute-based breakdown and clamps congestion inputs, but has no explicit deterministic tie-break chain, model/config version, anomaly event, or persisted decision trace. The document's normalized-weight rule should be reconciled with the deliberate minute-cost model rather than copied mechanically.
- Cases have no persisted lifecycle state machine. Handshakes only model `enviado | aceptado | rechazado | timeout`; timeout is not scheduled, dispatch can be repeated, multiple hospitals can accept the same case, and rejection reasons are free text with a default.
- Repeating an already-answered handshake is idempotent in-process, but mutation-wide idempotency keys, TTL holds, single active routing, optimistic concurrency/unique constraints, and atomic state-plus-audit writes do not exist.
- `AlmacenService` is an in-memory, single-process store. It cannot provide cross-instance concurrency, durable audit, append-only guarantees, retention, or transactional integrity.
- Routes have no authentication or authorization. Supabase access uses a server-side service-role client, but there are no actor identities, role scopes, IPS ownership checks, CRUE override rules, or signed one-use confirmation tokens.
- Mapbox and Supabase have fallbacks, but degradation metadata is mostly lost before the API response. External calls have no explicit timeout/circuit breaker, and the application has no rate limiting.
- The tracked test suite covers only health. The uncommitted `src/migration/` work and related configuration are separate work in progress and must remain untouched by this change.

### Affected Areas

- `docs/PULSO-validaciones-backend.md` — source safety and business-rule catalog; should become traceable requirements rather than direct implementation scope.
- `apps/backend/core/src/contracts/types.ts` — shared compile-time contracts currently lack runtime boundary schemas, lifecycle/audit types, idempotency metadata, and structured domain errors.
- `apps/backend/core/src/main.ts` — application-wide validation, exception mapping, request identity, and rate-limiting integration point.
- `apps/backend/core/src/triage/` — clinical output validation, confidence gates, catalog checks, coherence rules, and manual-review outcome.
- `apps/backend/core/src/catalogo/` — versioned CIE-10, diagnosis-to-service mappings, population rules, and rejection-reason catalogs.
- `apps/backend/core/src/match/` and `apps/backend/core/src/scoring/` — complete hard eligibility, no-candidate escalation, deterministic ranking, versioned explanations, and degradation flags.
- `apps/backend/core/src/dispatch/` and `apps/backend/core/src/handshake/` — human confirmation, legal state transitions, TTL, one-use response tokens, single acceptance, and structured rejection.
- `apps/backend/core/src/almacen/` — current demo store cannot satisfy transactional, durable, or concurrency guarantees; it needs a persistence port while remaining a demo adapter only.
- `apps/backend/core/src/sedes/` and `apps/backend/core/src/eta/` — REPS freshness/operating status, coordinate validation, bounded external calls, and visible fallback provenance.
- `apps/backend/core/src/estado/` — current read model needs authoritative case state and escalation/audit visibility.
- `apps/backend/core/src/**/*.spec.ts` and `apps/backend/core/test/` — strict-TDD coverage for every safety rule and cross-module invariant.

### Approaches

1. **Safety kernel in staged vertical slices** — define runtime input schemas, domain error/result types, pure policy services, and an authoritative case aggregate; then connect them to transactional persistence and apply them one use case at a time (`triage -> match -> dispatch/respond`).
   - Pros: Makes rules testable and traceable; prevents controllers from becoming the policy layer; preserves the demo adapters while clearly separating non-production behavior; allows the highest-risk invariants to land first.
   - Cons: Requires an explicit first-slice boundary and a persistence decision before concurrency guarantees can be claimed; not all twelve catalog sections land in one release.
   - Effort: High

2. **Controller/service guard patch** — add local checks and business exceptions directly to the existing controllers and services while retaining `AlmacenService` as the authority.
   - Pros: Fastest route to visible validation and PULSO error codes; minimal structural change.
   - Cons: Duplicates rules, cannot guarantee atomic audit or concurrency, remains unsafe across processes, and creates a false impression that the specification is enforced.
   - Effort: Medium

3. **Full platform hardening in one change** — implement all catalog sections together, including Postgres constraints, append-only audit, RBAC, token security, retention, resilience, metrics, and alerts.
   - Pros: A single comprehensive target with no intentional safety gaps.
   - Cons: Scope is too broad for a reviewable change; mixes domain, persistence, security, operations, and legal policy; high regression and integration risk; conflicts with strict TDD and reviewer cognitive-load limits.
   - Effort: Very High

### Recommendation

Use **Approach 1** and make the proposal a staged safety program, not a promise to implement the entire document atomically.

The first implementation slice should establish the reusable enforcement path and close the most dangerous demo behavior:

1. Runtime request/output schemas and a uniform `PULSO-*` error contract.
2. A pure clinical validation policy that returns `ready_for_matching` or `requires_human_review`; low-confidence or inconsistent output must never flow silently into matching.
3. A complete eligibility policy with explicit reasons and a first-class `escalated_to_crue` result when no candidate survives.
4. An authoritative case/handshake state machine, structured rejection reasons, and explicit human-confirmation evidence.
5. Persistence ports for cases, idempotency records, and append-only audit events; the in-memory adapter may support local demo tests, but production guarantees must be implemented with database transactions and constraints.
6. Deterministic ranking plus model/config version and fallback provenance in the persisted decision trace.

Treat RBAC, signed one-use tokens, full retention/anonymization, circuit breakers, metrics, and alerting as dependency-ordered follow-up slices unless the proposal explicitly expands scope. Do not implement concurrency or audit guarantees on top of the current `Map` store and call them complete.

The proposal must also resolve one semantic mismatch: retain the existing explainable **minute-cost** ranking or replace it with normalized weights. The source rule about weights summing to one applies only if the product chooses a weighted normalized score; it should not silently invalidate the current dimensional model.

### Risks

- The source catalog is much larger than one safe implementation/review unit; an unbounded proposal will become unverifiable.
- Patient-safety language can overstate guarantees unless every rule is tied to executable tests and durable persistence evidence.
- The ongoing uncommitted migration work may establish the eventual database schema. This exploration did not modify or adopt it; design must coordinate rather than overwrite it.
- Changing shared `contracts/types.ts` affects all team lanes and requires explicit coordination because the file documents itself as a shared contract.
- Keeping the in-memory adapter is useful for the demo, but accidental production selection would bypass concurrency, durability, and audit guarantees.
- Adding strict boundary validation may break the existing frontend payloads; contract tests and a compatibility plan are required.
- Legal and clinical mappings (CIE-10, REPS, urgency windows, retention) require authoritative, versioned data ownership beyond code correctness.

### Ready for Proposal

Yes — with a bounded first slice. The orchestrator should tell the user that the catalog is a safety roadmap, not a single implementation ticket, and the proposal must explicitly choose the first slice, the persistence authority, and the minute-cost-versus-normalized-score model before design.

# Pending Work: PULSO Backend Safety Kernel

The apply phase is intentionally left incomplete. Tasks 1.1–3.3 are complete; tasks 4.1–4.2 remain partial.

## Already implemented

- Durable decision save/read operations in `RoutingStore` and both adapters.
- Store-backed match evidence; `RoutingService` no longer owns an evidence `Map`.
- Persistent `escalated_to_crue` state when no viable destination exists.
- Fail-closed PostgreSQL provider selection in `PersistenceModule`.
- Async match/dispatch controller integration.

## Required before closing apply

1. Route `apps/backend/core/src/handshake/handshake.controller.ts` and its service through `RoutingService.respond()`/`RoutingStore`. Preserve request-key replay semantics.
2. Replace `AlmacenService` authority in `apps/backend/core/src/estado/estado.service.ts` with `RoutingStore` reads.
3. Make PostgreSQL decision evidence, routing state, audit, idempotency, and related writes atomic in a single transaction.
4. Add tests for provider selection, durable PostgreSQL match evidence, handshake idempotency through the store, estado store reads, and transaction rollback.
5. Update `tasks.md` and `apply-progress.md`, then synchronize Engram only after every check passes.

## Last passing checks

```text
Routing unit: 1 suite / 4 tests passed
Memory E2E: 2 suites / 4 tests passed
PostgreSQL concurrency: 3 suites / 10 tests passed
TypeScript noEmit: passed
Nest build: passed
```

Use only the disposable test database configured through `PULSO_TEST_DATABASE_URL`; never infer that a production URL is safe for destructive tests.

# Exploration: scaffold-backend-services

Phase: `sdd-explore` · Status: complete · Date: 2026-08-22

## Intent

Create two backend services under the backend folder:

- `core` — NestJS service, managed with pnpm.
- `ai-core` — Python AI service, FastAPI, managed with uv.

This change is infrastructure scaffolding only. The product itself (Platanus Hack 26
Bogota, team-6, "Emergencies" track) is still undefined.

## Current State

- `apps/frontend` is a self-contained pnpm root: its own `package.json`, `pnpm-lock.yaml`,
  and `pnpm-workspace.yaml` (which contains only an `allowBuilds` block). Next.js 16.3.1,
  React 19.2.8, TypeScript 5 strict, Tailwind CSS 4, ESLint 9 flat config. Scripts are
  `dev | build | start | lint` — there is no `test` script.
- `apps/Backend` (capital B) is verified empty — no files at all.
- **Git state (orchestrator-verified):** the repository has exactly 4 tracked files on
  `main` — `README.md`, `platanus-hack-project.jsonc`, `project-description.md`,
  `project-logo.png`. The entire `apps/` tree is UNTRACKED, `apps/frontend` included.
  This is stronger than the exploration's original assumption that only `apps/Backend`
  was untracked, and it removes every rename/casing risk from the naming decision.
- No root `package.json` and no root `pnpm-workspace.yaml` — the repo is not a workspace.
- Root `.gitignore` contains only `.atl/`. `apps/frontend` carries its own local
  `.gitignore` — a deliberate per-app hygiene pattern.
- No CI (`.github/workflows` absent). No `.gitattributes` at root.
- `openspec/config.yaml` records `strict_tdd: true`, `test_runner: none detected`,
  `test_command: ""`, and rules instructing later phases to flag the backend stack choice
  and to add a test runner as an explicit prerequisite.

## Toolchain (verified present)

Node v24.18.0 · pnpm 11.18.0 · Nest CLI 11.0.24 · Python 3.14.6 · uv 0.11.32 · Docker 29.6.2

## Affected Areas

| Area | Impact |
| --- | --- |
| `apps/backend/` (new) | Target location for `core` and `ai-core` |
| `apps/Backend/` (empty) | Left alone or manually deleted; nothing tracked, no git operation needed |
| `openspec/config.yaml` | Goes factually stale post-change unless a follow-up task syncs it |
| `.gitignore` | Needs Node/pnpm and Python/uv patterns, per-service or root |
| `apps/frontend/` | Not modified; its topology is the precedent this change follows or breaks |

No existing tests to break. Zero coupling risk from existing code.

## Decision Forks

### 1. Placement and naming

| Option | Pros | Cons | Effort |
| --- | --- | --- | --- |
| A. Keep `apps/Backend` (capital B) | No new folder | Permanent inconsistency with lowercase `apps/frontend` in every future path, doc, and deploy config | Low |
| B. Create fresh `apps/backend` (lowercase) | Consistent with `apps/frontend`; nothing tracked, so this is a fresh creation, not a case-only rename — the actual Windows/git hazard never applies | Empty `apps/Backend` remains as inert dead weight until manually deleted | Low |

**Recommendation: B.** Create lowercase directly. Never use `git mv` from the capital-B folder.

### 2. pnpm topology

| Option | Pros | Cons | Effort |
| --- | --- | --- | --- |
| A. Self-contained `core` (own `package.json` + lockfile) | Mirrors the only existing precedent; zero risk to the working frontend; independent install/build/deploy, which fits the README's per-teammate mirror-and-deploy model | No hoisting across services; no `pnpm -r`; no `workspace:*` for future shared packages | Low |
| B. Root `pnpm-workspace.yaml` | Single root install/build/lint; enables shared-types packages | Requires migrating the working frontend's standalone workspace and lockfile and re-verifying `next dev`/`build`; does nothing for `ai-core` (separate ecosystem) | Medium |

**Recommendation: A.** Defer workspace consolidation until there is concrete shared-code need.

### 3. NestJS scaffolding

`nest new core --package-manager pnpm` generates `src/app.{controller,service,module}.ts`,
`src/main.ts` bootstrapping `app.listen(process.env.PORT ?? 3000)`, a passing
`src/app.controller.spec.ts`, `test/app.e2e-spec.ts` plus `test/jest-e2e.json`, and
`test | test:watch | test:cov | test:e2e | test:debug` scripts pre-wired to Jest.

**Recommendation: `nest new`.** It ships a working Jest runner as a free side effect,
which satisfies the Strict-TDD prerequisite for `core` at zero extra task cost. A
hand-written skeleton costs meaningfully more effort and forfeits that. Any Hexagonal
restructuring can happen afterwards inside `src/` without touching the test tooling.

### 4. FastAPI + uv layout

- `uv init` produces `pyproject.toml` and `uv.lock` (commit the lock; ignore `.venv/`).
- Flat `app/main.py` is lower-ceremony than `src/ai_core/` and adequate for a hackathon MVP.
- Run via `uv run fastapi dev app/main.py` or `uv run uvicorn app.main:app --reload`.
  Using `uv run` avoids the Windows venv-activation split entirely.
- **`uv init` does NOT scaffold pytest.** Unlike Nest/Jest, this is an explicit task:
  `uv add --dev pytest httpx` (httpx is required by FastAPI's `TestClient`) plus a
  `tests/` folder and a `[tool.pytest.ini_options]` block.

**Python version.** FastAPI, Pydantic v2, and uvicorn all support Python 3.14 today, and
`pydantic-core` cp314 wheels exist (published around 2026-08-06 — only weeks old). The
residual risk is not the web framework: it is the ML/data dependency tree a service named
`ai-core` will grow, where wheel support historically lags a new Python release by 6-12
months. A source build would need a Rust or C toolchain most hackathon laptops lack.

**Recommendation:** `uv python pin 3.12` (or 3.13) inside `ai-core/`, plus
`requires-python = ">=3.12,<3.14"`. uv fetches and manages the interpreter itself, so this
costs nothing and removes a whole class of failure.

### 5. Testing story

- `core` — Jest, free with `nest new`.
- `ai-core` — pytest plus httpx, one explicit task.
- `apps/frontend` — **unchanged, still has no test runner.** Out of scope here; already
  tracked separately in `openspec/config.yaml`.

This change gets both new services to a testable baseline but does not close the repo-wide
gap, and leaves `openspec/config.yaml`'s `test_command` stale until a sync task.

### 6. Service integration (options only — design decides)

- **Port collision:** Next dev defaults to 3000 and Nest's generated `main.ts` also
  defaults to 3000. They collide when run simultaneously. FastAPI/uvicorn defaults to 8000,
  no collision. Either override `core`'s `PORT`, or document a one-at-a-time interim state.
- **Env conventions:** no precedent exists — the frontend has no `.env.example` and no API
  base URL variable. Per-service `.env`/`.env.example` matches the island pattern; a shared
  root `.env` cuts against it.
- **CORS and topology:** `frontend -> core -> ai-core` (proxied) versus `frontend -> ai-core`
  (direct) determines where CORS is needed. This is an open architectural question, not
  something to bake silently into scaffolding.

### 7. Repo hygiene

Give each service its own local `.gitignore`, mirroring `apps/frontend`:

- `core/.gitignore`: `/node_modules`, `/dist`, `/coverage`, `.env*`, `*.tsbuildinfo`, debug logs.
- `ai-core/.gitignore`: `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.ruff_cache/`, `.env*`.
  **Do not ignore `uv.lock`** — commit it for reproducible installs.

Centralizing into the root `.gitignore` is valid but less consistent with the existing pattern.

### 8. Windows gotchas

- Case-insensitive filesystem versus git's case-sensitive index: moot here, nothing is tracked.
- `uv run` sidesteps venv activation differences across platforms.
- pnpm's content-addressable symlink store already mitigates `MAX_PATH` issues.
- No `.gitattributes` at root — latent CRLF/LF drift for a mixed-OS four-person team.
  Pre-existing, but this change adds the first generated files that would be affected.
- Docker 29.6.2 is present but not required for local dev of either service.

## Recommendation Summary

1. Create `apps/backend/core` via `nest new` with pnpm, self-contained.
2. Create `apps/backend/ai-core` via `uv init`, pinned to Python 3.12/3.13, with an
   explicit pytest plus httpx task.
3. Do not introduce a root pnpm workspace in this change.
4. Leave `apps/Backend` alone; it is empty and untracked.
5. Defer integration topology (ports, CORS, env naming, proxied versus direct) to design.

## Risks

| Risk | Severity | Note |
| --- | --- | --- |
| Naming reversibility window | High leverage | Cheap now (nothing tracked), expensive once commits, CI, and deploy configs point at a path |
| Python 3.14 wheel coverage for future ML deps | Medium | Pinning to 3.12/3.13 is free insurance |
| `openspec/config.yaml` drift | Low | Needs a follow-up sync task for `test_command` and context notes |
| No `.gitattributes` | Low | Pre-existing cross-platform risk, first touched by this change |
| Root workspace deferral | Accepted | A later shared-code need means migrating a then-larger frontend |

## Open Questions for `sdd-propose`

1. Lowercase `apps/backend` confirmed, and should the empty `apps/Backend` be deleted?
2. Self-contained services, or root pnpm workspace?
3. Pin `ai-core` to Python 3.12/3.13, or accept ambient 3.14?
4. Which port does `core` take, given the collision with Next dev?
5. Integration topology: does the frontend call `ai-core` directly or through `core`?
6. Per-service `.gitignore`, or centralize at root?

## Ready for Proposal

Yes. Both target locations are confirmed, the toolchain is confirmed present, and every
open question is a concrete decision fork rather than a blocker.

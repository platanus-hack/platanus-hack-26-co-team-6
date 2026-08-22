# Delta for Backend Service Baseline

New capability — no prior `openspec/specs/backend-service-baseline` exists. All requirements are ADDED.

## ADDED Requirements

### Requirement: Backend Service Directory Layout

The system MUST provide only `apps/backend/core` and `apps/backend/ai-core` as backend service directories. `apps/Backend` MUST NOT exist. The filesystem is case-insensitive, so `apps/Backend` and `apps/backend` share one path — removing `apps/Backend` MUST happen before scaffolding, not after.

#### Scenario: Lowercase directories exist, legacy path is gone

- GIVEN a checkout of the repository after this change
- WHEN listing `apps/backend/` and checking for a path named exactly `apps/Backend`
- THEN `core/` and `ai-core/` both exist under `apps/backend/`
- AND no `apps/Backend` directory exists

### Requirement: Service Port Bindings

`core` MUST bind port 3001, `ai-core` MUST bind port 8000, and `apps/frontend` stays on 3000. `core`'s generated `main.ts` fallback MUST default to 3001, not 3000, even with no `.env` present.

#### Scenario: core binds 3001 with no .env, alongside frontend

- GIVEN `apps/backend/core` has no `.env` file and `apps/frontend` is running `next dev` on 3000
- WHEN `core` is started
- THEN `core` listens on 3001 with no port conflict against the frontend

#### Scenario: ai-core binds 8000

- GIVEN `ai-core` is started per its documented run command
- WHEN the process is ready
- THEN it listens on port 8000

### Requirement: Health Check Endpoints

Each service MUST expose `GET /health` returning HTTP 200 with JSON body `{"status": "ok"}`.

#### Scenario: core and ai-core both answer /health

- GIVEN `core` is running on 3001 and `ai-core` is running on 8000
- WHEN a client sends `GET /health` to each
- THEN both respond HTTP 200 with JSON body `{"status": "ok"}`

### Requirement: Automated Test Runners

`pnpm --dir apps/backend/core test` and `uv run --directory apps/backend/ai-core pytest` MUST both exit successfully. Each suite MUST include a `/health` test authored before its implementation.

#### Scenario: Both test suites pass, including test-first /health tests

- GIVEN each service has a test suite with a `/health` test written before the endpoint
- WHEN running `pnpm --dir apps/backend/core test` and `uv run --directory apps/backend/ai-core pytest`
- THEN both commands exit 0 and both `/health` tests pass

### Requirement: Core-to-AI-Core Integration Seam

`core` MUST reach `ai-core` using a base URL read from `AI_CORE_BASE_URL`. `core` MUST configure CORS allowing only origin `http://localhost:3000`. `ai-core` MUST NOT carry CORS middleware and MUST NOT be treated as browser-reachable.

#### Scenario: core resolves ai-core via env var and gates CORS

- GIVEN `AI_CORE_BASE_URL` is set in `core`'s environment
- WHEN `core` issues a request toward `ai-core`
- THEN it targets the URL from `AI_CORE_BASE_URL`, not a hardcoded host
- AND a browser request to `core` from `http://localhost:3000` receives CORS headers, while any other origin does not

#### Scenario: ai-core carries no CORS middleware

- GIVEN `ai-core`'s source code
- WHEN inspecting its middleware configuration
- THEN no CORS middleware or allowed-origin configuration is present

### Requirement: AI-Core Python Version Constraint

`apps/backend/ai-core` MUST declare `requires-python = ">=3.12,<3.14"` in `pyproject.toml` and MUST pin its local interpreter to 3.12.

#### Scenario: Version constraint and interpreter pin match

- GIVEN `apps/backend/ai-core/pyproject.toml` and its pinned interpreter file
- WHEN reading `requires-python` and the pin
- THEN `requires-python` reads exactly `>=3.12,<3.14` and the pin specifies 3.12

### Requirement: Repository Hygiene for Generated Artifacts

`pnpm-lock.yaml` (in `core`) and `uv.lock` (in `ai-core`) MUST be committed. `node_modules/`, `.venv/`, and any nested `.git` directory MUST NOT be staged. Each service MUST have its own `.gitignore`. A root `.gitattributes` MUST exist.

#### Scenario: Lockfiles tracked, generated dirs and nested VCS excluded

- GIVEN a `git ls-files` check after staging
- WHEN inspecting tracked files under `apps/backend/`
- THEN `pnpm-lock.yaml` and `uv.lock` are tracked in their services
- AND no `node_modules/`, `.venv/`, or nested `.git` path appears among tracked files

#### Scenario: Per-service ignore files and root gitattributes exist

- GIVEN the repository root and each service directory
- WHEN checking for `.gitignore` and `.gitattributes` files
- THEN each service has its own `.gitignore`
- AND a root `.gitattributes` file exists

# Proposal: Scaffold backend services (`core`, `ai-core`)

Phase: `sdd-propose` · Depends on: `exploration.md` · Date: 2026-08-22

Stand up two empty-but-runnable backend services so product work has somewhere to land.
Infrastructure only — the product itself is still undefined and stays undefined here.

## Decisions

Six forks left open by exploration, now closed. `[E]` = adopted from exploration, `[E+]` = adopted with a correction.

| # | Fork | Decision | Why | Cost of reversal |
|---|------|----------|-----|------------------|
| 1 | Path casing | `apps/backend/{core,ai-core}` lowercase. **Delete the empty `apps/Backend` first.** `[E+]` | Matches `apps/frontend`. Nothing is tracked, so this is a creation, not a case-rename. | Near-zero now; high once deploy configs and CI reference a path. |
| 2 | pnpm topology | Self-contained `core` (own `package.json` + lockfile). No root workspace. `[E]` | Mirrors the only precedent; zero risk to the working frontend; fits the README's per-teammate mirror-and-deploy model. | Medium later — migrating a then-larger frontend into a root workspace. Accepted. |
| 3 | Python version | `uv python pin 3.12`; `requires-python = ">=3.12,<3.14"`. `[E]` | FastAPI runs on 3.14, but an `ai-core` will grow ML deps whose wheels lag a new release 6–12 months. uv fetches the interpreter, so the pin is free. | Trivial — edit two lines, re-lock. |
| 4 | Ports | frontend `3000` · **core `3001`** · ai-core `8000`. Change the generated `main.ts` fallback to `3001`, not just `.env`. `[E+]` | A fresh clone with no `.env` must not collide with `next dev`. Env-only would leave that trap armed. | Trivial. |
| 5 | Topology | **`frontend -> core -> ai-core`, proxied.** `[E+]` | One browser-facing origin, so CORS lives in exactly one place. AI provider keys stay in a service the browser cannot reach. `core` becomes the single seam for auth, rate limits, and audit in front of slow/expensive calls. | Asymmetric, so pick this side: proxied -> direct costs adding CORS + auth + a public URL to `ai-core` (~1 day). direct -> proxied costs a client rewrite plus secret migration. |
| 6 | `.gitignore` | Per-service, matching `apps/frontend`. Root stays `.atl/` only. `[E]` | Both scaffolders emit one anyway, so this is also the lowest-effort path. **Never ignore `uv.lock`.** | Trivial. |

**Where I corrected exploration.** #1: "create lowercase, leave `apps/Backend` alone" is not achievable on NTFS — the two names are the same directory, so scaffolding would land silently inside the capital-B folder. It is empty and untracked, so `Remove-Item` costs nothing. #4: env-only is not enough. #5: exploration deferred this to design, but scaffolding cannot abstain — whether `ai-core` gets CORS middleware *is* the answer. The proposal sets direction; design refines the contract.

## Scope

### In scope

- `apps/backend/core` via `nest new core --package-manager pnpm --skip-git`, plus CORS for `http://localhost:3000` and an `AI_CORE_BASE_URL` client seam.
- `apps/backend/ai-core` via `uv init` (VCS init disabled), FastAPI + uvicorn, pinned to 3.12, flat `app/main.py`.
- `pytest` + `httpx` as an explicit dev-dependency task for `ai-core`.
- One test-first `GET /health` per service — the proof each runner actually works.
- `.env.example` per service; per-service `.gitignore`; a 4-line root `.gitattributes`.
- Follow-up task: re-sync `openspec/config.yaml` (`test_command`, `context`, `testing.notes`).

**Scaffolder VCS trap.** Both `nest new` and `uv init` initialize a git repo by default. Left on, they create nested repos under `apps/backend/*` that the parent repo records as gitlinks — the service source becomes invisible. Disable VCS init on both; if a flag name has shifted, delete the stray `.git` before staging.

### Non-goals

| Not doing | Why |
|-----------|-----|
| Product, domain, or Emergencies-track features | Product is undefined. Scaffolding must not guess it. |
| A test runner for `apps/frontend` | Pre-existing gap, tracked separately in `openspec/config.yaml`. Stays open. |
| CI, containerization, deploy config | Docker is installed but unused; no workflow exists to extend. |
| Root `pnpm-workspace.yaml` migration | Follows from decision #2. |
| Committing `apps/frontend` | Out of scope — but see Risks. |
| Auth, database, message queue, observability | No requirement exists to satisfy yet. |

## Strict TDD: the honest position

`strict_tdd: true` is declared globally and **no runner exists anywhere in the repo today**.

| Surface | After this change | Cost |
|---------|-------------------|------|
| `core` | Jest + a passing sample spec | Free — `nest new` ships it |
| `ai-core` | pytest + httpx + `tests/` + `[tool.pytest.ini_options]` | **Explicit task.** `uv init` scaffolds no tests. |
| `apps/frontend` | **Still zero tests, zero runner** | Untouched. Gap stays open. |

You cannot TDD a scaffolder — `nest new` and `uv init` are tool invocations, not authored code. The TDD gate therefore binds the first authored endpoint in each service: write the `/health` test first, watch it fail, then implement. That is the only place strict TDD is meaningful in this change, and it doubles as proof the runner is wired correctly.

**Still untested after this change:** all of `apps/frontend`, and all generated scaffolding in both new services.

## Review budget forecast

Session budget is **800 authored lines**. Scaffolders generate far more than they author.

| Category | Est. lines | Counts against budget? |
|----------|-----------:|------------------------|
| Authored (health endpoints + tests, CORS, env examples, config edits) | 150–250 | **Yes** |
| Generated non-lock scaffolding (~30 files) | 500–700 | No — generated golden |
| `pnpm-lock.yaml` + `uv.lock` | 5,000–9,000 | No — generated golden |
| **Raw diff a reviewer sees** | **~6,000–10,000** | — |

Authored volume fits comfortably. The **raw diff does not, by roughly an order of magnitude**, and a reviewer opening it cold will not know which files are generated.

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
800-line budget risk: Low (authored) / High (raw diff surprise)
```

Recommended: two chained PRs — **#1 `core`**, then **#2 `ai-core`** — each independently bootable, testable, and revertable, each ~100 authored lines. `delivery_strategy` is `ask-on-risk`, so the orchestrator must resolve this before `sdd-apply` starts.

## Capabilities

### New

- `backend-service-baseline`: both services exist at defined paths, boot with a documented command, expose `GET /health`, bind assigned ports, and `core` reaches `ai-core` via `AI_CORE_BASE_URL`.

### Modified

- None. No `openspec/specs/` exists yet.

## Affected areas

| Area | Impact | Note |
|------|--------|------|
| `apps/backend/core/` | New | NestJS + pnpm, self-contained |
| `apps/backend/ai-core/` | New | FastAPI + uv, Python 3.12 |
| `apps/Backend/` | Removed | Empty, untracked; plain filesystem delete |
| `.gitattributes` (root) | New | 4 lines. Nothing is tracked yet, so no renormalization churn — this is the cheapest moment it will ever be. |
| `openspec/config.yaml` | Modified (follow-up) | Goes factually stale on merge otherwise |
| `apps/frontend/` | Untouched | Precedent followed, not modified |
| `.gitignore` (root) | Untouched | Per-service, per decision #6 |

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------:|------------|
| Scaffolder creates a nested `.git`, hiding service source as a gitlink | High if unguarded | Disable VCS init on both; verify no `apps/backend/**/.git` before staging |
| **`apps/frontend` is untracked and probably nobody noticed** | Certain | Committing `apps/backend` makes the asymmetry glaring. Out of scope here — surface it to the team as its own decision. |
| Raw diff size overwhelms review | High | Chained PRs; label generated files explicitly in each PR body |
| Future ML dep has no cp312 wheel | Low | Pin band allows 3.13; uv re-resolves cheaply |
| `openspec/config.yaml` drift | Certain without the follow-up | Follow-up task is in scope, not optional |
| Proxy hop hurts if AI responses stream | Medium | Nest can forward SSE/chunked, but it is real work. See question 1 below. |

## Rollback

Unusually cheap, because **nothing under `apps/` has ever been committed**.

1. **Pre-commit:** `Remove-Item -Recurse -Force apps/backend`. Done — the repo is byte-identical to its current state.
2. **Post-commit:** `git revert` the scaffold commits, or delete the directory in a follow-up commit. Root `.gitattributes` reverts by deletion; `openspec/config.yaml` reverts with git.
3. No database, no migration, no deployed consumer, no external contract. Rollback affects nobody outside the repo.
4. Recreating `apps/Backend` afterwards is one `mkdir` — deleting it destroys nothing.

## Success criteria

- [ ] `apps/backend/core` and `apps/backend/ai-core` exist; `apps/Backend` is gone.
- [ ] `pnpm --dir apps/backend/core start:dev` serves `GET /health` on **3001** with `next dev` running on 3000.
- [ ] `uv run --directory apps/backend/ai-core fastapi dev app/main.py` serves `GET /health` on **8000**.
- [ ] `core` reaches `ai-core` through `AI_CORE_BASE_URL`; CORS is configured on `core` only.
- [ ] `pnpm --dir apps/backend/core test` and `uv run --directory apps/backend/ai-core pytest` both pass, each including a test-first `/health` test.
- [ ] `pnpm-lock.yaml` and `uv.lock` are committed; no `.venv/`, `node_modules/`, or nested `.git` is staged.
- [ ] `openspec/config.yaml` reflects the new `test_command`s and no longer describes `apps/Backend` as empty.

## Proposal question round

`execution_mode` is `auto`, so these were resolved by assumption rather than asked. None blocks scaffolding; all three would change design. Correct any of them before `sdd-design`.

1. **Does the AI feature need token-by-token streaming to the browser?** Assumed **no** for now. If yes, `core` must forward SSE/chunked responses, which is the main cost of decision #5 and is worth pricing before it is load-bearing.
2. **Is `ai-core` fast request/response, or long-running inference?** Assumed **fast (<30s)**. Long-running means a job queue and a status endpoint — an architecture, not a scaffold.
3. **Does the Emergencies product need auth or persistence in the first slice?** Assumed **no**. Both would land in `core`, and knowing early changes whether a database belongs in this scaffold.

## Next step

`sdd-spec` and `sdd-design` can run in parallel. Design owns the `core -> ai-core` contract shape, error and timeout behavior, and env-var naming. The orchestrator must resolve the chained-PR question before `sdd-apply`.

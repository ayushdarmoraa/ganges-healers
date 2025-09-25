# Ganges Healers – Engineering Guardrails (Repo-Aware)

These guardrails codify how changes MUST be approached in this repository. They map to the implementation plan and enforce incremental, low-risk evolution.

---
## 0) Context Scan (MANDATORY before any code change)
Always look for existing implementations first.
- Frontend: inspect `apps/web/src/app`, `apps/web/src/components`, existing hooks, API clients, shadcn/ui patterns.
- Backend/services: inspect target service folder (e.g. `services/auth`, `services/booking`) for controllers → services → repositories layering.
- Shared code: check `packages/` (`ui`, `utils`, `types`, `config`) before writing new helpers.

If something exists: extend it. Don’t fork or duplicate logic.

---
## 1) Change Policy (modify in place by default)
Only create a new file when:
- The concern is clearly separable and would bloat an existing file.
- There is no suitable existing module.
- You wire it into the runtime (imports, router, provider registration, export barrel, etc.).

If proposing a new file: produce a Patch Plan justifying why extension is not viable.

---
## 2) No Regression / Preservation Rules
NEVER delete or rewrite working logic unless explicitly requested.
Preserve:
- API shapes (status codes, JSON keys, headers).
- Error codes & domain enums.
- Logging key namespaces (e.g. `booking.*`, `payment.*`, `auth.*`).
- Environment / debug gating (`NODE_ENV !== 'production'`).

If a public contract must change: document the migration in the Patch Plan.

---
## 3) File & Symbol Hygiene
- Reuse helpers from `packages/*` instead of introducing new dependencies.
- Maintain naming consistency with existing schema/types.
- Avoid `any`; if unavoidable, narrow immediately after usage.
- Scope ESLint disables to a single line with justification.
- Keep domain logic in its bounded context (auth ↔ booking ↔ payment separated).

---
## 4) Diff Budget & Safety
- One focused concern per patch.
- Avoid wide file moves/renames unless required; list them explicitly.
- No speculative refactors; only what the spec demands.
- Maintain type safety and existing tests green.

---
## 5) Tests, Lint, Contracts
For new behavior:
- Add/extend unit tests:
  - Backend: `services/<name>/tests/` (Jest).
  - Frontend: component or hook tests; Playwright/E2E when flow-level.
- Run lint + typecheck in the touched package.
- Keep tests deterministic (inject time, random seeds if needed).

---
## 6) Observability & Performance
- Use existing structured logging keys (`booking.*`, `payment.*`, `auth.*`).
- Favor O(n) or better complexity for hot paths (availability lookup, booking slot checks, payment verification).
- Do not introduce heavy libraries for trivial tasks.
- If metrics instrumentation exists, extend it rather than re-invent.

---
## 7) Patch Plan Template (MUST output before code)
```
Goal: <1-line summary>
Touched (modify):
  - services/booking/src/... – <reason>
  - apps/web/src/app/... – <reason>
New files (only if justified):
  - services/payment/src/<file>.ts – why existing files not suitable + how wired.
No-change assertions:
  - Public API endpoints unchanged: <list>
  - Error codes unchanged: <list>
  - Logging & debug gating preserved.
Tests:
  - Unit: <list>
  - E2E: <list if applicable>
Rollback:
  - Revert single commit; no schema migrations.
```

---
## 8) Pre-Commit Checklist
```
[ ] Extended existing modules where feasible.
[ ] No duplicated logic or shadow helpers.
[ ] Contracts (API / error codes / logging keys) preserved.
[ ] Lint & typecheck pass (no broad disables).
[ ] Tests added/updated & passing.
[ ] Commit message format:
    feat(<area>): <short goal> [Sprint <N>, Step <M>]
    - Modify: path/FileA.ts – <what>
    - New: path/NewFile.ts – <why>
    Contracts preserved: <list>
    Tests: <summary>
```

---
## 9) Security & Data Handling
- No plaintext secrets in code or logs.
- PII (email, phone) only in logs if masked/anonymized when outside dev.
- Validate all external input (reuse existing zod / schema validators).

---
## 10) Performance Hotspots (Current Focus Areas)
- Booking slot allocation & conflict detection.
- Payment verification and webhook ingestion.
- Authentication session issuance.

Changes in these areas must:
- Avoid extra synchronous round-trips.
- Leverage batching/caching layers if they already exist.

---
## 11) Dependency Discipline
- Prefer native / existing utility over introducing new dependency.
- If adding a dependency: justify (size, maintenance, security posture) in Patch Plan.

---
## 12) Documentation Expectations
- Update README or service-level docs if a user-visible or ops-impacting change (new env var, CLI script, endpoint) is introduced.
- Add inline JSDoc/TSDoc for new exported functions or complex logic blocks.

---
## 13) Failure Handling
- Use structured errors (domain error classes if present) instead of raw throws.
- Surface user-safe messages outward, log internal diagnostics separately.

---
## 14) Rollback Readiness
Each patch should be revertible without data drift. If a migration/schema change becomes necessary, accompany it with:
- Forward migration script
- (Optional) Backfill script reference
- Roll-forward plan rather than rollback if destructive.

---
## 15) Alignment with Implementation Plan
These guardrails enforce iterative sprint-based delivery, ensuring:
- Minimal risk per increment
- High observability
- Consistent domain boundaries
- Fast onboarding for new contributors

---
*Adhere to these guardrails for every change. Non-compliant patches should be rejected during review.*

Workspace Custom Instructions (Ganges Healers)

Use docs/IMPLEMENTATION_PLAN.md for roadmap context and docs/GUARDRAILS.md for change process.

Checklist (initial project bootstrap – already executed unless unchecked):
- [x] Verify copilot-instructions.md exists
- [x] Clarify Project Requirements (Next.js App Router, Tailwind, shadcn/ui, Prisma, NextAuth, etc.)
- [x] Scaffold the Project
- [x] Customize the Project (auth, dashboard, services UI)
- [x] Install Required Extensions (none mandatory beyond recommended)
- [x] Compile the Project (dependencies installed, diagnostics run)
- [ ] Create and Run Task (add VS Code task for dev server if needed)
- [ ] Launch the Project (start dev server on request)
- [ ] Ensure Documentation is Complete (keep README + docs current)

Guardrails Summary (see docs/GUARDRAILS.md for full details):
- Always context-scan before adding code; extend instead of duplicating.
- Modify in place by default—new files require justification (Patch Plan).
- Preserve public contracts (API shapes, error codes, logging keys).
- Small, focused diffs; avoid speculative refactors.
- Add/extend tests for new behavior; keep lint + typecheck clean.
- Use existing shared packages for utils/types/config.
- Provide a Patch Plan outlining goal, touched files, no-change assertions, tests, rollback.

Patch Plan Template (inline quick reference):
Goal: <summary>
Touched: <modified files + reasons>
New: <files + justification or none>
No-change: <contracts preserved>
Tests: <unit/e2e additions>
Rollback: <revert strategy>

Follow these instructions to maintain consistency with the implementation roadmap.
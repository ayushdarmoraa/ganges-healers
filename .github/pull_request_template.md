## Summary

- What changed and why (1–3 lines)

## Public Contracts (tick all that apply)

- [ ] No changes to public API routes or response shapes
- [ ] Contracts updated + tests updated (list tests)
- [ ] Docs updated (`docs/payments.md`, `docs/invoices.md`, `docs/ops-checklist.md`)

## Payments/Invoices Guardrails

- [ ] Membership slugs unchanged: `vip-monthly`, `vip-yearly` (aliases only in input)
- [ ] Subscribe dry-run still emits `SUBSCRIBE_V3`
- [ ] Invoices route still 302 with same precedence
- [ ] Webhook still verifies raw HMAC; single endpoint only
- [ ] `byType` keys unchanged: `SESSION`, `PROGRAM`, `MEMBERSHIP`, `STORE`, `COURSE`

## Tests run

- [ ] `pnpm lint && pnpm typecheck`
- [ ] `pnpm test`
- [ ] Webhook simulator (if touched): command + status

## Risk & Rollback

- Risk level: Low / Med / High
- Rollback: revert PR; no data migration required.

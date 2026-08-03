# Dash Launch — Hardening, Compliance & Scale (Phase 3)

## Automated tests

- [ ] `apps/dash-customer`: `pnpm test` green in CI
- [ ] `apps/dash-courier`: `pnpm test` green in CI
- [ ] `apps/dash-merchant`: existing vitest suite green
- [ ] Golden-path e2e (staging): browse → checkout → pay → merchant accept → dispatch → courier deliver → payout row

## Security / compliance

- [ ] RLS sign-off on `delivery` + `payments` money tables (see existing `docs/rls-audit.md` pattern)
- [ ] PCI scope review for Stripe Terminal card-present
- [ ] Legal sign-off on Connect payout rail (`docs/dash-launch-compliance-checklist.md`)

## Load & monitoring

- [ ] Load test order create + `POST /courier/offers/redispatch` at target launch volume
- [ ] Uptime check on `GET /health/dash-golden-path` (auth via cron/service secret)
- [ ] Alert fires when `stuck_orders` or `ready_no_courier` > 0
- [ ] Synthetic page-out confirmed once

## Hygiene

- [ ] `.env.example` completeness across customer/merchant/courier/supabase
- [ ] Remove stale Stripe CSP from dash-customer `vercel.json` if still present
- [ ] Mock dispatch env footgun documented / gated

## Support runbook (must exist before Phase 4)

Document procedures for:

1. Stuck order (status too long)
2. Failed payment capture
3. Failed payout / Connect transfer
4. Courier app crash mid-delivery
5. Merchant-initiated cancel of in-flight order

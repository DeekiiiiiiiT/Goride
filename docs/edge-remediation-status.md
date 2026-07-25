# Edge Remediation Status — 2026-07-25

Companion to `docs/edge-function-audit-2026-07-24.md` and the Edge Infrastructure Remediation Program.

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| P0 Stop the bleed | Code complete | Deploy + live redteam still required |
| P1 Harden + deploy | Code complete | CI deploys all 18 functions |
| P2 Platform hardening | Code complete | Malware fail-closed, timeouts, Zod, authz matrix |
| P3 Monolith extract | Started | Tree relocated to `_fleet-server/`; shim retained |
| P4 Maintainability | Code complete | Route splits, rate limit, flags, shared ErrorBoundary |

## P0 findings

| Finding | Fix location | Status |
|---------|--------------|--------|
| Delivery unauth order leak | `delivery/customerOrderRoutes.ts` GET `/orders/:id` | Fixed in code |
| Service-role fallback on missing auth | `delivery/index.ts` `getSupabase` | Fixed in code |
| Client-trusted order prices | `customerOrderRoutes.ts` + `orderPricing.ts` | Fixed in code |
| PayPal capture IDOR | `payments/index.ts` | Fixed in code |
| Intents no ownership | `payments/index.ts` | Fixed in code |
| Auth hooks fail-open | `before-user-created`, `custom-access-token` | Fixed in code |
| merchant-push no authz | `merchant-push/index.ts` + `requireInternalSecret` | Fixed in code |
| send-sms config | `supabase/config.toml` | Fixed in code |
| WiPay sandbox host | `wipayGatewayUrl()` by `WIPAY_ENV` | Fixed in code |

## Ops checklist (Product Owner)

1. Set secrets: `MERCHANT_PUSH_SECRET`, hook secrets, `CORS_ALLOWED_ORIGINS`, `MALWARE_SCAN_API_KEY` (or accept fail-closed uploads)
2. Deploy: `pnpm deploy:functions:all` or push to `main` (CI)
3. Run `docs/edge-audit-redteam.md` §5 and fill Pass columns
4. Smoke: place order, pay, merchant push, OTP
5. Continue Phase 3 cutover per `docs/fleet-monolith-extraction.md`

## Key new shared modules

- `_shared/corsAllowlist.ts`, `timingSafeEqual.ts`, `requireInternalSecret.ts`, `safeJsonError.ts`
- `_shared/fetchWithTimeout.ts`, `malwareScan.ts` (fail-closed), `validateBody.ts`, `rateLimit.ts`, `featureFlags.ts`, `cacheControl.ts`
- `_fleet-server/` — relocated fleet backend (was under `apps/fleet/src/...`)
- `packages/roam-shared` — shared ErrorBoundary (admin migrated)
- `docs/edge-authz-matrix.md`, `docs/fleet-monolith-extraction.md`

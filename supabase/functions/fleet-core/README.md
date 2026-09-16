# fleet-core (successor name for `make-server-37f42386`)

Per ADR-0021, after domain cutovers the residual shim is conceptually **fleet-core**:

- Drivers×6, ledger×9, enterprise/workforce, platform, audit/safety/sync/apiCenter
- `week_close` conductor (HTTP seals to fuel/toll/pay)

**Scaffold status (closeout Phase 6):** `src/main.ts` is live — kernel + `registerResidualMonolithRoutes`, in `TARGETS` / `ALL_FNS` / `pnpm deploy:fleet-core`. Path style `fleet-core` rewrites `/fleet-core/*` → `/make-server-37f42386/*`.

**Rename status (F5):** slug `make-server-37f42386` remains the client-facing Edge Function until N-day zero-traffic soak on extracted paths. Do not delete the old slug until `API_ENDPOINTS.fleet` aliases and deploy aliases are rehearsed (ADR-0022 RTO).

Residual homes live on: `fleet-fuel`, `fleet-toll`, `fleet-ops`, `fleet-claims`, `fleet-pay`. Extraction status: `GET /v1/extraction-status` (generated from manifests).

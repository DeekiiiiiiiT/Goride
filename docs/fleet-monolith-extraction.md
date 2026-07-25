# Fleet monolith extraction (strangler fig)

## Goal

Move production fleet backend out of the frontend app tree and cut traffic domain-by-domain from the legacy `make-server-37f42386` shim onto `fleet-ops` (and later focused edge functions), without a big-bang rewrite.

## Source of truth

| Role | Path |
|------|------|
| **Fleet server modules** | `supabase/functions/_fleet-server/` |
| **Production shim (Deno.serve)** | `supabase/functions/make-server-37f42386/` — imports `_fleet-server/index.tsx` |
| **Extraction target** | `supabase/functions/fleet-ops/` |
| **Related cron** | `supabase/functions/evidence-cleanup/` — imports `_fleet-server` |

Do **not** put live edge code back under `apps/fleet/`.

## Phase 3 status (this move) — 2026-07-25

**Done**

- Physically relocated `apps/fleet/src/supabase/functions/server/` → `supabase/functions/_fleet-server/` (107 files).
- Updated make-server, evidence-cleanup, and fleet/admin test imports to the new path.
- Rewrote `_fleet-server` imports that pointed at fleet `utils/` / `types/` to `../../../apps/fleet/src/...`.
- Expanded `fleet-ops`: shared CORS allowlist, `/health`, `/v1/extraction-status`, and import of `registerMaintenanceRoutes` / `registerExpenseHubRoutes` (not mounted yet — path prefixes still assume make-server).
- make-server header documents `_fleet-server` as source of truth; shim **not** deleted.

**Still on make-server**

All live fleet domains (fuel, toll, claims, driver pay, maintenance, expense hub, ledger, etc.) boot via the shim until cutover.

## Cutover order

1. **Fuel** — extract fuel controllers/routes onto `fleet-ops` (or `fleet-fuel`); dual-run then switch clients.
2. **Toll** — same pattern for toll + period/settlement.
3. **Claims** — claim service + charge guards.
4. **Driver pay** — periods, settlement, payouts.
5. **Retire shim** — remove `make-server-37f42386` once no traffic remains; keep `_fleet-server` as the shared module home or split further.

Maintenance / expense hub already expose `register*Routes` and are the first candidates to **mount** on `fleet-ops` after path-prefix normalization (today they still register under `/make-server-37f42386/...`).

## Verify

```bash
# No live code should still point at the old tree (docs/history excluded):
rg "apps/fleet/src/supabase/functions/server" --glob '!docs/**' --glob '!.cursor/**'

# Extraction status (after deploy):
curl "$SUPABASE_URL/functions/v1/fleet-ops/v1/extraction-status"
```

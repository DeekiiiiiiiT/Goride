# Platform Settings — Baseline Inventory (Phase 0)

## Settings consumers (in scope)

| File | Role |
|------|------|
| `apps/admin/src/components/admin/PlatformSettings.tsx` | Dominion load/save |
| `apps/fleet/src/components/admin/PlatformSettings.tsx` | Fleet/enterprise admin load/save |
| `apps/admin/src/components/admin/AdminDashboard.tsx` | Dominion settings prefetch |
| `apps/fleet/src/components/admin/AdminDashboard.tsx` | Fleet admin settings prefetch |
| `apps/fleet/src/supabase/functions/server/index.tsx` | `/platform-status`, `/platform-feature-flags`, maintenance middleware, GET/PUT settings |
| `apps/fleet/src/supabase/functions/server/timezone_helper.tsx` | Fleet timezone from KV |
| `apps/fleet/src/components/auth/LoginPage.tsx` | Registration mode, business types from `/platform-status` |
| `apps/fleet/src/components/auth/FeatureFlagContext.tsx` | Enabled modules from `/platform-feature-flags` |
| `apps/fleet/src/App.tsx` | Maintenance mode banner |

## KV keys

- Legacy: `platform:settings`
- Product lines: `platform:settings:fleet`, `platform:settings:enterprise`
- Planned: `platform:settings:global`, `platform:settings:rides`, `platform:settings:driver`, `platform:settings:haul`, `platform:settings:dash`

## Migration endpoint

`POST /make-server-37f42386/admin/migrate-platform-settings` — idempotent; copies legacy key to fleet + enterprise split keys.

## Manual smoke-test matrix

Run before/after each implementation phase.

| Surface | Action | Expected |
|---------|--------|----------|
| roamfleet.co login | Load page | Registration mode + platform name from fleet KV |
| roamfleet.co/admin → Settings | Save currency | Persists after refresh; fleet segment header used |
| roamenterprise.co/admin → Settings | Business types visible | Toggles persist |
| roamdominion.co → Settings | Save any field | Writes intended segment KV |
| Fleet app sidebar | Disable fuel module | Fuel nav hidden after refresh |
| Maintenance mode ON (fleet) | Hit fleet API | 503 for non-exempt routes |

# Direct `supabase.from(...)` client inventory (apps/)

Generated for the “one project + RLS” hardening pass. **Server** Edge code under `apps/fleet/src/supabase/functions` is excluded here (uses service role / server context).

## Summary

| App | `rides` schema | Notes |
|-----|----------------|--------|
| `rides-passenger` | **None** | All rides traffic goes through HTTP + [`ridesEdge.ts`](apps/rides-passenger/src/services/ridesEdge.ts) |
| `dash-customer` | **None** | (grep `supabase.from` in app src) |
| `dash-merchant` | **None** | (grep in app src) |
| `driver` | **None** for `rides.*` | Uses `driver_profiles` (public) in onboarding / hooks — must stay aligned with `driver_profiles` RLS |

## `driver` app (public `driver_profiles`)

- `apps/driver/src/hooks/useCurrentDriver.ts` — `select` on `driver_profiles`
- `apps/driver/src/components/auth/DriverOnboardingPage.tsx` — insert/update
- `apps/driver/src/components/onboarding/DriverGoogleSignupWizard.tsx` — insert/update

**Action:** Keep `driver_profiles` RLS as the control plane for these writes; rides operational data should remain **Edge-first** for `rides.*`.

## `rides` schema (`rides.*`)

No direct client queries found in `apps/rides-passenger`, `apps/driver`, or dash apps for `rides` tables. Surge and ride lifecycle are API-driven.

**Migration follow-up:** Tightened `rides.surge_cells` SELECT policy to rides-surface roles only (`supabase/migrations/20260515143000_rides_surge_cells_role_rls.sql`).

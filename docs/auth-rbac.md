# Auth RBAC (Enterprise)

## Model

| Field | Location | Purpose | Who writes |
|-------|----------|---------|------------|
| Permissions | `app_metadata.role` + `app_metadata.roles[]` | Admin/API access (`driver_admin`, `platform_owner`, …) | Service role / edge functions only |
| Driver eligibility | `driver_profiles` table | Driver app onboarding and shell | Signup + admin tools |
| Surface hint | `user_metadata.surface` | `driver` \| `passenger` UX only | Client on OAuth intent only |
| Legacy | `user_metadata.role` | Deprecated for gates; migration fallback | Do not write from driver/rides login |

## Resolution order (client + edge)

1. `app_metadata.roles[]` (any match for product admin)
2. `app_metadata.role` (primary)
3. `user_metadata.role` (legacy)

Helpers: `@roam/auth-client` → `jwtPrimaryRole`, `getJwtRoles`, `hasProductAdminRole`.

Edge: `supabase/functions/_shared/authEdge.ts` (same order).

## Assigning admin roles

Use `assignUserRoles` in `supabase/functions/_shared/assignUserRoles.ts` (service role), or Supabase Dashboard → Authentication → user → **App Metadata**:

```json
{
  "role": "driver_admin",
  "roles": ["driver_admin"]
}
```

Platform staff invite (`POST .../admin/team/invite`) writes `app_metadata`, not `user_metadata.role`.

## Migration

Run `supabase/migrations/20260522100000_auth_roles_to_app_metadata.sql` on staging/production to copy existing admin roles from `user_metadata` into `app_metadata`.

## Manual test matrix

| Account | Action | Expected |
|---------|--------|----------|
| `app_metadata.role = driver_admin` | Login on roamdriver.co (driver app) | Driver app works; `/admin` still allowed after JWT refresh |
| `user_metadata.role = driver` only | Open `/admin` | Access denied |
| `platform_owner` | Login driver app | No `user_metadata.role` overwrite; admin unchanged |
| Pure driver | Open `/admin` | Access denied |

## Supabase hardening (recommended)

- Do not grant clients permission to mutate `app_metadata`.
- Use Auth Hooks (optional follow-up) to reject anon-key `app_metadata` writes.

## Related files

- `packages/auth-client/src/jwtRole.ts`
- `apps/driver/src/contexts/AuthContext.tsx` (OAuth surface only)
- `apps/driver/src/admin/DriverAdminPortal.tsx`

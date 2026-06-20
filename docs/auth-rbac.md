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

**“No rows returned”** means no user had an admin role in `user_metadata` to copy. Grant access by email:

```sql
-- supabase/scripts/grant_driver_admin_by_email.sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"driver_admin","roles":["driver_admin"]}'::jsonb
WHERE email = 'your-admin@email.com';
```

Different driver vs admin emails are fine — each account needs its own roles. The driver email does not affect the admin email.

## Same host (`localhost:3002` / `roamdriver.co`)

`/ and `/admin` are one origin, so they used to share one Supabase `localStorage` session — signing into `/` replaced whoever was logged into `/admin`.

**Fix:** separate storage keys in `@roam/auth-client`:

- `supabaseDriverApp` → `sb-<project>-auth-driver` (path `/`)
- `supabaseDriverAdmin` → `sb-<project>-auth-admin` (path `/admin`)

You can stay signed in as admin and driver at the same time in two tabs.

## Same host (`localhost:5176` / `courier.roamdash.co`)

Courier consumer (`/`) and admin (`/admin`) use isolated Supabase sessions:

- `supabaseCourierApp` → `sb-<project>-auth-courier` (path `/`)
- `supabaseCourierAdmin` → `sb-<project>-auth-courier-admin` (path `/admin`)

Grant courier admin with `supabase/scripts/grant_courier_admin_by_email.sql` (`courier_admin` / `courier_ops`).

## Manual test matrix

| Account | Action | Expected |
|---------|--------|----------|
| `app_metadata.role = driver_admin` | Login on roamdriver.co (driver app) | Driver app works; `/admin` still allowed after JWT refresh |
| `user_metadata.role = driver` only | Open `/admin` | Access denied |
| `platform_owner` | Login driver app | No `user_metadata.role` overwrite; admin unchanged |
| Pure driver | Open `/admin` | Access denied |
| `app_metadata.role = courier_admin` | Login on courier.roamdash.co/admin | Dashboard loads; consumer app session unchanged |
| `courier_ops` | Write actions (suspend, approve) | API 403 |

## Supabase hardening (recommended)

- Do not grant clients permission to mutate `app_metadata`.
- Use Auth Hooks (optional follow-up) to reject anon-key `app_metadata` writes.

## Related files

- `packages/auth-client/src/jwtRole.ts`
- `apps/driver/src/contexts/AuthContext.tsx` (OAuth surface only)
- `apps/driver/src/admin/DriverAdminPortal.tsx`
- `apps/dash-courier/src/admin/CourierAdminPortal.tsx`

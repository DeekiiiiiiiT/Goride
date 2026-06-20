# Auth RBAC (Enterprise)

## Database-backed RBAC (authoritative)

Admin permissions are stored in the `platform` schema:

| Table | Purpose |
|-------|---------|
| `platform.roles` | Role definitions with hierarchy level |
| `platform.permissions` | Fine-grained permission keys |
| `platform.role_permissions` | Role → permission mapping |
| `platform.user_roles` | User → role assignments |
| `platform.permission_audit_log` | Permission checks and admin actions |

Migrations:

- `supabase/migrations/20260627100000_platform_rbac_schema.sql`
- `supabase/migrations/20260627110000_migrate_jwt_roles_to_db.sql`

Provisioning: see `docs/rbac/ADMIN_PROVISIONING.md` and `docs/rbac/PERMISSION_CATALOG.md`.

**Identity separation:** Platform super admin and product admin must use **separate accounts** (enforced by DB trigger).

## Model

| Field | Location | Purpose | Who writes |
|-------|----------|---------|------------|
| Permissions (authoritative) | `platform.user_roles` + `platform.role_permissions` | Enterprise RBAC | Service role / provisioning scripts |
| Permissions (legacy sync) | `app_metadata.role` + `app_metadata.roles[]` | JWT fallback during migration | Service role / edge functions only |
| Driver eligibility | `driver_profiles` table | Driver app onboarding and shell | Signup + admin tools |
| Surface hint | `user_metadata.surface` | `driver` \| `passenger` UX only | Client on OAuth intent only |
| Legacy | `user_metadata.role` | Deprecated for gates; migration fallback | Do not write from driver/rides login |

## Resolution order (client + edge)

1. **Database** — `platform.user_roles` via RPC (`rbac_user_has_permission`, etc.)
2. `app_metadata.roles[]` (JWT fallback)
3. `app_metadata.role` (primary)
4. `user_metadata.role` (legacy)

Helpers: `@roam/auth-client` → `usePermissions`, `jwtPrimaryRole`, `getJwtRoles`, `hasProductAdminRole`.

Edge: `supabase/functions/_shared/rbacQuery.ts`, `requirePermission.ts`, `requireMinRoleLevel.ts`.

API: `GET /identity/permissions` — resolved permissions for current user.

## Assigning admin roles

**Preferred:** `supabase/scripts/provision_platform_admin.sql` or `provision_product_admin.sql`.

Legacy: `assignUserRoles` in `supabase/functions/_shared/assignUserRoles.ts`, or SQL grant scripts.

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
- `supabaseRidesAdmin` → `sb-<project>-auth-rides-admin` (rides `/admin`)
- `supabaseDashAdmin` → `sb-<project>-auth-dash-admin` (dash `/admin`)
- `supabaseFleetAdmin` → `sb-<project>-auth-fleet-admin` (fleet `/admin`)

Grant courier admin with `supabase/scripts/provision_product_admin.sql` (`courier_admin`).

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

- `packages/auth-client/src/platformPermissions.ts`
- `packages/auth-client/src/hooks/usePermissions.ts`
- `packages/auth-client/src/jwtRole.ts`
- `apps/driver/src/contexts/AuthContext.tsx` (OAuth surface only)
- `apps/driver/src/admin/DriverAdminPortal.tsx`
- `apps/dash-courier/src/admin/CourierAdminPortal.tsx`

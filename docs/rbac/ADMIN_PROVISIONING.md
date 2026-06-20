# Admin Provisioning

## Accounts

| Account type | Email example | Roles |
|--------------|---------------|-------|
| Platform Super Admin | Dedicated super-admin email only | `platform_owner` |
| Product Admin | `prodigiousinvestments101@gmail.com` | `{product}_admin` per portal |

**Never mix** platform and product roles on the same account.

## Provision platform super admin

1. Create the user in Supabase Auth (email + password).
2. Run `supabase/scripts/provision_platform_admin.sql` with the super-admin email.
3. Sign in at https://roamdominion.co (Roam Dominion).

## Provision product admin

1. Create or identify the product admin user in Supabase Auth.
2. Run `supabase/scripts/provision_product_admin.sql`:
   - Set `v_email` to the product admin email.
   - Set `v_product_key` to `courier`, `driver`, `rides`, `dash`, `haul`, or `fleet`.
3. Sign out and sign back in at the product admin portal.

## Migrate existing JWT roles

After deploying migrations, run (automatically via migration):

`supabase/migrations/20260627110000_migrate_jwt_roles_to_db.sql`

This copies `app_metadata.roles[]` into `platform.user_roles`.

## Verify access

```sql
SELECT u.email, r.name, r.level, r.product_key
FROM platform.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
JOIN platform.roles r ON r.id = ur.role_id
ORDER BY u.email, r.level DESC;
```

## API

`GET /identity/permissions` — returns resolved permissions for the current JWT.

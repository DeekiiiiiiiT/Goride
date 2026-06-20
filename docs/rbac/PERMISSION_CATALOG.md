# Permission Catalog

Enterprise RBAC permissions for Roam platform and product admin portals.

## Global permissions

| Key | Category | Description |
|-----|----------|-------------|
| `users.read` | users | View user profiles and directories |
| `users.create` | users | Create new user accounts |
| `users.edit` | users | Edit user profiles |
| `users.delete` | users | Delete user accounts |
| `users.manage_roles` | users | Assign and revoke admin roles |
| `users.suspend` | users | Suspend user accounts |
| `users.ban` | users | Ban user accounts |
| `financial.read` | financial | View transactions and settlements |
| `financial.edit` | financial | Modify financial records |
| `financial.refunds` | financial | Process refunds |
| `financial.settlements` | financial | Override settlement rules |
| `system.config` | system | Platform configuration |
| `system.billing` | system | Billing management |
| `system.security` | system | Security settings |
| `analytics.view` | analytics | View analytics dashboards |
| `analytics.export` | analytics | Export analytics data |
| `roles.manage` | system | Manage role definitions |
| `audit.read` | system | View permission audit log |

## Product permissions

For each product (`fleet`, `enterprise`, `dash`, `rides`, `driver`, `haul`, `courier`):

| Suffix | Description |
|--------|-------------|
| `portal.access` | Access product admin portal |
| `users.read` | View product users |
| `users.write` | Mutate product users |
| `compliance.read` | View compliance queue |
| `compliance.approve` | Approve/reject compliance |
| `ledger.read` | View ledger |
| `support.write` | Support tools write actions |
| `settings.read` | View platform settings segment |
| `settings.write` | Edit platform settings segment |
| `presence.read` | View live presence map |

Example: `courier.compliance.approve`

## Role → permission mapping

| Role | Access |
|------|--------|
| `platform_owner` | All permissions |
| `platform_support` | Read + portal access + limited support |
| `platform_analyst` | Analytics + read-only financial |
| `{product}_admin` | `users.read` + all permissions for that product |
| `{product}_ops` | `users.read` + read-only product permissions |

## Identity separation

- **Platform super admin** (`platform_owner`) must use a **separate email** from product admins.
- Database trigger `trg_enforce_identity_separation` blocks mixed assignments.

## Code references

- Constants: `packages/auth-client/src/platformPermissions.ts`
- Edge mirror: `supabase/functions/_shared/platformPermissions.ts`
- DB schema: `supabase/migrations/20260627100000_platform_rbac_schema.sql`

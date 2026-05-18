# Rider user management (ops playbook)

Super Admin → **User Management** (`/admin/users`) for passenger (`role: passenger`) accounts.

## When to use each action

| Action | Use when |
|--------|----------|
| **Suspend** | Temporary block — fraud review, payment dispute, abusive behaviour. Rider cannot book until unsuspended. |
| **Unsuspend** | Review complete; restore normal access. |
| **Ban** | Permanent removal (platform_owner / superadmin only). |
| **Password reset** | Rider locked out; sends recovery email via Supabase Auth. |
| **Sign out all devices** | Stolen phone / credential concern; forces re-login. |
| **Internal note** | Support context for the next agent (not shown to rider). |

## Roles

| Role | List / detail | Suspend, notes, reset, sign-out | Ban |
|------|---------------|----------------------------------|-----|
| rides_ops | Yes | No | No |
| rides_admin | Yes | Yes | No |
| platform_owner, superadmin | Yes | Yes | Yes |

## Technical notes

- Apply migration `20260518140000_rider_admin.sql` and redeploy `rides` Edge function.
- Booking enforcement: suspended/banned riders receive `403` with `rider_account_restricted` on quote and request.
- Password recovery links are only returned in the API for platform roles (optional clipboard copy).

## Manual test checklist

1. Open `/admin/users` as superadmin — directory loads.
2. Search by rider email — open detail.
3. Add internal note — visible on Notes tab.
4. Suspend rider — passenger app cannot get a quote.
5. Unsuspend — booking works again.
6. Reset password — check Supabase Auth logs / email.
7. Sign out all devices — rider must sign in again.
8. Log in as `rides_ops` — can view but suspend returns 403.

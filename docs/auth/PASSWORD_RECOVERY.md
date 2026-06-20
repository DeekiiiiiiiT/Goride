# Password recovery

## Rule

Password reset links must return the user to the **same product domain** where they were locked out — not the marketing Site URL (`roamenterprise.co`).

| Locked out on | Reset email opens |
|---------------|-------------------|
| `roamdominion.co` | `roamdominion.co/reset-password` |
| `roamfleet.co` | `roamfleet.co/reset-password` |
| `roamenterprise.co` | `roamenterprise.co/reset-password` |
| `roamdriver.co` | `roamdriver.co/reset-password` |
| `roam-s.co` | `roam-s.co/reset-password` |
| `roamhaul.co` | `roamhaul.co/reset-password` |
| `roamdash.co` | `roamdash.co/reset-password` |
| `partner.roamdash.co` | `partner.roamdash.co/reset-password` |
| `courier.roamdash.co` | `courier.roamdash.co/reset-password` |

## How it works

1. User clicks **Forgot password?** on a product login page.
2. App calls `requestPasswordReset(client, email, surface)` from `@roam/auth-client`.
3. Client uses `${window.location.origin}/reset-password` as `redirectTo`.
4. User sets a new password on `PasswordRecoveryPage` (via `AuthRecoveryGate` in each app).
5. User signs in on the same product.

Server-side admin resets (`generateLink`) pass an explicit `redirectTo` per product — see `supabase/functions/_shared/authRecoveryRedirects.ts`.

## Do not use

**Supabase Dashboard → Users → Send password recovery** for product users. It uses the global Site URL and does not know which app the user belongs to. Use in-app **Forgot password?** instead.

## Constants

Canonical URLs: `packages/auth-client/src/authRecoveryRedirects.ts`  
Edge mirror: `supabase/functions/_shared/authRecoveryRedirects.ts`  
Redirect allowlist: [`SUPABASE_REDIRECT_CHECKLIST.md`](SUPABASE_REDIRECT_CHECKLIST.md)

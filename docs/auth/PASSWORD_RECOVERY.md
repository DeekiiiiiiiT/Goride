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
2. App calls `requestPasswordReset(email, surface)` (or `useForgotPassword(surface)`) from `@roam/auth-client` — always via isolated `supabaseRecovery`.
3. `requestPasswordReset` / `useForgotPassword` always send via **`supabaseRecovery`** (isolated from app login sessions).
4. Client uses `${window.location.origin}/reset-password` as `redirectTo`.
5. User sets a new password on `PasswordRecoveryPage` (via `AuthRecoveryGate` in each app).
6. User signs in on the same product.

Server-side admin resets (`generateLink`) pass an explicit `redirectTo` per product — see `supabase/functions/_shared/authRecoveryRedirects.ts`.

## Troubleshooting

### “Link expired” immediately after sending

1. **Email link scanners (common on Outlook/Hotmail)** — Microsoft Safe Links may open the reset URL once before you do, which burns the one-time token. Request a new email and click the link right away, or paste the link into the browser manually from “View original message.”
2. **Two Supabase clients on the same page** — the main app client must not use `detectSessionInUrl` on `/reset-password` (only `supabaseRecovery` should read the URL). Otherwise the token is consumed before the reset form loads and you may appear logged in without changing your password.

### Logged in without setting a new password

Usually an **existing browser session** (you were already signed in) or the main client consumed a recovery session from the URL. Sign out, request a fresh reset email, and open the link in a private window to test cleanly.

## Do not use

**Supabase Dashboard → Users → Send password recovery** for product users. It uses the global Site URL and does not know which app the user belongs to. Use in-app **Forgot password?** instead.

## Constants

Canonical URLs: `packages/auth-client/src/authRecoveryRedirects.ts`  
Edge mirror: `supabase/functions/_shared/authRecoveryRedirects.ts`  
Redirect allowlist: [`SUPABASE_REDIRECT_CHECKLIST.md`](SUPABASE_REDIRECT_CHECKLIST.md)

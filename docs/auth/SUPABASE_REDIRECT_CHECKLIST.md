# Supabase Auth — Site URL, redirects, and Google OAuth

Use this checklist in the **Supabase Dashboard** (Authentication → URL Configuration) and **Google Cloud Console** (OAuth client for this project). All Roam web apps share **one** Supabase project; each **origin** that starts an OAuth or email flow must be allowed to receive the user after redirect.

## Site URL (production)

Pick a single primary production URL for the project default (often your main marketing or admin entry). This does **not** block other redirect URLs if they are listed below; it mainly affects default email links if paths are wrong. Document your choice here: _______________

## Redirect URLs (add every exact pattern you use)

Include **scheme + host + port + path** where your apps handle the post-auth landing page.

| App | Dev (typical) | Production (example) |
|-----|---------------|-------------------------|
| Fleet (rideshare) | `http://localhost:3000/` | `https://roamfleet.co/` |
| Fleet owner signup | `http://localhost:3000/signup` | `https://roamfleet.co/signup` |
| Enterprise fleet | `http://localhost:3003/` | `https://roamenterprise.co/` |
| Enterprise Super Admin | `http://localhost:3001/` | `https://roamdominion.co/` (deploy `@roam/admin`) |
| Driver | `http://localhost:3002/` | `https://roamdriver.co/` |
| Driver (Android app) | — | `co.roamenterprise.driver://login` |
| Driver admin tracker | — | Same URLs; see `docs/legal/PLAY_STORE_DRIVER_LAUNCH.md` |
| Dash customer | `http://localhost:5174/` | `https://roamdash.co/` (or customer subdomain) |
| Dash courier | `http://localhost:5176/` | `https://courier.roamdash.co/` |
| Dash courier admin | `http://localhost:5176/admin` | `https://courier.roamdash.co/admin` |
| Dash merchant | `http://localhost:5175/` | `https://partner.roamdash.co/` (if used) |
| Rides passenger | `http://localhost:5180/login` | `https://roam-s.co/login` |
| Rides passenger (Android app) | — | `co.roamenterprise.rides://login` |
| Roam Haul (hauler) | `http://localhost:3004/` | `https://roamhaul.co/` |
| Roam Haul admin | `http://localhost:3004/admin` | `https://roamhaul.co/admin` |

Also add:

- Vercel preview wildcards if you use them: `https://*.vercel.app/**`
- Any alternate `www.` hosts you deploy.

**Rule:** The URL passed as `redirectTo` in `signInWithOAuth` and paths used in `emailRedirectTo` must appear in this list (Supabase compares allowed redirect prefixes).

## Password recovery (`/reset-password`)

Add every production and dev recovery landing URL. See [`PASSWORD_RECOVERY.md`](PASSWORD_RECOVERY.md).

| App | Dev (typical) | Production |
|-----|---------------|------------|
| Dominion (Super Admin) | `http://localhost:3001/reset-password` | `https://roamdominion.co/reset-password` |
| Fleet manager | `http://localhost:3000/reset-password` | `https://roamfleet.co/reset-password` |
| Enterprise fleet | `http://localhost:3003/reset-password` | `https://roamenterprise.co/reset-password` |
| Driver | `http://localhost:3002/reset-password` | `https://roamdriver.co/reset-password` |
| Rides passenger | `http://localhost:5180/reset-password` | `https://roam-s.co/reset-password` |
| Roam Haul | `http://localhost:3004/reset-password` | `https://roamhaul.co/reset-password` |
| Dash customer / admin | `http://localhost:5174/reset-password` | `https://roamdash.co/reset-password` |
| Dash merchant (partner) | `http://localhost:5175/reset-password` | `https://partner.roamdash.co/reset-password` |
| Dash courier | `http://localhost:5176/reset-password` | `https://courier.roamdash.co/reset-password` |

Also add admin recovery on same hosts: `https://courier.roamdash.co/reset-password`, etc. (same path as consumer — `AuthRecoveryGate` handles the token).

## Google OAuth — Authorized redirect URIs

In Google Cloud Console → Credentials → OAuth 2.0 Client → **Authorized redirect URIs**, you must include Supabase’s callback URL for this project:

`https://<project-ref>.supabase.co/auth/v1/callback`

(Use your real project ref from the Supabase API settings.)

## Code reference (canonical login paths)

See **[`CANONICAL_LOGIN_PATHS.md`](CANONICAL_LOGIN_PATHS.md)** for the full table.

| App | OAuth / email redirect target |
|-----|-------------------------------|
| Rides passenger | `{origin}/login` — see `apps/rides-passenger` |
| Driver | `{origin}/` — see `apps/driver` |
| Dash customer / merchant | `{origin}/` — see `apps/dash-*` |

After changing Dashboard settings, run a quick test: start Google sign-in from **each** deployed origin and confirm you land back on the **same** origin.

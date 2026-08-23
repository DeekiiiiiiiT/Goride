# Supabase Auth — Site URL, redirects, and Google OAuth

Use this checklist in the **Supabase Dashboard** (Authentication → URL Configuration) and **Google Cloud Console** (OAuth client for this project). All Roam web apps share **one** Supabase project; each **origin** that starts an OAuth or email flow must be allowed to receive the user after redirect.

## Site URL (production)

Pick a single primary production URL for the project default (often your main marketing or admin entry). This does **not** block other redirect URLs if they are listed below; it mainly affects default email links if paths are wrong. Document your choice here: **`https://roamfleet.co`** (set 2026-08-02 after courier Google OAuth was falling back to `http://127.0.0.1:3000`).

**Never** push local `supabase/config.toml` Auth URL defaults to the hosted project (`supabase config push`) — local `site_url` is `http://127.0.0.1:3000` and will break phone/production OAuth.

## Redirect URLs (add every exact pattern you use)

Include **scheme + host + port + path** where your apps handle the post-auth landing page.

| App | Dev (typical) | Production (example) |
|-----|---------------|-------------------------|
| Fleet (rideshare) | `http://localhost:3000/` | `https://roamfleet.co/` |
| Fleet owner signup | `http://localhost:3000/signup` | `https://roamfleet.co/signup` |
| Enterprise (apex / marketing) | `http://localhost:3003/` | `https://roamenterprise.co/` |
| Enterprise Courier door | `http://courier.localhost:3003/` | `https://courier.roamenterprise.co/` |
| Enterprise Freight Forwarder door | `http://freight-forwarder.localhost:3003/` | `https://freight-forwarder.roamenterprise.co/` |
| Enterprise Super Admin | `http://localhost:3001/` | `https://roamdominion.co/` (deploy `@roam/admin`) |
| Driver | `http://localhost:3002/` | `https://roamdriver.co/` |
| Driver (Android app) | — | `co.roamenterprise.driver://login` |
| Driver admin tracker | — | Same URLs; see `docs/legal/PLAY_STORE_DRIVER_LAUNCH.md` |
| Dash customer | `http://localhost:5174/` | `https://roamrush.app/` (or customer subdomain) |
| Dash customer (native app) | — | `co.roamenterprise.rush://login` |
| Dash courier | `http://localhost:5176/` | `https://courier.roamrush.app/` |
| Dash courier (native app) | — | `co.roamenterprise.courier://login` |
| Dash / Rush Ops Console | `http://localhost:5174/admin` | `https://roamrush.app/admin` |
| Dash merchant | `http://localhost:5175/` | `https://partner.roamrush.app/` (if used) |
| Dash merchant (Android / iOS app) | — | `co.roamenterprise.partner://login` |
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
| Enterprise (apex) | `http://localhost:3003/reset-password` | `https://roamenterprise.co/reset-password` |
| Enterprise Courier door | `http://courier.localhost:3003/reset-password` | `https://courier.roamenterprise.co/reset-password` |
| Enterprise Freight Forwarder door | `http://freight-forwarder.localhost:3003/reset-password` | `https://freight-forwarder.roamenterprise.co/reset-password` |
| Driver | `http://localhost:3002/reset-password` | `https://roamdriver.co/reset-password` |
| Rides passenger | `http://localhost:5180/reset-password` | `https://roam-s.co/reset-password` |
| Roam Haul | `http://localhost:3004/reset-password` | `https://roamhaul.co/reset-password` |
| Dash customer / admin | `http://localhost:5174/reset-password` | `https://roamrush.app/reset-password` |
| Dash merchant (partner) | `http://localhost:5175/reset-password` | `https://partner.roamrush.app/reset-password` |
| Dash courier | `http://localhost:5176/reset-password` | `https://courier.roamrush.app/reset-password` |

Also add admin recovery on same hosts: `https://courier.roamrush.app/reset-password`, etc. (same path as consumer — `AuthRecoveryGate` handles the token).

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

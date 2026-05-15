# Supabase Auth — Site URL, redirects, and Google OAuth

Use this checklist in the **Supabase Dashboard** (Authentication → URL Configuration) and **Google Cloud Console** (OAuth client for this project). All Roam web apps share **one** Supabase project; each **origin** that starts an OAuth or email flow must be allowed to receive the user after redirect.

## Site URL (production)

Pick a single primary production URL for the project default (often your main marketing or admin entry). This does **not** block other redirect URLs if they are listed below; it mainly affects default email links if paths are wrong. Document your choice here: _______________

## Redirect URLs (add every exact pattern you use)

Include **scheme + host + port + path** where your apps handle the post-auth landing page.

| App | Dev (typical) | Production (example) |
|-----|---------------|-------------------------|
| Fleet | `http://localhost:3000/` | `https://roamfleet.co/` |
| Admin | `http://localhost:3001/` | (same host as fleet or dedicated admin URL) |
| Driver | `http://localhost:3002/` | `https://roamdriver.co/` |
| Dash customer | `http://localhost:5174/` | `https://roamdash.co/` (or customer subdomain) |
| Dash merchant | `http://localhost:5175/` | `https://partner.roamdash.co/` (if used) |
| Rides passenger | `http://localhost:5180/login` | `https://roam-s.co/login` |

Also add:

- Vercel preview wildcards if you use them: `https://*.vercel.app/**`
- Any alternate `www.` hosts you deploy.

**Rule:** The URL passed as `redirectTo` in `signInWithOAuth` and paths used in `emailRedirectTo` must appear in this list (Supabase compares allowed redirect prefixes).

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

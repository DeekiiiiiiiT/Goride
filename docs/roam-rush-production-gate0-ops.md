# Roam Rush stack — Gate 0 ops (2026-08-15)

Ops checklist for soft-launch readiness across Rush / Partner / Courier.

## RLS verified (2026-08-15)

Re-checked live GoRide project (`csfllzzastacofsvcdsc`). These seven tables that previously flagged as RLS-on / zero-policies now have policies:

| Schema | Table | RLS | Policy count |
|--------|-------|-----|--------------|
| delivery | carts | on | 2 |
| delivery | courier_availability | on | 3 |
| delivery | order_disputes | on | 2 |
| delivery | order_events | on | 3 |
| payments | courier_payouts | on | 1 |
| payments | merchant_adjustments | on | 1 |
| payments | refunds | on | 1 |

## Seed / catalog — **updated 2026-08-15**

Live active merchants for Rush discovery:

| Merchant | City | Menu items | Active promos |
|----------|------|------------|---------------|
| Code Blue | Portmore | (existing) | — |
| Island Grill | Kingston | 3 | `ISLAND20` (20% off) |
| Mario's Pizzeria | Kingston | 3 | `PIZZA300` (J$300 off) |
| The Burger Spot | Kingston | 3 | `FREEDEL` (free delivery) |
| Green Life Bowls | Kingston | 3 | — |

Seed SQL: `supabase/migrations/20260815160000_dash_kingston_soft_launch_seed.sql`  
Seed owner emails (Auth): `seed-island-grill@roamrush.app`, `seed-marios@roamrush.app`, `seed-burger-spot@roamrush.app`, `seed-green-life@roamrush.app`.

## Required secrets checklist

Confirm in Supabase Edge Function secrets (and CI where applicable):

| Secret | Purpose |
|--------|---------|
| `WIPAY_REFUND_URL` | WiPay refund API endpoint |
| `WIPAY_API_KEY` | WiPay API auth |
| `WIPAY_CALLBACK_SECRET` | Payment / refund callback HMAC |
| `WIPAY_ENV` | `sandbox` vs live |
| `GOOGLE_MAPS_API_KEY` | Server geocode / maps (delivery function) |
| `VAPID` / VAPID key pair | Web Push for courier offer alerts (also set client `VITE_VAPID_PUBLIC_KEY`) |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase Cloud Messaging HTTP v1 (preferred; service account JSON) |
| `FCM_SERVER_KEY` | Legacy only — not available on new Firebase projects |

Also confirm per-app Vite public env for production builds (Supabase URL/anon key, Sentry DSN, etc.).

## Supabase Auth redirects (native) — **VERIFIED LIVE 2026-08-15**

Confirmed present in GoRide Auth `uri_allow_list`:

- `co.roamenterprise.rush://login`
- `co.roamenterprise.courier://login`
- `co.roamenterprise.partner://login`
- `https://roamrush.app/**`
- `https://*.roamrush.app/**` (covers `courier.roamrush.app` / `partner.roamrush.app`)

Also already present: driver/rides native schemes + Fleet/Enterprise web origins. Site URL remains `https://roamfleet.co` (platform default — OK; apps pass explicit `redirectTo`).

Dashboard: https://supabase.com/dashboard/project/csfllzzastacofsvcdsc/auth/url-configuration

## Firebase native config — **Android files placed 2026-08-15**

Firebase project: `roam-rush` (Spark). Android apps registered:
`co.roamenterprise.rush`, `co.roamenterprise.courier`, `co.roamenterprise.partner`.

Per app, place secrets **locally / CI only** (do not commit — gitignored):

| App | Android | iOS |
|-----|---------|-----|
| Rush | `apps/dash-customer/android/app/google-services.json` | `apps/dash-customer/ios/App/App/GoogleService-Info.plist` |
| Courier | `apps/dash-courier/android/app/google-services.json` | `apps/dash-courier/ios/App/App/GoogleService-Info.plist` |
| Partner | `apps/dash-merchant/android/app/google-services.json` | `apps/dash-merchant/ios/App/App/GoogleService-Info.plist` |

**Status:** Android `google-services.json` present locally for all three. iOS plists still pending (Mac / App Store step). **`FCM_SERVICE_ACCOUNT_JSON` set in Supabase** (Firebase project `roam-rush`, HTTP v1). Redeploy `merchant-push` + `notifications` after secret changes.

`GoogleService-Info.plist` is gitignored. See `docs/roam-rush-ios-setup.md` for APNs entitlements.

## Edge deploy list

`notifications` is included in root deploy scripts:

- `pnpm deploy:notifications`
- `pnpm deploy:functions:all` (includes notifications alongside delivery, payments, merchant-push, etc.)

## Rush Ops Console (2026-08-16)

Primary staff console: **https://ops.roamrush.app** (subtitle: Ops Console). `partner.roamrush.app/admin` is removed — use the ops host only.

Covers Merchants, Couriers (embedded), Customers, Orders, Live Ops, Markets/zones, Finance, Team invites, Support cases, Activity audit.

- Markets (enterprise coverage): **Parish foundation** + **Town foundation** (`include`) + **non-delivery zones** (`exclude`) → **Publish** town coverage snapshot (`service_coverage_versions`). Parish outlines live on `service_parishes.foundation_polygon` / `parish_outline_templates` (ops geography; customer delivery still uses town published zones only). Day-to-day ops add town cutouts (“Don’t deliver near here” / draw). Editing town or parish foundation is confirm-gated and promotes the matching outline template. Ops map is Google Maps (streets/satellite). Soft-activate uses readiness checks (`GET /admin/markets/:id/readiness`); `force: true` for dash_admin/platform_owner. Customer apps read **published** town zones from `GET /geo/delivery-zones` (cache key `roam-dash-delivery-zones-v3`).
- Soft-launch seeds: all 14 Jamaica parishes; Kingston town under Kingston parish; Spanish Town under St. Catherine.
- Rush app loads zones from `GET /geo/delivery-zones` (cache TTL ~10m, key `roam-dash-delivery-zones-v3`; fallback Kingston polygon if offline).
- Markets playbook: Open parish map → set parish border → Open town map → set town border → add non-delivery zones → Publish → readiness green → Activate.
- Team invite: `POST /admin/team/invite` (dash_admin / dash_ops / courier_admin / courier_ops).
- Courier-only roles see a reduced nav (Couriers + Live Ops + Orders + Support).


- iOS Mac scaffold: `docs/roam-rush-ios-setup.md`
- Store submission: `docs/roam-rush-store-submission-checklist.md`
- Stack audit: `docs/roam-rush-stack-production-readiness-audit-2026-08-15.md`

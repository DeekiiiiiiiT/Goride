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

## Seed / catalog

Live counts as of 2026-08-15:

- **Merchants:** 4 total in `delivery.merchants`, of which **1 active** (`is_active`) / 1 verified — need more live partners before public launch.
- **Promotions:** 0 rows in `delivery.merchant_promotions` — Deals tab will show empty state until partners publish promos.

Action: seed additional Kingston merchants + at least a few live promotions before launch marketing.

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
| `FCM_SERVER_KEY` | Legacy FCM server key if still used by push path |

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

## Firebase native config

Per app, place secrets **locally / CI only** (do not commit):

| App | Android | iOS |
|-----|---------|-----|
| Rush | `apps/dash-customer/android/app/google-services.json` | `apps/dash-customer/ios/App/App/GoogleService-Info.plist` |
| Courier | `apps/dash-courier/android/app/google-services.json` | `apps/dash-courier/ios/App/App/GoogleService-Info.plist` |
| Partner | `apps/dash-merchant/android/app/google-services.json` | `apps/dash-merchant/ios/App/App/GoogleService-Info.plist` |

`GoogleService-Info.plist` is gitignored. See `docs/roam-rush-ios-setup.md` for APNs entitlements.

## Edge deploy list

`notifications` is included in root deploy scripts:

- `pnpm deploy:notifications`
- `pnpm deploy:functions:all` (includes notifications alongside delivery, payments, merchant-push, etc.)

## Related docs

- iOS Mac scaffold: `docs/roam-rush-ios-setup.md`
- Store submission: `docs/roam-rush-store-submission-checklist.md`
- Stack audit: `docs/roam-rush-stack-production-readiness-audit-2026-08-15.md`

# Edge function authz matrix

Quick scan of the 18 Supabase Edge Functions under `supabase/functions/*/index.ts` (and registered route modules). Columns are **capability present**, not “every route requires X”.

| Function | Public | Internal-secret | User-JWT | Admin | Notes |
|---|---|---|---|---|---|
| **rides** | Yes | Yes | Yes | Yes | `/health`; open vehicle-types / Places (rate-limited); cron `X-Rides-Cron-Secret` on `/v1/internal/*`; most `/v1/*` via user JWT; `/admin/*` via product admin |
| **matching** | Yes | Yes | Yes | Yes | `/health`; `X-Matching-Internal-Secret` / cron secret on internal routes; `/v1/policy` JWT; `/admin/*` via `requirePlatformAdmin` |
| **payments** | Yes | Yes | Yes | Yes | `/health`; WiPay `WIPAY_CALLBACK_SECRET`; customer intents/capture JWT; refunds/payouts `requireProductAdmin(dash)` |
| **delivery** | Yes | No | Yes | Yes | `/health`; public merchant list/detail; merchant/customer/courier JWT; `/admin/*` product admin |
| **merchant-push** | No | Yes | No | No | Internal/cron secret (or service-role bearer) only |
| **evidence-cleanup** | No | Yes | No | No | Fleet/rides cron secrets |
| **toll-brain** | Yes | Yes | No | Yes | `/health` (Cache-Control); `X-Toll-Brain-Internal-Secret` on `/v1/internal/*`; `/admin/policies` platform admin |
| **identity** | Yes | No | Yes | No | `/health`; `/permissions*` JWT |
| **driver** | Yes | No | No | Yes | `/health`; `/admin/*` `requireProductAdmin(driver)` |
| **haul** | Yes | No | No | Yes | `/health`; `/admin/*` `requireProductAdmin(haul)` |
| **custom-access-token** | No | Yes | No | No | Auth hook — Standard Webhooks secret |
| **before-user-created** | No | Yes | No | No | Auth hook — Standard Webhooks secret |
| **petrojam-prices** | Yes | No | No | Yes | `/health`; `/admin/*` platform admin |
| **make-server-37f42386** | Yes | Yes | Yes | Yes | Fleet shim: public health/logins/signup; JWT bulk; cron secrets; platform/product admin |
| **send-sms** | No | Yes | No | No | Auth Send SMS hook — `SEND_SMS_HOOK_SECRET` |
| **fuel-brain** | Yes | Yes | No | Yes | `/health` (Cache-Control); `X-Fuel-Brain-Internal-Secret`; `/admin/*` platform admin |
| **platform-catalog** | Yes | No | No | No | `/health` only today (Cache-Control); catalog routes still TODO |
| **fleet-ops** | Yes | No | No | No | `/health` only today; routes still TODO |

**Legend**

- **Public** — unauthenticated route exists (often `/health`; may still be rate-limited).
- **Internal-secret** — shared secret header, cron secret, webhook verify, or `requireInternalSecret`.
- **User-JWT** — `Authorization: Bearer` + `auth.getUser()` for app users.
- **Admin** — `requirePlatformAdmin`, `requireProductAdmin`, or fleet platform-staff / product-admin guards.

## SPA session gating (admin + fleet)

Admin and Fleet are **Vite SPAs** on Vercel (`framework: null` in `vercel.json`), not Next.js.

| Layer | Location | Behavior |
|---|---|---|
| Edge soft gate | `apps/admin/middleware.js`, `apps/fleet/middleware.js` | Vercel Routing Middleware; matcher protects `/dashboard`, `/admin/*` (admin), `/app`; allows `/`, `/login`, `/auth`, `/signup`, assets. Checks `sb-*-auth-token` cookie. |
| Client path helper | `apps/*/src/middleware/sessionGate.ts` | Shared public/protected path rules used by `App.tsx`. |
| Authoritative gate | `AuthProvider` / login UI | Supabase session is primarily **localStorage** today — cookie Edge check is soft UX only until cookie storage is enabled. |

Do **not** treat vercel.json rewrites alone as auth. Deploy each app with its root `middleware.js` so Vercel picks it up next to that app’s `package.json`.

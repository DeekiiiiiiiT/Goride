# Uber Fleet API Integration — Audit

**Date:** 2026-08-04
**Scope:** Audit only — no code was changed. Answers two questions: (1) what does the real Uber Fleet/Vehicles API require, and (2) what does RoamFleet currently have in place toward that integration.

---

## 1. What the Uber Fleet (Vehicles) API actually is

Docs: https://developer.uber.com/docs/vehicles/getting-started

This is **Uber's fleet/rental partner product** — a completely different API surface from Uber's consumer Rides API. It's meant for companies (like RoamFleet) that supply vehicles/drivers to Uber.

- **Purpose:** manage driver and vehicle operations for fleet/rental partners — driver onboarding & risk checks, vehicle CRUD (create/update/delete/transfer/assign), document upload & compliance verification, real-time driver location/performance, and payment/transaction data.
- **Endpoint categories:** Driver Management, Vehicle Management, Vehicle Onboarding, Organization Management, Supplier Performance Data, Offline Reporting.
- **Auth:** OAuth2 with role-specific scopes, using a `clientID` + `client secret` registered in the Uber Developer Portal. Requires a registered **redirect URI** and a **privacy policy URL**.
- **Webhooks:** Uber pushes events (e.g. onboarding status changes) to a webhook URL you register. Requests must be verified via the `X-Uber-Signature` header (HMAC-SHA256).
- **Environments:** both sandbox and production apps are supported; webhook payloads indicate which environment they came from.

This is **not** the same product as Uber's old consumer "Rides API" (`api.uber.com/v1.2/...`), and it is **not** the same as importing Uber driver-earnings statements (CSV/XLSX). Both of those already exist in this codebase (see below) and are frequently named "Uber" too, which is the main source of confusion.

---

## 2. What currently exists in RoamFleet, by system

### A. "Uber Fleet" toggle in Settings → Integrations — non-functional stub
[apps/fleet/src/components/settings/SettingsPage.tsx:317](apps/fleet/src/components/settings/SettingsPage.tsx#L317)

- Renders a single integration card literally labeled **"Uber Fleet"**, hardcoded `status: 'disconnected'`.
- **"Connect" button does not do OAuth at all.** [SettingsPage.tsx:349-382](apps/fleet/src/components/settings/SettingsPage.tsx#L349-L382) — it opens a dialog asking for a raw Client ID / Client Secret, then just `POST`s them to `/settings/integrations` and flips local state to `status: 'connected'`. No redirect to `login.uber.com`, no token exchange, no scopes requested.
- **"Sync Now" button does not call the backend sync route.** [SettingsPage.tsx:443](apps/fleet/src/components/settings/SettingsPage.tsx#L443) — it only fires `toast.info('Syncing...')`. It is disconnected from the `/uber/sync` endpoint that exists on the backend (see below).
- The code even has a self-aware comment admitting the security shortcut: *"In a real production app, never store secrets in client-side readable KV"* — yet that's exactly what it does.
- Client secret round-trips through the browser and is persisted in a generic KV store (`integration:uber`), not a secrets manager.

**Net effect:** this UI gives the appearance of an Uber connection toggle, but flipping it does not talk to Uber in any way.

### B. Real OAuth + sync routes exist on the backend — but target the wrong (deprecated) API
[supabase/functions/_fleet-server/index.tsx:9961-10217](supabase/functions/_fleet-server/index.tsx#L9961-L10217)

There actually is a working-shaped OAuth implementation server-side:
- `GET /uber/auth-url` — builds `https://login.uber.com/oauth/v2/authorize?...` ([line 9985](supabase/functions/_fleet-server/index.tsx#L9985))
- `POST /uber/exchange` and `GET /uber/callback` — exchange the auth code for tokens at `https://login.uber.com/oauth/v2/token`, storing `access_token`/`refresh_token` in KV under `integration:uber_token` ([lines 9994-10127](supabase/functions/_fleet-server/index.tsx#L9994-L10127))
- `POST /uber/sync` — refreshes the token if expired, then calls **`https://api.uber.com/v1.2/history?limit=50`** ([line 10181](supabase/functions/_fleet-server/index.tsx#L10181))

**Problem:** `v1.2/history` with the `profile`/`history` scope is Uber's old **consumer Rides API** (a rider's personal trip history), not the Fleet/Vehicles API. It:
- Is unrelated to fleet/vehicle/driver management — it returns a *rider's* trip history, not supplier vehicle or driver data.
- Was deprecated by Uber years ago for most third-party apps; this endpoint is very likely to fail live even with valid credentials.
- Even where it works, the mapped fields are placeholders — `amount: 0, netPayout: 0, driverId: 'Self'` ([lines 10191-10202](supabase/functions/_fleet-server/index.tsx#L10191-L10202)) — so it was never wired to produce usable financial data.
- None of this is reachable from the frontend today (Settings' Connect/Sync buttons don't call it — see A).

So: real OAuth plumbing exists, but it's built against the wrong Uber product and isn't wired to any UI.

### C. API Command Center — cost/usage tracking scaffold, not a live integration
[apps/fleet/src/components/admin/api-center/providers.ts:9](apps/fleet/src/components/admin/api-center/providers.ts#L9), [supabase/functions/_fleet-server/api_command_center.tsx](supabase/functions/_fleet-server/api_command_center.tsx)

- `uber` is registered as a 5th provider alongside `openai`/`gemini`/`google_maps`/`supabase`, described as *"OAuth integration for driver/trip imports."*
- It expects an env var `UBER_CLIENT_SECRET` ([api_command_center.tsx:247](supabase/functions/_fleet-server/api_command_center.tsx#L247)) for key-rotation/masking display, and supports budgets/kill-switch toggles for it.
- Its own live-validation function explicitly **skips** Uber: *"supabase & uber — skip live ping (requires additional context)"* ([api_command_center.tsx:294](supabase/functions/_fleet-server/api_command_center.tsx#L294)).
- No `UBER_CLIENT_ID` / `UBER_CLIENT_SECRET` env vars are actually set anywhere in the repo (`.env.example`/`.env.local` for `fleet`, `admin`, or `supabase` — none contain any `UBER_*` key).

This panel is admin tooling for *budgeting and auditing* API usage, not the integration itself — it just has a slot reserved for a provider called "uber" that has nothing behind it yet.

### D. The bulk of "uber" code in this repo is unrelated: CSV statement reconciliation
Most of the ~250 files matching "uber" (`uberSsot.ts`, `resolveUberPeriodCash.ts`, `exportUberPaymentLinesCsv.ts`, `uberTripFareAdjustOrder.ts`, `computeUberImportReconciliation`, the Uber-only filter in the Imports page, etc.) are part of a **manual CSV/XLSX import & reconciliation pipeline** for Uber driver payout statements — parsing columns like `Total Earnings`, `Total Earnings : Tip`, `Payouts : Cash Collected` from files a fleet admin uploads by hand.

This is a legitimate, working feature — but it's statement parsing, not an API integration. It won't be affected by, and doesn't help with, a Fleet API connection. Worth knowing so it isn't confused with "the Uber integration" during this work.

There is also one leftover env reference, `VITE_UBER_OAUTH_REDIRECT_URI`, read at [apps/fleet/src/components/imports/ImportsPage.tsx:1374](apps/fleet/src/components/imports/ImportsPage.tsx#L1374), which isn't defined in any `.env` file and isn't connected to the Settings page OAuth flow described in (A).

---

## 3. Bottom line

RoamFleet is **not currently set up** to integrate with the real Uber Fleet/Vehicles API:

| Piece needed for the real Fleet API | Current state |
|---|---|
| Uber Developer Portal app registered for the **Vehicles/Fleet** product | Unknown/not visible in repo — needs to be confirmed out-of-band |
| `UBER_CLIENT_ID` / `UBER_CLIENT_SECRET` as real secrets (server-side env, not client-submitted) | Not set in any `.env*`; current flow instead takes them from a browser form and stores them in KV |
| OAuth authorize/token flow against **Vehicles API scopes** | Existing flow ([index.tsx:9961](supabase/functions/_fleet-server/index.tsx#L9961)) targets `login.uber.com` correctly for OAuth2, but requests only `profile` scope and exchanges tokens for the deprecated `v1.2/history` Rides endpoint, not any Fleet/Vehicles endpoint |
| Webhook receiver + `X-Uber-Signature` HMAC verification | Does not exist anywhere in the codebase |
| Frontend "Connect" wired to the real `/uber/auth-url` → Uber consent screen → `/uber/exchange` flow | Not wired — Settings' Connect button bypasses OAuth entirely and just saves raw credentials |
| Frontend "Sync" wired to a Fleet-API-backed sync route | Not wired — button is a no-op toast; and the backend sync route it would need to call talks to the wrong API anyway |

### To actually integrate the Fleet/Vehicles API, at minimum:
1. Register/confirm a Fleet-API-scoped app in the Uber Developer Portal (redirect URI + privacy policy URL + fleet-specific scopes, not `profile`).
2. Store `UBER_CLIENT_ID`/`UBER_CLIENT_SECRET` as real server-side secrets (Supabase function env), never round-tripped through the browser.
3. Replace the `v1.2/history` call in `/uber/sync` ([index.tsx:10181](supabase/functions/_fleet-server/index.tsx#L10181)) with calls to the actual Vehicles/Driver Management endpoints under the Fleet API.
4. Add a webhook receiver route with `X-Uber-Signature` HMAC-SHA256 verification for onboarding/status events.
5. Rewire the Settings "Connect"/"Sync" buttons to actually call `/uber/auth-url` (redirect to Uber) and the corrected `/uber/sync`, instead of the current fake local-state toggle.

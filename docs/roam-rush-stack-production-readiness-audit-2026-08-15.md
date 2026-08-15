# Roam Rush Stack — Production Readiness Audit
**Scope:** `apps/dash-customer` (Roam Rush), `apps/dash-courier` (Roam Courier), `apps/dash-merchant` (Roam Partner)
**Date:** 2026-08-15
**Method:** Read-only re-verification of current source against the existing baseline docs (`docs/dash-customer-production-readiness-audit.md`, `docs/dash-courier-production-readiness-audit.md`, `docs/dash-merchant-production-readiness-audit.md`, `docs/dash-cross-app-integration-audit.md` — all written 2026-07-28/29 or 2026-08-05). No code was changed as part of this audit.

## TL;DR

The three apps are **much closer to production than the last written audits suggest** — a real amount of the previously-flagged work has already landed: real Google Places address autocomplete (in most places), real Supabase-backed order/menu/dispatch data with a production-gated mock fallback, real phone OTP, real payment capture + commission split, real refunds, real courier GPS/POD upload, and a correctly-built native OAuth flow for the merchant app. This is not a prototype anymore.

But it is **not yet ready for real customers today**. There are three genuine **critical blockers**, plus a cluster of high-severity gaps, spread across the three apps. The good news: most of them are narrow, well-isolated fixes, not architectural rewrites.

| App | Critical Blockers | High | Medium | Low |
|---|---|---|---|---|
| Roam Rush (dash-customer) | 3 | 4 | 5 | 2 |
| Roam Courier (dash-courier) | 0 | 5 | 5 | 2 |
| Roam Partner (dash-merchant) | 2 | 5 | 4 | 3 |

---

## 1. The screenshot, explained

Your screenshot is **[DeliveryAddressPage.tsx](apps/dash-customer/src/pages/onboarding/DeliveryAddressPage.tsx)** — the address screen in the **onboarding flow**, wired live into `App.tsx:466`. It is a completely separate, fully hardcoded component from the `AddAddressPage.tsx`/`AddressAutocomplete.tsx` screen used later in Account settings (which the deeper audit below confirms *does* now call real Google Places via `packages/location`).

In `DeliveryAddressPage.tsx` today:
- `SAVED_ADDRESSES` is a hardcoded array — one entry is literally `"789 Valencia St, San Francisco, CA"` in an app that only serves Kingston.
- The search `<input>` (`DeliveryAddressPage.tsx:117-129`) takes whatever you type and sets it directly as the selected address on every keystroke — no geocoding call, no suggestion list, no validation that the address exists.
- "Use current location" (`DeliveryAddressPage.tsx:97-105`) doesn't call the device GPS at all — it hardcodes `"45 Constant Spring Rd, Kingston"` regardless of where the phone actually is.
- The map is a static image (`/images/address-map.png`), not a live map.

**Fix:** replace this screen's guts with the same `AddressAutocomplete` component (and real `navigator.geolocation`/Capacitor Geolocation call) already proven out in `AddAddressPage.tsx`. This is the single highest-visibility fix in the whole audit — it's the very first screen a new customer sees.

---

## 2. Roam Rush — `apps/dash-customer`

### Confirmed FIXED since the last baseline doc (don't re-litigate these)
Real Google Places autocomplete in `AddAddressPage.tsx` (via `@roam/location`, server-key-backed) · production-gated mock fallback (`mocksGate.ts`, `allowMocks()` is `false` in prod builds) applied across restaurants/grocery/search/orders/deals · real phone OTP (`supabase.auth.signInWithOtp/verifyOtp`) · age-verification risk resolved by disabling the feature rather than shipping a fake gate · `'assigned'` order status now handled correctly in tracking · live Google Maps courier marker (`CourierTrackingMap.tsx`) replacing the old frozen schematic · real review submission · real refund capture (PayPal + WiPay, fails closed if unconfigured) · real commission/delivery-fee split at payment capture (`dashMoneySplit.ts`) · real merchant-configured delivery fee (no longer hardcoded to 0) · two-way address sync to backend.

### CRITICAL BLOCKER

1. **Onboarding address screen is fully mocked** — see §1 above. `apps/dash-customer/src/pages/onboarding/DeliveryAddressPage.tsx`. Every new customer hits this before their first order.
2. **Leftover AI-agent debugging network calls shipped in production auth code.** Every OAuth/deep-link event fires an unguarded `fetch('http://127.0.0.1:7418/ingest/...')` with session/URL/token-presence data, no `DEV` or environment guard.
   - `apps/dash-customer/src/capacitor-native.ts:8,13`
   - `apps/dash-customer/src/pages/LoginPage.tsx:85,108,115`
   - `apps/dash-customer/src/lib/dashCustomerAuth.ts:39`
   - It fails silently in prod (no such host resolves), but it's literally an agent-debugging harness (`#region agent log`, `X-Debug-Session-Id`, `runId:'pre-fix'`) — an App Store/security reviewer or pen-tester will flag it immediately. **Strip before any submission.**
3. **No iOS project exists at all** — only `android/` is present; no `ios/` directory, no `Info.plist`, no iOS signing setup. If iOS launch is in scope for day one, there is currently zero iOS build target.
   - Also: `AndroidManifest.xml` only declares the `INTERNET` permission — no `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`, and `@capacitor/geolocation` isn't installed. "Use current location" and live GPS map features will likely never successfully prompt on the native Android build as currently configured.

### HIGH

| # | Finding | File(s) |
|---|---|---|
| 4 | **Card save flow is a dead end.** `AddCardPage.tsx` now honestly requires a pre-existing WiPay `providerToken` (good — no more fake success states), but there is no WiPay JS SDK / hosted-fields widget anywhere in the app to actually produce that token from a real card number. Checkout itself still works via WiPay/PayPal hosted checkout, so this only blocks the "save a card" feature specifically. | `apps/dash-customer/src/pages/AddCardPage.tsx` |
| 5 | **Customer push notifications are cosmetic.** `NotificationSettingsPage.tsx` shows toggles for "Order updates," "Promotions," "SMS updates," but only calls the browser `Notification.permission` API — no service worker subscription is ever registered, and the backend `notifications` edge function explicitly rejects any audience other than `'courier'`. SMS (`dashOrderSms`) is the only real notification channel today. | `apps/dash-customer/src/lib/notificationPermission.ts`, `src/pages/NotificationSettingsPage.tsx`, `supabase/functions/notifications/index.ts:84-87` |
| 6 | **Favorites are localStorage-only** — no backend table or sync call. Lost on logout/reinstall/new device. | `apps/dash-customer/src/lib/favoritesStorage.ts` |
| 7 | **Profile edits are localStorage-only** (unlike addresses, which now genuinely sync). | `apps/dash-customer/src/lib/accountContent.ts` |

### MEDIUM

- Promotions/Deals UI degrades gracefully to an empty state in production but the real `delivery.merchant_promotions` → customer pipeline still appears unbuilt (`dealsContent.ts`, `DealsPage.tsx`).
- Delivery-zone check is a lat/lng bounding box + keyword list, not a true polygon geofence — fine for single-city Kingston soft launch, revisit before multi-city.
- 7 backend tables flagged in the earlier baseline as RLS-enabled-with-zero-policies (`carts`, `courier_availability`, `order_disputes`, `order_events`, `courier_payouts`, `merchant_adjustments`, `refunds`) were **not re-verified this pass** — needs a direct Supabase advisor/migration check before treating as resolved.
- WiPay refund path fails closed correctly if secrets are missing (`payments/index.ts:715-724`) — but whether `WIPAY_REFUND_URL`/`WIPAY_API_KEY` are actually set in the live project wasn't verifiable statically. Ops task: confirm.
- `.env.example` declares `VITE_GOOGLE_MAPS_API_KEY`, but it's never referenced in source — the real key is server-side (`GOOGLE_MAPS_API_KEY_MERCHANT`/`GOOGLE_MAPS_API_KEY` Supabase secrets read by the `delivery` function). Dead/misleading env var; confirm the real server secret is actually set in prod.

### LOW / POLISH
- Near-zero automated test coverage — one test file in the entire app (`checkoutAddress.test.ts`), no e2e tests, no CI workflow references `dash-customer` at all.
- `restaurantContent.ts` still has a single hardcoded `ISLAND_GRILL` fallback fixture, but it's now dev-only (reached only if the real `GET /merchants/:id` call fails in a `mocksGate`-enabled build). Remaining risk is whether the DB actually has multiple fully-seeded restaurants, not code.

---

## 3. Roam Courier — `apps/dash-courier`

### Confirmed FIXED since the last baseline doc
`RealDispatchProvider.ts` is now the default dispatch provider (mock only via `VITE_COURIER_USE_MOCK_DISPATCH=true`), backed by real offer polling + a live Supabase Realtime subscription · real GPS broadcast to the backend on every location update · proof-of-delivery/pickup/issue-report photos now really upload to Supabase Storage (`courier-documents` bucket) instead of being discarded · vehicle onboarding/edit now persists for real (the old "data loss" bug is gone) · ratings/stats page wired to real data · delivery-fee calc at order creation uses a real per-merchant `delivery_fee`/`commission_rate` (courier earnings are no longer tip-only) · dead mock files removed.

### CRITICAL BLOCKER
None — the core loop (go online → real offer → accept → navigate via external maps app → real proof-of-delivery photo → real GPS broadcast → real earnings) is functionally wired end to end today.

### HIGH

| # | Finding | File(s) |
|---|---|---|
| 1 | **Almost no automated test coverage.** One test file in the whole app (`navigationUrls.test.ts`) — nothing covers `RealDispatchProvider` (offer polling/accept/decline/remote-cancel), `courierApi.ts`, file upload, or earnings logic. `apps/driver` has 5 test files covering the equivalent surface. | `apps/dash-courier/src/**` |
| 2 | **No embedded live map for navigation** — `EnRoutePage.tsx`/`AtStorePage.tsx`/stacked-nav pages render a hardcoded static Google-hosted image with a hand-drawn SVG path, not a real map. `leaflet` is installed but used only in the admin's presence map, never courier-facing. `apps/driver`'s equivalent screens all render a real `LeafletMap`. | `apps/dash-courier/src/pages/delivery/EnRoutePage.tsx`, `AtStorePage.tsx` vs `apps/driver/src/components/maps/LeafletMap.tsx` |
| 3 | **ETA/distance fields never recompute from live GPS** — `mapOrderToActiveDelivery.ts` hardcodes `etaMinutes: 10`, `dropoffEtaMinutes: 15`, `distanceKm: 0`. Navigation itself is just an external deep-link to Google Maps/Waze (a reasonable pattern), but the in-app numbers shown alongside it are static/fake. | `apps/dash-courier/src/lib/mapOrderToActiveDelivery.ts:74-77` |
| 4 | **`VehicleDetailsPage.tsx` still reads mock data** (`MOCK_COURIER_VEHICLE`) even though the sibling `EditVehiclePage.tsx` already loads/saves the real vehicle record — a courier who edits their vehicle sees stale mock data reflected back. | `apps/dash-courier/src/pages/profile/VehicleDetailsPage.tsx:4,19` |
| 5 | **`VITE_VAPID_PUBLIC_KEY` missing from `.env.example`/deployment config** even though real push-offer infrastructure now exists (VAPID subscribe flow, service worker, real `webpush.sendNotification` backend call) — a deploy that only follows the example env file will silently get no push subscriptions for new-offer alerts. | `apps/dash-courier/.env.example`, `src/services/courierDispatch/RealDispatchProvider.ts:136` |

### MEDIUM
- `AccountPage.tsx` seeds from `MOCK_COURIER_PROFILE` and only overwrites specific fields once real data loads — any field not explicitly listed stays mock forever. `UnassignConfirmModal.tsx` shows a hardcoded mock completion rate to a courier deciding whether to abandon a delivery.
- Stacked/multi-order offers are still fully mock-driven (`mockOffers.ts`) — no backend concept of an order "stack," only a `wave` field on individual offers.
- `EnRoutePage.tsx`'s Call/Message buttons and the "Open in Maps" icon, and `AtStorePage.tsx`'s "Call Store" button, have **no `onClick` handlers at all** — they look interactive but do nothing when tapped.
- The `'assigned'`-status cross-app gap (courier accepts, but customer tracking and merchant queue can regress/drop the order) is courier-adjacent — flagged for a targeted re-check since it directly affects whether a courier's own actions are visible to the other two apps.

### LOW / POLISH
- `mockEarnings.ts`/`mockPayoutHistory.ts` are still imported by real earnings pages, but only for formatting helpers now — the "mock" naming next to real data flows is confusing and worth a rename to avoid a future regression where someone re-imports the fixture data instead of the formatter.

### Already solid (verified, no action needed)
Real Supabase auth throughout · native Capacitor config matches `apps/driver`'s permission/asset maturity, explicitly reuses its patterns · `vercel.json` fully configured and deployable · env vars otherwise correct.

---

## 4. Roam Partner — `apps/dash-merchant`

**Note:** this app has uncommitted local changes right now (new Capacitor native wrapper + reworked auth) — this audit re-verified those specifically against the current working tree, not just the last commit.

### CRITICAL BLOCKER

1. **Native push notifications for new orders don't exist.** No `@capacitor/push-notifications`, no Firebase/FCM SDK, no `google-services.json`. The only push path is browser Push API + service worker, which is unreliable for a backgrounded/killed Capacitor WebView app. A merchant relying on the Android app is very likely to **miss new-order alerts when the app isn't in the foreground** — undermining the strongest part of the merchant order-flow design.
   - `apps/dash-merchant/package.json` (no push plugin), `src/hooks/useWebPush.ts` (no native fallback), `android/app/build.gradle` (Google Services plugin no-ops without `google-services.json`)
2. **App icon and splash screen are the stock Capacitor placeholder**, not Roam Partner branding — confirmed byte-identical (md5) to `dash-courier`'s copies. This alone fails Play Store review readiness.
   - `apps/dash-merchant/android/app/src/main/res/mipmap-*/ic_launcher*.png`, `drawable*/splash.png`

### HIGH

| # | Finding | File(s) |
|---|---|---|
| 3 | **Native Google sign-in can get permanently stuck.** `oauthLoading` is set `true` before the OAuth call and only reset in the `catch` block — no `finally`. If the user cancels/backs out of the external browser without finishing sign-in, the Google button stays disabled and spinning until the app is restarted. | `apps/dash-merchant/src/pages/LoginPage.tsx:76-110` |
| 4 | **Failed native auth-callback exchange fails silently.** If the deep-link code/token exchange fails (expired code, network error), the handler just returns — no toast, no state change, no browser close. The merchant is stuck with no indication anything went wrong. | `apps/dash-merchant/src/capacitor-native.ts:5-15` |
| 5 | **`android/.gitignore` is missing the `keystore.properties` exclusion** that the sibling `dash-courier` app already has. If a developer follows the existing signing pattern in `build.gradle` and creates that file locally, it's one `git add -A` away from leaking a signing secret. | `apps/dash-merchant/android/.gitignore` vs `apps/dash-courier/android/.gitignore:56` |
| 6 | **No CI/CD pipeline for the Android build at all.** Release is fully manual/local (`pnpm cap:release` → `cap:aab` → a script that searches the developer's machine for Android Studio) — no reproducible automated build, every AAB is a one-off from someone's laptop. | `apps/dash-merchant/scripts/build-android-aab.mjs`, `package.json` |
| 7 | **New native redirect URL isn't documented for Supabase Auth setup.** `.env.example` documents the localhost web redirect but says nothing about the new `co.roamenterprise.partner://login` native scheme — without adding it to the Supabase project's allowed redirect list, OAuth will be rejected in production even though the client code is correct. Easy-to-miss manual dashboard step with zero trace in the repo. | `apps/dash-merchant/.env.example`, `src/lib/partnerAuth.ts:6` |

### MEDIUM
- Zero automated tests for any of the new auth/native code (`partnerAuth.ts`, `partnerAuthCallback.ts`, `capacitor-native.ts`) — the URL-parsing and code/token branching logic is cheap to test and easy to silently break.
- `android:autoVerify="false"` on the custom-scheme intent filter — low risk today, but silently permissive rather than an explicit decision.
- No release keystore / `google-services.json` / Play Console wiring exists yet — expected pre-launch state, but flagged since `cap:aab`'s current output is unusable for a real Play Store upload until these are provisioned.
- Items 3–12 from the July 29 baseline (order management, menu CRUD, payouts, RLS gaps, etc.) were **not re-touched by the current changeset** and were not re-verified in this pass — treat those baseline findings as still open until directly re-checked.

### LOW / POLISH
- New Sentry dev-noise filter and the async native-init gate on app boot are both correctly scoped and low-risk — noted only for completeness.
- No camera/storage permissions declared beyond `INTERNET` — this is actually *correct* given the current design (system file/camera picker, not a native Camera plugin); not a gap.

### Already solid (verified, real engineering — not a stub)
The full native OAuth loop (WebView → external browser via `@capacitor/browser` → Google → deep link → manifest intent filter → `appUrlOpen` → `exchangeCodeForSession` → existing `onAuthStateChange` listener → routes to dashboard) is architecturally correct end-to-end and matches the standard recommended Capacitor+Supabase pattern. `compileSdk`/`targetSdk` 35 is current Play Store policy. The rest of the Android scaffolding is standard, correctly-generated Capacitor output structurally identical to the already-shipping `dash-courier`/`driver` apps.

---

## 5. Prioritized roadmap to launch

### Phase 1 — Must fix before any real customer/merchant/courier touches this
1. **Roam Rush:** Rebuild `DeliveryAddressPage.tsx` (onboarding) to use the real `AddressAutocomplete` component + real geolocation — this is the screen every new customer sees first, and it's the exact bug you screenshotted.
2. **Roam Rush:** Strip the leftover debug-harness `fetch` calls in `capacitor-native.ts`, `LoginPage.tsx`, `dashCustomerAuth.ts`.
3. **Roam Partner:** Add real native push notifications (`@capacitor/push-notifications` + Firebase/FCM) — without this, restaurant partners will miss orders.
4. **Roam Partner:** Replace the placeholder app icon/splash with real Roam Partner branding.
5. **Roam Rush:** Decide on iOS launch scope — if day one needs iOS, the `ios/` project doesn't exist yet and needs to be created from scratch.
6. Fix the two silent-failure auth bugs in Roam Partner (stuck spinner on cancelled sign-in; silent failure on failed callback exchange) and add the missing native redirect URL to Supabase Auth's allowlist.
7. Add `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` + a geolocation plugin to Roam Rush's Android manifest so "use current location" actually works natively.

### Phase 2 — Needed for a solid, trustworthy soft launch
- Wire a real card-tokenization widget for Roam Rush's "Add Card," or hide that entry point until it exists (checkout itself already works via hosted WiPay/PayPal).
- Build real customer push notifications (order-status alerts) for Roam Rush, or relabel the settings toggles so they don't overpromise.
- Sync favorites and profile edits to the backend instead of `localStorage` in Roam Rush.
- Add an embedded live map to Roam Courier's en-route/at-store screens (Leaflet is already a dependency — just needs wiring, same pattern as `apps/driver`).
- Wire the dead Call/Message/Open-in-Maps buttons in Roam Courier.
- Fix `VehicleDetailsPage.tsx` to read real data; add the missing `VITE_VAPID_PUBLIC_KEY` env var.
- Add CI/CD for the Roam Partner Android build; fix the missing `keystore.properties` gitignore entry; provision a real release keystore.
- Re-verify the 7 RLS-enabled-zero-policy tables flagged in the earlier baseline audit, and confirm WiPay refund secrets are actually set in the live Supabase project.

### Phase 3 — Hardening before scaling up
- Real automated test coverage across all three apps (currently 1 test file each in Roam Rush and Roam Courier; none in Roam Partner's new auth code) — at minimum, cover checkout/payment math, dispatch accept/decline, and the native auth callback parsing.
- Replace Roam Rush's bounding-box delivery-zone check with true polygon geofencing before expanding beyond Kingston.
- Build real backend-driven promotions/deals.
- Resolve the stacked/multi-order courier offer flow's remaining mock dependency.

---

## Files referenced

**Roam Rush:** `src/pages/onboarding/DeliveryAddressPage.tsx`, `src/pages/AddAddressPage.tsx`, `src/components/ui/AddressAutocomplete.tsx`, `src/capacitor-native.ts`, `src/pages/LoginPage.tsx`, `src/lib/dashCustomerAuth.ts`, `src/pages/AddCardPage.tsx`, `src/lib/notificationPermission.ts`, `src/pages/NotificationSettingsPage.tsx`, `src/lib/favoritesStorage.ts`, `src/lib/accountContent.ts`, `src/lib/dealsContent.ts`, `src/lib/deliveryZones.ts`, `.env.example`, `android/app/src/main/AndroidManifest.xml`.

**Roam Courier:** `src/services/courierDispatch/RealDispatchProvider.ts`, `src/lib/courierApi.ts`, `src/lib/courierFileUpload.ts`, `src/lib/navigationUrls.ts`, `src/lib/mapOrderToActiveDelivery.ts`, `src/pages/delivery/{EnRoutePage,AtStorePage}.tsx`, `src/pages/profile/{EditVehiclePage,VehicleDetailsPage,AccountPage}.tsx`, `capacitor.config.ts`, `.env.example`, `vercel.json`.

**Roam Partner:** `src/lib/partnerAuth.ts`, `src/lib/partnerAuthCallback.ts`, `src/pages/LoginPage.tsx`, `src/capacitor-native.ts`, `src/hooks/useWebPush.ts`, `android/app/build.gradle`, `android/.gitignore`, `android/app/src/main/res/mipmap-*`, `scripts/build-android-aab.mjs`, `.env.example`.

**Cross-app baselines consulted:** `docs/dash-customer-production-readiness-audit.md`, `docs/dash-courier-production-readiness-audit.md`, `docs/dash-merchant-production-readiness-audit.md`, `docs/dash-cross-app-integration-audit.md`, `docs/ROAM_RUSH_REBRAND_AUDIT.md`.

---

## Remediation status (implemented 2026-08-15)

Companion docs: [roam-rush-production-gate0-ops.md](roam-rush-production-gate0-ops.md), [roam-rush-ios-setup.md](roam-rush-ios-setup.md), [roam-rush-store-submission-checklist.md](roam-rush-store-submission-checklist.md).

| Finding | Status |
|---|---|
| Rush onboarding address mocked | **Resolved** — `AddressAutocomplete` + real GPS/`reverseGeocode` |
| Rush debug `127.0.0.1:7418` harness | **Resolved** — stripped |
| Rush Android location perms / geolocation plugin | **Resolved** |
| Rush iOS project missing | **Resolved (scaffold)** — `ios/` added; Mac `pod install` + signing still ops-owned |
| Partner native push | **Resolved (code)** — Capacitor push + FCM/APNs channel; needs real `google-services.json` + `FCM_SERVER_KEY` |
| Partner stock icon/splash | **Partial** — icon generation script + splash colors; final Asset Studio pass before store |
| Partner oauthLoading stuck / silent auth failure | **Resolved** |
| Partner keystore.properties gitignore | **Resolved** |
| Courier offer UI mock IDs | **Resolved** — real pending order mapping |
| Courier ETA / live maps / dead Call-Maps buttons | **Resolved** |
| Courier VehicleDetails / Account mock seed | **Resolved** |
| Customer push cosmetic | **Resolved (code)** — customer audience + native/web subscribe; SMS remains primary |
| Card save dead end | **Resolved** — Add Card entry hidden; checkout remains path |
| Item favorites local-only | **Resolved** — `customer_favorite_items` + sync |
| RLS 7 zero-policy tables | **Verified live** — all have policies |
| `notifications` missing from edge deploy | **Resolved** — added to workflow + `deploy:functions:all` |
| Kingston polygon geofence | **Resolved** — polygon + bbox fallback |
| CI for dash apps | **Resolved** — PR/push CI runs dash tests |
| Seed merchants/promotions | **Ops open** — 1 active merchant, 0 promotions |
| WiPay refund secrets / Auth redirects / Firebase files | **Ops open** — see Gate 0 ops doc |
| Stacked multi-order courier | **Deferred** — gated off until backend stacks |
| WiPay hosted-fields card vault | **Deferred** — post-launch epic |

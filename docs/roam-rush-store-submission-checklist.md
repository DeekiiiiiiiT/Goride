# Roam Rush stack — store submission checklist

Covers **Android + iOS** for all three apps: Rush (`dash-customer`), Courier (`dash-courier`), Partner (`dash-merchant`).

## App identities

| Product | Package / Bundle ID | Android open | iOS open (Mac) |
|---------|---------------------|--------------|----------------|
| Roam Rush | `co.roamenterprise.rush` | `pnpm cap:rush:android` | `pnpm cap:rush:ios` |
| Roam Courier | `co.roamenterprise.courier` | `pnpm cap:courier:android` | `pnpm cap:courier:ios` |
| Roam Partner | `co.roamenterprise.partner` | `pnpm cap:partner:android` | `pnpm cap:partner:ios` |

## Branding / icons

Splash / status bar colors (already in each `capacitor.config.ts`):

| App | Color |
|-----|-------|
| Rush | `#006d43` |
| Partner | `#10b981` |
| Courier | `#006d43` (same as Rush until distinct courier brand) |

Best-effort local branding:

```bash
# From repo root — tints adaptive backgrounds; resizes logos if sharp is installed
pnpm icons:dash-android
# or: node scripts/generate-dash-android-icons.mjs
```

**Before store submit**, regenerate proper adaptive / App Icon assets:

1. [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html) **or**
2. `pnpm dlx @capacitor/assets generate` with a 1024×1024 master icon per app
3. Courier: add `apps/dash-courier/public/images/logo.png` (currently no dedicated logo — script falls back to avatar or background-only)

iOS: set App Icon in Xcode Assets (`AppIcon`) from the same 1024 master; do not ship Capacitor default icons.

## Android (Play Console)

For each app:

- [ ] Release signing keystore + Play App Signing enrolled
- [ ] `versionCode` / `versionName` bumped (`pnpm cap:*-release` / bump scripts)
- [ ] AAB built (`pnpm cap:rush:aab` / courier / partner)
- [ ] `google-services.json` present for FCM
- [ ] Location / notifications permission justifications in listing + in-app prompts
- [ ] Privacy policy URL: `https://roamenterprise.co/privacy`
- [ ] Data safety form aligned with location, account, purchase, device IDs
- [ ] Screenshots (phone + 7" / 10" if applicable), feature graphic, short/long description
- [ ] Content rating questionnaire completed
- [ ] Target API level meets current Play requirement
- [ ] Internal testing track green before production

## iOS (App Store Connect)

Generate projects first on a Mac — see `docs/roam-rush-ios-setup.md`.

For each app:

- [ ] `npx cap add ios` + `pnpm cap:sync` committed
- [ ] Bundle ID matches table above
- [ ] URL scheme for OAuth (`…://login`) registered
- [ ] Info.plist usage strings (location, camera, photos, notifications)
- [ ] Push capability + APNs key in Firebase
- [ ] `GoogleService-Info.plist` installed (not committed)
- [ ] Privacy Nutrition Labels match actual data use
- [ ] App Privacy Policy URL set
- [ ] Courier: background location justification if always-on tracking ships
- [ ] Screenshots for required device sizes
- [ ] TestFlight build signed with distribution cert / profile

## Auth / backend gates (shared)

- [ ] Supabase redirect allowlist includes three native schemes (see Gate 0 ops)
- [ ] WiPay secrets set (`WIPAY_*`)
- [ ] `GOOGLE_MAPS_API_KEY`, VAPID, FCM configured
- [ ] `notifications` edge function deployed
- [ ] Enough merchants + promotions seeded for a credible launch (Gate 0: promotions still 0)

## CI

`.github/workflows/ci.yml` runs on `push`/`pull_request` to `main` and `workflow_dispatch`: install → dash app tests → monorepo build.

# Roam Rush stack — iOS greenfield (Mac)

`@capacitor/ios` ^7 is installed and `ios/` scaffolds were generated for all three apps (Windows can add the project files; CocoaPods / Xcodebuild still require a Mac).

Dependencies and scripts: `cap:sync` → `cap sync`, `cap:open:ios`, root `pnpm cap:rush:ios` / `cap:courier:ios` / `cap:partner:ios`.

## Apps / bundle IDs

| App | Path | Bundle ID | OAuth URL scheme |
|-----|------|-----------|------------------|
| Roam Rush | `apps/dash-customer` | `co.roamenterprise.rush` | `co.roamenterprise.rush://login` |
| Roam Courier | `apps/dash-courier` | `co.roamenterprise.courier` | `co.roamenterprise.courier://login` |
| Roam Partner | `apps/dash-merchant` | `co.roamenterprise.partner` | `co.roamenterprise.partner://login` |

## Finish on a Mac (required)

```bash
# From repo root
pnpm install

# Per app — install pods + open Xcode
cd apps/dash-customer && pnpm cap:sync && cd ios/App && pod install && cd ../../..
cd apps/dash-courier && pnpm cap:sync && cd ios/App && pod install && cd ../../..
cd apps/dash-merchant && pnpm cap:sync && cd ios/App && pod install && cd ../../..

pnpm cap:rush:ios
pnpm cap:courier:ios
pnpm cap:partner:ios
```

If `ios/` is missing on a fresh clone (should be committed):

```bash
cd apps/dash-customer && npx cap add ios && pnpm cap:sync
# repeat for dash-courier, dash-merchant
```

Commit the `ios/` folders (do **not** gitignore the whole tree). `GoogleService-Info.plist` is gitignored — copy it locally / via CI secrets.

## Info.plist usage strings

Confirm these keys in each app’s `Info.plist` (edit in Xcode if missing):

| Key | Suggested copy |
|-----|----------------|
| `NSLocationWhenInUseUsageDescription` | Roam needs your location to show nearby restaurants and delivery status. |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | (Courier only) Roam Courier needs background location while you are on an active delivery. |
| `NSCameraUsageDescription` | Roam needs camera access for profile photos and delivery proof. |
| `NSPhotoLibraryUsageDescription` | Roam needs photo library access to attach images. |
| `UIBackgroundModes` | Include `remote-notification` (all). Courier also needs `location` when background tracking is enabled. |

## URL schemes (OAuth / deep links)

In Xcode → Target → Info → URL Types, add a scheme matching the bundle ID prefix:

- Rush: `co.roamenterprise.rush`
- Courier: `co.roamenterprise.courier`
- Partner: `co.roamenterprise.partner`

Supabase Auth allowlist must include the full callback URLs (see `docs/auth/SUPABASE_REDIRECT_CHECKLIST.md` and `docs/roam-rush-production-gate0-ops.md`).

## Firebase / APNs

1. Create an iOS app in Firebase for each bundle ID.
2. Download `GoogleService-Info.plist` → place at:
   - `apps/dash-customer/ios/App/App/GoogleService-Info.plist`
   - `apps/dash-courier/ios/App/App/GoogleService-Info.plist`
   - `apps/dash-merchant/ios/App/App/GoogleService-Info.plist`
3. Enable Push Notifications capability + Background Modes → Remote notifications.
4. Upload APNs Auth Key (`.p8`) to Firebase Cloud Messaging for each app.
5. Entitlements: `aps-environment` = `development` (debug) / `production` (TestFlight/App Store).

## Store submit

See `docs/roam-rush-store-submission-checklist.md` for icons, privacy nutrition labels, and listing assets.

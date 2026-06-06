# Roam Rides — Capacitor Android

Native shell for **@roam/rides-passenger** (Capacitor 7 + Vite).

| Item | Value |
|------|--------|
| App ID | `co.roamenterprise.rides` |
| Display name | Roam Rides |
| Web bundle | `apps/rides-passenger/dist` |
| Android project | `apps/rides-passenger/android` |

## Prerequisites

Same as driver: **Android Studio**, **JDK 21**, **Node 20+**, `pnpm install` at repo root.

## Workflow

```bash
pnpm cap:rides:sync
pnpm cap:rides:android
```

Or from `apps/rides-passenger`: `pnpm cap:sync` → `pnpm cap:open:android`.

## Release AAB (Play Store)

**Before each Play upload**, bump the version and sync (auto-increments `versionCode`):

```bash
pnpm cap:rides:release
```

Or from `apps/rides-passenger`: `pnpm cap:release`

Then Android Studio → **Build → Generate Signed Bundle / APK** → **Android App Bundle** (release).

Version numbers live in `apps/rides-passenger/android/version.properties`. Use `cap:sync` alone for local testing — only run `cap:release` when shipping to Play (each run bumps by 1).

## Play Store

- Separate listing from **Roam Driver** (`co.roamenterprise.rides` vs `co.roamenterprise.driver`)
- Privacy policy: `https://roamenterprise.co/privacy`
- Rider app uses **foreground location** only (no background location permission in manifest)

## Google sign-in

Add Supabase redirect URL for native app, e.g. `co.roamenterprise.rides://login` (test on device after configuring Auth).

## Address search (Places)

Capacitor serves the WebView at **`https://localhost`**, not `roam-s.co`. The browser Maps key (`GOOGLE_MAPS_API_KEY_RIDES`) is usually referrer-restricted to the web domain, which breaks Places autocomplete in the Play-installed app.

**Shipped fix:** native builds call **`/rides/v1/places/autocomplete`** and **`/rides/v1/places/:id/details`** (server-side Places API using the same rides Maps secret). Deploy the `rides` Edge function after pulling this change, then rebuild/sync the AAB.

**Optional (maps tiles in WebView):** in Google Cloud → Credentials → browser key, also allow:

- `https://localhost/*`
- `http://localhost/*` (dev live reload)

Enable **Places API (New)** on the project if autocomplete returns 403 from the Edge routes.

## Live reload (dev)

In `capacitor.config.ts`, temporarily set:

```ts
server: { url: 'http://YOUR_LAN_IP:5180', cleartext: true },
```

Run `pnpm dev:rides-passenger`, then `cap run android`. Remove before release builds.

See also: `docs/driver/CAPACITOR_ANDROID.md` for signed AAB / keystore steps (same process).

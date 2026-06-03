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

## Play Store

- Separate listing from **Roam Driver** (`co.roamenterprise.rides` vs `co.roamenterprise.driver`)
- Privacy policy: `https://roamenterprise.co/privacy`
- Rider app uses **foreground location** only (no background location permission in manifest)

## Google sign-in

Add Supabase redirect URL for native app, e.g. `co.roamenterprise.rides://login` (test on device after configuring Auth).

## Live reload (dev)

In `capacitor.config.ts`, temporarily set:

```ts
server: { url: 'http://YOUR_LAN_IP:5180', cleartext: true },
```

Run `pnpm dev:rides-passenger`, then `cap run android`. Remove before release builds.

See also: `docs/driver/CAPACITOR_ANDROID.md` for signed AAB / keystore steps (same process).

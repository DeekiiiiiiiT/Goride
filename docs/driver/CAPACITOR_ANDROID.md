# Roam Driver — Capacitor Android

Native shell for **@roam/driver** (Capacitor 7 + Vite).

| Item | Value |
|------|--------|
| App ID | `co.roamenterprise.driver` |
| Display name | Roam Driver |
| Web bundle | `apps/driver/dist` |
| Android project | `apps/driver/android` |

## Prerequisites (your machine)

1. **Android Studio** (Ladybug 2024.2.1+ recommended for Capacitor 7)
2. **JDK 21** (bundled with recent Android Studio)
3. **Node 20+**
4. pnpm (repo root): `pnpm install`

## Daily workflow

From repo root:

```bash
pnpm --filter @roam/driver cap:sync
pnpm --filter @roam/driver cap:open:android
```

Or from `apps/driver`:

```bash
pnpm cap:sync
pnpm cap:open:android
```

In Android Studio: **Run** on a device or emulator (API 24+).

## Release AAB (Play Store)

**Before each Play upload**, bump the version and sync (auto-increments `versionCode`):

```bash
pnpm cap:driver:release
```

Or from `apps/driver`: `pnpm cap:release`

Then:

1. Android Studio → **Build → Generate Signed Bundle / APK** → **Android App Bundle**
2. Create or use a **upload keystore** (keep backup + passwords safe)
3. Build **release** variant
4. Upload `.aab` to Play Console → **Internal testing** first

Version numbers live in `apps/driver/android/version.properties`. Use `cap:sync` alone for local testing — only run `cap:release` when shipping to Play (each run bumps by 1).

First-time Play setup also needs: privacy URL, Data safety, store listing, content rating.

## App icon & splash

- Default Capacitor launcher icons are in `android/app/src/main/res/mipmap-*`
- Replace with your **512×512** Play icon (use Android Studio **Image Asset**)
- Splash background is `#006d43` in `capacitor.config.ts`

## Location (Play Store)

- In-app **background location disclosure** is implemented before going online
- Manifest declares fine/coarse/background location + foreground service types
- Declare the same in Play Console **Data safety** and **App content → Location permissions**

## Google / email sign-in on device

Supabase **Redirect URLs** must include (Authentication → URL Configuration):

- `https://roamdriver.co/`
- `co.roamenterprise.driver://login`

Email signup and Google OAuth from the Play app use the custom scheme above — **not** `https://localhost` (Capacitor’s internal origin). After auth, the app receives the callback via `appUrlOpen` and completes the Supabase session.

Test on a real device: sign up with email → confirm link should reopen **Roam Driver**, not roamdash.co.

## Live reload (optional dev)

Uncomment in `capacitor.config.ts`:

```ts
server: {
  url: 'http://YOUR_LAN_IP:3002',
  cleartext: true,
},
```

Run `pnpm --filter @roam/driver dev`, then `cap run android`. Remove `server.url` before store builds.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| White screen | Run `pnpm cap:sync` after `pnpm build:mobile` |
| Gradle sync failed | Open Android Studio, install SDK Platform 34+, accept licenses |
| Location denied | Grant location in Android settings; use disclosure flow in app |

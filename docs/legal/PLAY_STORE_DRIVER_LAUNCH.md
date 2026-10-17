# Roam Driver — Play Store launch tracker

Use **roamdriver.co/admin → Play Store** to track checklist progress and AAB uploads.

## Deploy (once)

1. Apply migrations:
   - `20260602130000_driver_play_store_launch.sql`
   - `20260603130000_driver_data_safety_state.sql`
2. Deploy the `driver` Edge function
3. Deploy `@roam/driver` to roamdriver.co

## Constants

| Item | Value |
|------|--------|
| Package | `co.roamenterprise.driver` |
| Privacy URL | `https://roamenterprise.co/privacy` |
| Supabase redirect | `co.roamenterprise.driver://login` |
| Reviewer email | `deekiiiiiii+roam.driver.review@gmail.com` |
| Reviewer password | `RoamPlay2026!Driver` |
| Repo version | `apps/driver/android/version.properties` |
| Android target SDK | 36 |

## Play Console — Sign in details (required)

**Policy → App content → Sign in details** → features require login → paste:

```
Email: deekiiiiiii+roam.driver.review@gmail.com
Password: RoamPlay2026!Driver

Instructions:
Use EMAIL + PASSWORD only (Google sign-in is not shown on the Android app).
Open app → Sign In → enter Email and Password → Sign In.
Allow location when prompted → tap Go online.
Do not use Sign in with Google.
```

Then **Publishing overview → Send for review**.

## QA

1. Install from Play (internal/closed or production candidate).
2. Sign in with reviewer email/password → go online (location disclosure).
3. Confirm Android login screen has **no** Google button.
4. New web/iOS signups: email link must return via `co.roamenterprise.driver://login`.

## Data safety (admin CSV sync)

**Admin → Play Store → Data safety** — same workflow as Roam Rides: import your Driver Console export, edit in admin, export, re-import in Play Console.

Replace `packages/play-store-launch/fixtures/driver-data-safety.golden.csv` with your Driver Console export when available. Spec: [DATA_SAFETY_CSV_SPEC.md](./DATA_SAFETY_CSV_SPEC.md).

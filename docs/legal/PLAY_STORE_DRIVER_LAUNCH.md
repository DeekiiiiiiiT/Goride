# Roam Driver — Play Store launch tracker

Use **roamdriver.co/admin → Play Store** to track checklist progress and AAB uploads.

## Deploy (once)

1. Apply migration `20260602130000_driver_play_store_launch.sql`
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

## QA

1. Install from Play closed testing.
2. Sign in with reviewer credentials → go online (location disclosure).
3. New signups: email link must return via `co.roamenterprise.driver://login`.

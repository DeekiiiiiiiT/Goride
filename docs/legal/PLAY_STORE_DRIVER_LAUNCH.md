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

## QA

1. Install from Play closed testing.
2. Sign in with reviewer credentials → go online (location disclosure).
3. New signups: email link must return via `co.roamenterprise.driver://login`.

## Data safety (admin CSV sync)

**Admin → Play Store → Data safety** — same workflow as Roam Rides: import your Driver Console export, edit in admin, export, re-import in Play Console.

Replace `packages/play-store-launch/fixtures/driver-data-safety.golden.csv` with your Driver Console export when available. Spec: [DATA_SAFETY_CSV_SPEC.md](./DATA_SAFETY_CSV_SPEC.md).

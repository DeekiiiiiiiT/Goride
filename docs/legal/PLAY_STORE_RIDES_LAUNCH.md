# Roam Rides — Play Store launch tracker

Use **roam-s.co/admin → Play Store** to track checklist progress and AAB uploads. Complete the real steps in [Google Play Console](https://play.google.com/console).

## Deploy (once)

1. Apply migrations:
   - `20260602120000_rides_play_store_launch.sql`
   - `20260603120000_rides_data_safety_state.sql`
   (`supabase db push` or SQL Editor).
2. Deploy the `rides` Edge function (includes `/admin/play-store` routes).
3. Deploy `@roam/rides-passenger` to roam-s.co.

## Play Console paths (Roam Rides)

| Task | Where in Play Console |
|------|------------------------|
| Privacy policy | Policy → App content → Privacy policy |
| App access | Policy → App content → App access |
| Ads | Policy → App content → Ads |
| Content rating | Policy → App content → Content rating |
| Target audience | Policy → App content → Target audience |
| Data safety | Policy → App content → Data safety |
| Category & contact | Grow → Store presence → Store settings |
| Store listing | Grow → Store presence → Main store listing |
| Closed testing | Test and release → Testing → Closed testing |
| Production access | Closed testing requirements → Apply for production |

## Constants

| Item | Value |
|------|--------|
| Package | `co.roamenterprise.rides` |
| Privacy URL | `https://roamenterprise.co/privacy` |
| Supabase redirect | `co.roamenterprise.rides://login` |
| Reviewer email | `deekiiiiiii+roam.rider.review@gmail.com` |
| Reviewer password | `RoamPlay2026!Rider` |

Provision accounts: `node scripts/provision-play-review-accounts.mjs`

## QA (Play-installed build)

1. Install from Closed testing link.
2. Sign in with reviewer email/password (email flow, not signup).
3. Confirm home loads and you can start a ride request flow.
4. Email/OAuth signup: confirmation must return to app via `co.roamenterprise.rides://login`.

## Data safety (admin CSV sync)

Roam Rides: **foreground location only** — do not declare background location.

**Admin → Play Store → Data safety** mirrors Google Play Console:

1. **Import from CSV** — paste your Play Console export (`data_safety_export.csv`) or use **Load Rides template** for the golden fixture.
2. Edit checkboxes in the questionnaire and per-type modals; review the **Store listing preview**.
3. **Save changes**, then **Export to CSV**.
4. In Play Console → Data safety → **Import from CSV** to apply the same answers.

Spec: [DATA_SAFETY_CSV_SPEC.md](./DATA_SAFETY_CSV_SPEC.md). Golden fixture: `packages/play-store-launch/fixtures/rides-data-safety.golden.csv`.

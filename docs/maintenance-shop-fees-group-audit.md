# Shop fees group — audit

**Rev 1 · 13 Nov 2026.** Goal: a mechanic's inspection or diagnostic fee can be logged on Fleet → Log service as its own job, under its own group, **Shop fees**, not under a part of the car.

## What I looked at (live database + code, 13 Nov)

- **No fee job exists.** Dominion has "Leak Inspection" (Engine, a leak check), "Lights Check" (not a quick job), and a package named "Inspection" that is really an oil change, tire and fluids bundle. None of these is a fee.
- **Groups are rows in `maintenance_service_categories` with `kind = 'system'`.** There are 11 car groups (`sys_engine` … `sys_electrical`, sort 1000–1100) plus 4 import groups (`imp-*`, sort 9001–9004).
- **Dominion has no "Add group" button.** Jobs → Add job only accepts an existing group (`maintenance_jobs_admin_routes.ts` POST `/admin/maintenance/jobs` refuses a parent that is not `kind = 'system'`). So the group goes in as a migration.
- **Where a new group shows up**, checked one by one:

| Place | Reads groups how | New group (`is_part = false`, `quick_job_eligible = true`) |
|---|---|---|
| Dominion → Maintenance templates → Jobs (list + Home group dropdown) | `kind = 'system'`, active, code not `imp-%` | **Shows.** Correct. |
| Fleet → Log service → What was done | `/maintenance-categories/quick-jobs`: `kind = 'system'` and `quick_job_eligible = true` | **Shows** as a group with its jobs. Correct. No sections, so it uses the flat job grid (same as groups without sections today). |
| Fleet + Dominion → Find parts (browse) | `parts_catalog_read.ts` `shapeBrowse` drops rows with `is_part = false` | **Hidden.** Correct, a fee is not a part. |
| Dominion → Parts database → Add parts | fixed area list in `addPartsShared.tsx` | **Hidden.** Correct. |
| Dominion → Part schedules (`mmGroupByArea.ts`) | only groups that have jobs | Shows only once the fee job exists. Correct. |
| Fleet → digital inspection checklist | inspection templates, not groups | Not affected. |
| Business Finance | adds services under the expense category "Maintenance", not by group | Not affected; the fee counts as maintenance spend. |
| Service history | saves the group name on each line | Line reads "Shop fees". Correct. |

- **Op codes:** a job in a group with code `sys_shop_fees` gets prefix `SHOP-` from `opCodePrefixForSystem`'s fallback. No code change needed.

## Data

One migration, made with `npx supabase migration new shop_fees_group` (real current UTC time). It inserts one group row and does nothing if it is already there:

| Column | Value |
|---|---|
| `code` | `sys_shop_fees` |
| `name`, `plain_name` | `Shop fees` |
| `kind` | `system` |
| `parent_id` | null |
| `is_part` | **false** (keeps it out of Find parts) |
| `quick_job_eligible` | **true** (shows on Fleet Log service) |
| `status` | `active` |
| `op_code` | `SHOP` |
| `icon_key` | `wrench` |
| `sort_order` | `1110` (after Battery & electrical) |
| `field_schema` | `{"fields":[]}` (same as the other groups) |

`INSERT … ON CONFLICT (code) DO NOTHING` (`code` is unique). Checked against the table: every NOT NULL column is set or has a default; the only checks (`kind`, `status`, `position_scheme`, `part_type_status`, `default_fit_mode`) pass with defaults; the only insert trigger fills `default_action` for jobs only.

- Migration: `supabase/migrations/20261113010913_shop_fees_group.sql` (validator passes).
- Live apply: `docs/shop_fees_group_LIVE_apply.sql` — same insert + the `schema_migrations` logbook line, in one transaction, then a check query.

The fee job itself is **not** in the migration. The owner adds it in Dominion → Jobs → Add job (below), which is the normal way jobs are made.

## Server

No change.

## Screens

No change. After the migration, the owner adds the job in Dominion:

| Field | Value |
|---|---|
| Name | `Inspection / diagnostic fee` |
| Home group | **Shop fees** |
| Form type | **Service** |
| Default action | **Inspect** |
| Description | `The fee a mechanic charges to inspect the car or find what is wrong, when no repair is done on the same line.` |
| Icon | wrench |
| Also do | none |

## Problems found

| # | Problem | Fix |
|---|---|---|
| SF-01 | No way to log a mechanic's inspection or diagnostic fee. | Shop fees group (migration above) + the fee job (owner adds in Dominion). |
| SF-02 | The package named "Inspection" is an oil change, tire and fluids bundle, so the name says something it isn't. A "Basic Service" package already exists, so that name is taken. The package is in use (4 part schedules, 6 ledger rows point at it; 0 services, 0 car schedules — owner query 13 Nov), so it stays. | Rename it to `Oil & safety check` (contents unchanged) once SF-04 is in. |
| SF-04 | Dominion → Service packages → Edit package has no Name box, so a package can't be renamed (the server's PATCH already accepts `task_name`). | **Built 13 Nov:** Name box at the top of `MaintenanceMasterPackageDrawer.tsx`; blank name or a name another package uses is refused on the panel; only sends `task_name` when it changed. Page passes the other package names. tsc: no errors in these files; maintenance-master vitest 20/20. Not committed, not deployed. |

| SF-03 | Op codes keep punctuation from the job name: "Inspection / diagnostic fee" got `SHOP-I/DF`. `shortOpSuffix` in `maintenance_jobs_admin_helpers.ts` takes the first character of every word, including "/". Cosmetic; the job works. | In `shortOpSuffix`, drop words with no letters or digits before taking first letters (gives `SHOP-IDF` for new jobs); existing codes stay as they are. |

## Done-tests

1. Dominion → Jobs: the group list shows **Shop fees**; Add job → Home group dropdown has **Shop fees**.
2. Add the fee job as above → it appears under Shop fees with op code starting `SHOP-`.
3. Fleet → Log service → What was done: **Shop fees** shows with **Inspection / diagnostic fee**; pick it, enter 5,000 in Labor, save.
4. That service in Service history shows the line under Shop fees, total 5,000; Business Finance maintenance spend goes up by 5,000.
5. Find parts (Fleet and Dominion): **no** Shop fees group appears.
7. Edit package → **Name** box shows the current name; typing `Basic Service` shows "Another package already has this name." and Save does nothing; renaming "Inspection" to `Oil & safety check` saves and the card title changes.
6. Live check: `select code, kind, is_part, quick_job_eligible, status from public.maintenance_service_categories where code = 'sys_shop_fees';` returns one row: `system, false, true, active`.

## State

| Step | State |
|---|---|
| Migration written | **Done 13 Nov** — `20261113010913_shop_fees_group.sql` + live apply file |
| Migration live + logbook line | **Done 13 Nov** — owner ran the live apply file; check query returned `sys_shop_fees, Shop fees, system, false, true, active` (done-test 6 passed) |
| Fee job added in Dominion | **Done 13 Nov** — live row: `Inspection / diagnostic fee`, op code `SHOP-I/DF`, not a part, quick job, active, inspect, group Shop fees (done-test 2 passed; see SF-03) |
| SF-04 Name box | Built 13 Nov (local only) |
| SF-02 package renamed to `Oil & safety check` | Not done — owner renames using the new Name box |
| Done-tests 1–6 | 1, 2, 3, 6 **passed 13 Nov**. Real service logged: 5179KZ, 20 May 2026, line "Inspection / diagnostic fee" under Shop fees, labor 3,000 (with a 1,900 discount, total 1,100 — ties). Open: 4 (Service history + Business Finance on screen), 5 (Find parts shows no Shop fees). |

# Give Cursor this — Service items, Round UI1 (Dominion screens)

You are building **Round UI1 only** of `docs/service-items-architecture-audit.md`. Read **sections 5 (Dominion bullets), 9, 9a and 9c** first. The server is done (S1): `GET /admin/maintenance/jobs` returns `items` per job plus `supplies` and `units`; the supply routes, the job-item routes and the order route exist (`supabase/functions/_fleet-server/maintenance_jobs_admin_routes.ts`, error messages already plain). No server, database or Fleet code in this round.

**Before you start:** the owner runs `pnpm testcopy` (Docker Desktop open). You don't start or stop it.

## How to port (audit 9 + 9a)
- Each screen has a Stitch folder in `docs/stitch/service-items-dominion/html/<folder>/` with `code.html` and `screen.png`. **Port the layout, classes and wording of `code.html` exactly**, swap every sample value for real data, and change content only as the screen's Keep / Drop / Add list in audit 9c says. Screen 2's PNG stops early, so port it from `code.html`.
- **App shell stays as it is:** drop Stitch's sidebar ("Fleet Admin", "Vehicles 1,420") and top bar. Port only the page content, drawers and dialogs into today's Maintenance templates page (`apps/admin/src/components/admin/maintenance-master/`).
- Every count, name, code, date and status comes from the API. No invented values.
- Standing rules:
  - in-app dialogs only, never `window.confirm` / `alert` / `prompt`;
  - every action is a visible button, never a link-styled control;
  - Cancel / Remove / Retire buttons are red;
  - users without `catalog.write` see everything read-only, following today's `canWrite` pattern in `JobDrawer.tsx`;
  - follow the existing `maintenanceMasterTheme.css` tokens for colours and dark mode.

## Screens (audit 9c is the Keep / Drop / Add for each)
| # | Screen | Stitch folder | Where |
|---|---|---|---|
| 1 | Jobs tab with "May need · N" pill | `jobs_tab_may_need_counts` | `MaintenanceMasterPage.tsx` tabs + `jobs/JobsTab.tsx` |
| 2 | Edit job drawer — May need section | `edit_job_drawer_may_need_list` | `jobs/JobDrawer.tsx` |
| 3 | Add to May need — Part types | `add_to_may_need_part_types` | new `jobs/AddMayNeedDialog.tsx` |
| 4 | Add to May need — Supplies | `add_to_may_need_supplies` | same dialog, Supplies tab |
| 5 | Supplies tab | `supplies_tab` | new `supplies/SuppliesTab.tsx` |
| 6 | Edit supply drawer | `edit_supply_drawer` | new `supplies/SupplyDrawer.tsx` |
| 7 | Retire a supply | `retire_a_supply` | new `supplies/RetireSupplyDialog.tsx` |
| 8 | Retired + restore | `retired_supplies_and_restore` | `SuppliesTab.tsx` Retired view |
| 9 | States | `may_need_states` | drawer, dialog, Supplies tab |
| 10 | Tablet | `tablet_edit_job_may_need` | the same components at tablet width (768–1024 px) |

Behaviour for every button (audit 4.1 and 5):
- **Tabs:** add **Supplies** after Jobs. Every tab shows its real count (part schedules, packages, jobs, supplies, review list). History has no count.
- **Jobs list:** a row's "May need · N" pill counts its active links. No pill when N is 0.
- **May need section** (under "Also do" in the drawer):
  - rows show the item name, a Part / Supply pill, a Usually / Sometimes pill, the quantity hint with the unit (supplies), the note, **Edit** (inline: need, quantity, note → `PATCH /admin/maintenance/job-items/:id`), red **Remove** (in-app confirm → `POST …/remove`), and Move up / Move down buttons plus drag to reorder (`PUT /admin/maintenance/jobs/:id/items/order` with every active link id);
  - retired items are greyed with a "Retired" pill;
  - on a job that isn't saved yet, the section shows "Save the job first, then add items" and no Add button;
  - **+ Add item** opens screen 3.
- **Add dialog:**
  - Part types | Supplies tabs with search and clear;
  - each row's sub-line is "home group · section" for part types, "name · unit" with the description for supplies;
  - an item already in May need shows a disabled "Already listed" pill; a part type already in this job's Also do shows a disabled "Already in Also do" pill;
  - then "How often is it needed?" (Usually / Sometimes), the usual quantity with a unit chip for supplies, and a note (max 300);
  - **+ Add** sends `POST /admin/maintenance/job-items`;
  - **+ New supply** opens screen 6 empty; after saving, the new supply is selected in the dialog.
- **Also-do picker** (existing): a part type already in May need shows a disabled "Already in May need".
- **Supplies tab:**
  - Active / Retired switch with counts, search, + Add supply;
  - "Standard consumables" card with "N supplies" under its title;
  - table with icon, name, `SUP-` code, unit, "On N jobs" / "Not on any job", Active pill, Edit.
- **Supply drawer:**
  - Name with a 120-character counter, required Description with helper, Unit (active units only), Icon (every `JOB_ICON_KEYS`);
  - a "Used on N jobs: …" card where each job opens that job's drawer;
  - Created by / Last modified;
  - footer: red Retire, Cancel, Save supply.
- **Retire supply dialog:** the Keep text, then Keep it / Retire supply. After retiring, show the server's `hiddenFromJobs` count in the success message.
- **Retired view:** "Active catalog: N | Archive: N" badge, a row per retired supply with its job names and **Restore**. If the name is taken, the server's 409 message shows in red on that row.
- **States (screen 9):**
  - loading skeleton for May need;
  - a save error shows "Couldn't save this item." with the server's message and Try again. When the error is the Also-do clash, add **View 'Also do'**, which scrolls to the Also do card;
  - empty May need shows the Add item button;
  - a search with no matches shows Clear query and + New supply.
- **Keyboard:** Move up / Move down are real buttons with labels ("Move Throttle body cleaner up"). Focus stays on the moved row's button after a move.

Put API calls in `jobs/jobsApi.ts` (or a new `supplies/suppliesApi.ts`), with types matching the S1 route shapes. Put pure helpers (pill counts, "Already listed" rules, order moves) in a model file with unit tests, following the `jobs/jobsModel.ts` + `jobsModel.test.ts` pattern.

## Tests (same round — playbook rule "change the screen, change its test")
**1. Unit tests (vitest),** for the model helpers above.

**2. New `e2e/dominion-service-items.spec.ts`** — click-through on the real local stack, nothing faked. Follow `e2e/dominion-maintenance-master.spec.ts` for the session seeding (`helpers/mmP01Auth`). Add it to the Dominion project's `testMatch` in `playwright.config.ts`. Screenshots go to the git-ignored `test-results/service-items-dominion/`, never into `docs/`. Audit done-tests:
- **16:** Throttle Body Cleaning's drawer shows "Throttle body cleaner"; add `Intake manifold gasket` (Sometimes, qty 1, a note); reload and the order holds; move it up with the keyboard (focus the Move up button and press Enter); reload and the new order holds.
- **17:** create a supply with a made-up name (`SI-UI1 Test Cleaner <timestamp>`); add it to a job; retire it (row greys in the drawer, `hiddenFromJobs` shown); restore it. Then create a second active supply with the same name while the first is retired, try Restore → the red name-clash message.
- **18:** remove a link → it disappears and the pill count drops. The link row still exists with `removed_at` set (check with `psql` against the local database).
- **19:** `POST /admin/catalog/related-supplies` → 404, and `variant_parts_checklist` has no `supplies` key. These are API checks inside the spec.
- **Read-only:** the analyst session (`seedMmP01AnalystSession`) sees May need and Supplies but no Add / Edit / Remove / Retire buttons.
- Phone / tablet: screen 10 at 820 × 1180.

**3. Side-by-side proof** (audit 9 "Proof"): for each of the 10 screens, a live screenshot next to the Stitch `screen.png` in `test-results/service-items-dominion/compare/`. In your report, list per screen every Keep / Add item and whether it's present, and confirm no Drop item appears.

## How to run (local test copy only)
1. `pnpm --filter admin exec tsc --noEmit`: no new errors in files you changed. `pnpm --filter admin test`: the new unit tests pass.
2. With the owner's `pnpm testcopy` running: `ADMIN_BASE_URL=http://127.0.0.1:5180 node node_modules/@playwright/test/cli.js test e2e/dominion-service-items.spec.ts --project=dominion-admin --reporter=list --max-failures=1 --retries=0`. **Run it once.** If it fails, stop and report the failing test and its error. Never use `--ui`, `--headed`, `--debug` or `show-report`.
3. `pnpm check`.

## Rules
- Never touch the live database, `.env.local`, or ports 3000, 3001, 5173. Don't start or stop the test copy. Stop only processes you started.
- No git branch, commit or push. Never stage or save `*.png` outside `test-results/`.
- Change only: files under `apps/admin/src/components/admin/maintenance-master/` (existing and new), their unit tests, the new e2e spec, `playwright.config.ts` (`testMatch` only).
- Report: clickable links to changed files, the per-screen Keep / Drop / Add check, and pass / fail of each command with any error text. Don't paste file contents.

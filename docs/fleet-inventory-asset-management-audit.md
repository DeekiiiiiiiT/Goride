# Fleet Inventory — Blueprint

**Rev 56 · 8 Nov 2026 · LIVE; CI inventory tests red (T-01)** (commit `937efea1`, fleet-core v242). Follows [the playbook](how-we-build-playbook.md). This is the only plan file for this section. Rev 1–50 are in git history (Rev 50 = the full system, live 5 Nov, commit `e204225b`).
**Scope:** Fleet → Vehicle Operations → Inventory; Roam Driver → My car kit. Admin is out of scope.

## Goal

> **The fleet owner can see every piece of equipment, which car it's in or who has it, its condition and repairs, and its full history; what each car is missing; and what it cost. The driver can report a missing or broken item from their phone.**

On 5 Nov the owner cut the extras (purchasing, counts, device tracking). Per-unit tracking stays, because it's the main point of fleet inventory: if a jack moves from one car to another, the owner sees it in that jack's history.

## What stays and what goes

| Keep | Remove completely (screens, buttons, server routes, database, switches) |
|---|---|
| **Overview:** stock value, low/out of stock, cars with a full kit, needs action, kit completeness, and equipment in repair / faulty / lost | **Purchasing** tab, purchase orders, vendors, requisitions, reorder rules, "Suggested to buy", procurement cap |
| **Stock:** items, how many are in the store, cost per item, Receive, Issue | **Counts** tab, count sessions, count accuracy |
| **Vehicle kits:** what each car should carry, the kit editor, what's missing | **Device tracking** on equipment: IMEI, firmware, online/offline signal (`last_heartbeat_at`, `device_health`), provider, external device ID, GPS, car-computer (`obd_snapshot`) data, diagnostics, `inv_asset_diagnostic`, `inventory_telematics_provider.ts`, "Devices needing attention" |
| **Assets (one-by-one equipment):** each unit's tag/serial, cost, where it is (store or which car), who has it (custody), condition (`in_store`, `installed`, `in_repair`, `faulty`, `lost`, `retired`, `disposed`), next check date (for example, fire extinguisher expiry), and a **history timeline**: moved to car X, given to driver Y, marked faulty, sent for repair, repaired — each with who, when, a note and photos | **Insurance fields** on equipment (`insurance_policy_ref`, `insurer_name`) and `warranty_ends_on` |
| **Move between cars:** a "Move to another car" action on a unit, recorded in its history and in Movements | **Approvals** (a write-off just needs a reason), reservations, QR printing, scanner pairing, bins/shelf positions |
| **Movements:** the log of items in and out, with who did it, plus reversal | **Phase switches 4–8** and the phase-gate code/banner ("This part of Inventory isn't switched on yet"). Everything that stays is simply on |
| **Alerts:** missing items, driver reports, low stock, equipment faulty or lost, next check due | Overview cards for removed parts ("Open purchase orders", "Devices needing attention") |
| **Driver "My car kit":** see the kit, report missing/broken with a photo (this becomes a history entry on that unit), weekly "it's all there" | |
| **Rush kit check:** stays as is, switched off | |

**Under the hood, unchanged:** the movement ledger, item costs and the nightly "all stock numbers add up" check. They already work, and rebuilding money logic isn't part of this.

## Open

**T-01 · The GitHub "Inventory done-tests" step has never passed.** (Found 8 Nov.)
- **Cause 1, fixed 8 Nov (`103fb6bf`):** the test helper saved the fake login under `sb-<project_id>-auth-*`. On a local Supabase, Fleet reads `sb-127-auth-token` and Driver reads `sb-local-auth-driver`, so every spec sat on the sign-in page.
- **Cause 2, open:** the 18 specs in `e2e/inventory-done-test-01…18.spec.ts` were written before the 5 Nov cut-down (Rev 51–53). They still test removed things: spec 10 expects 403 on `/purchase-orders` (now 404), seeds insert into removed tables (02, 03, 04, 07, 12, 13 fail in psql), and they click buttons and screens that changed (01, 05, 06, 08, 11, 14–18 time out). Run `42511304722` has every failure reason.
- **Fix:** replace the 18 specs with one spec per done-test 1–17 below. Each clicks the real screen and checks the database rows. No new screens are needed: all of them exist (Overview, Stock, Vehicle kits, Assets, Movements, Alerts, Driver My car kit).
- **Note:** the specs only run on GitHub (`scripts/run-inventory-done-tests.mjs` resets the local database and maps a Z: drive). The owner is handling this in a separate chat.

Before T-01: none. **Live and checked by the planner (5 Nov):** 11 items, 7 movements and 22 ledger rows, all unchanged. The dash camera and its history are kept. The removed tables are gone, only phase 0–3 switches remain, the ledger chain check is ok, and the last migration is `20261114120000`. Still to do: the owner tries the done-tests by hand, then G2–G4.

**Built (Rev 54):** S-01 to S-12 are done on the local copy.
- **Migrations:** `20261106132300_fleet_inventory_s02_cutdown.sql` and `20261106132400_fleet_inventory_s08_s12_asset_rpcs.sql`.
- **Tests (Cursor):** 50 inventory server tests pass, integrity checks are 0, and inventory typecheck errors are 0.
- **Stock transfers (I checked):** the local `inv_transfer` is identical to live, except the movement label (`transfer` instead of `requisition`). Stock costs move exactly as before.
- **Database (I checked):** every removed table and view is gone, and everything kept is still there.

The owner tries the done-tests below by hand once it's live.

## Done-tests (on the local test copy first, then by hand on live)

1. **Tabs:** the tabs are exactly Overview, Stock, Vehicle kits, Assets, Movements and Alerts. There's no grey "not switched on" banner anywhere.
2. **Receive:** receive 2 Tyre pumps at J$ 6,500 → the store shows 2, worth J$ 13,000, and Movements shows RECEIVE +2.
3. **Issue:** click 5179KZ's red Tyre pump cell → Issue → the cell turns ✓, the store goes 2 → 1, and Movements shows ISSUE −1.
4. **Reverse:** reverse that issue with a reason → a REVERSAL row appears, the numbers go back, and nothing is deleted.
5. **Register:** register a Car Jack unit with serial "JACK-01" into 5179KZ → it shows on the Assets tab and in 5179KZ's kit, and its history starts with "Installed in 5179KZ".
6. **Move:** move JACK-01 to 1505LM → its history shows "Moved from 5179KZ to 1505LM by <your name>", Movements shows the move, and 5179KZ's jack cell turns red.
7. **Who has it:** give JACK-01 to a driver → the unit shows that driver, and the history records it.
8. **Condition and repair:** mark JACK-01 Faulty with a note and photo → Overview and Alerts show it. Log a repair (J$ 2,000) and set it back to In a car → both are in the history.
9. **Write off:** write off one item with a reason → the stock drops and Movements shows WRITE_OFF. There's no approval step.
10. **Driver report:** the driver reports the Warning triangle missing, with a photo → Fleet Alerts shows it within a minute. A tracked unit gets a history entry.
11. **Fix the report:** the fleet marks it fixed from stock → the driver sees "1 report fixed".
12. **Kit editor:** add "Reflective vest" to the kit → both cars show a red vest cell, and so does the driver's kit.
13. **Dash camera:** it keeps its serial, cost and history, and shows no device-tracking fields.
14. **Server:** the purchasing, counts and diagnostics routes return 404.
15. **Database:** the removed tables and columns are gone, and `platform_feature_flags` has no phase 4–8 rows.
16. **Look-only user:** sees no action buttons.
17. **Nightly check:** still reads "all stock numbers add up".

## Go live (owner, after the done-tests pass on the test copy)

| # | Step |
|---|---|
| G1 | Done 5 Nov: `inv_road_clearance_gate` is off. |
| G2 | Check both cars in person. Record what's really in 5179KZ and 1505LM using Opening balances. |
| G3 | Enter real costs for Tyre pump, First-aid kit, Warning triangle and Fire extinguisher. Rename Phone Holder Mount's code `LEG-86736967-a32` to a real one. |
| G4 | The planner runs the integrity checks: all 0, and the missing items match G2. |

## Screens the owner needs to make

| Screen | Notes |
| --- | --- |
| Move to another car | Stitch TBD; build from Issue dialog layout until design exists |
| Change condition | Stitch TBD; build from Issue dialog layout until design exists |
| Log repair | Stitch TBD; build from Issue dialog layout until design exists |

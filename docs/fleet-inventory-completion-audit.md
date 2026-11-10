# Fleet Inventory — Completion Audit

**Rev 2 · 10 Nov 2026 · CODE COMPLETE — not live yet.** IV-01 to IV-16 are fixed in code, along with 10 more bugs found while building (IV-21 to IV-30). Not live yet: the migration `20261110125114_fleet_inventory_completion.sql` hasn't been applied, the fleet-core and delivery servers are still the old version, and the Fleet site isn't rebuilt. After that, only the owner data (IV-17 to IV-20) is left. Follows [the playbook](how-we-build-playbook.md).
**Scope:** Roam Fleet → Vehicle Operations → Inventory (`/vehicle-operations/inventory`): the Overview, Stock, Vehicle kits, Assets, Movements and Alerts tabs, and every dialog opened from them. The Roam Driver app is out of scope, except where Fleet has to see what drivers report.
**Separate from** [fleet-inventory-asset-management-audit.md](fleet-inventory-asset-management-audit.md), which covered the 5 Nov cut-down. This audit starts from what is live today.

## Goal

> **The fleet owner opens Inventory and sees true numbers: what is in the store, what is in each car, what each car is missing, and what needs doing. Every button on the page does what it says.**

## Rev 2 status (10 Nov)

| # | Status | What was done |
|---|---|---|
| IV-01 | Fixed in code | `v_inv_kit_compliance`: a toll tag line is `ok` only when `fleet.toll_tags.vehicle_id` = the car. A fuel card line is `ok` only when an Active card is assigned to the car or to its `current_driver_id`. The `linked` status is gone. Fuel card and toll tag cells open the Fuel Cards or Toll Tags page. A read-only check on live data gives 1505LM fuel card + toll tag = missing, and 5179KZ = ok. |
| IV-02 | Fixed in code | New view `v_inv_store_needs` (Needed = shortfall on cars whose required line is missing or short; Out / Low against the store, where no balance row counts as 0). Overview and Stock list the item names; Stock adds the missing kit items as 0 rows. Read-only check on live data: Tyre pump store 0, needed 2. |
| IV-03 | Fixed in code | New view `v_inv_asset_value` (cost of units in store, installed, in repair or faulty, on the store or cars side, and never counted twice if the item also has a balance row). Stock value adds it; Assets shows "Value of units". Live data: camera J$45,998.85 is on cars. |
| IV-04 | Fixed in code | `required` is exposed. Optional lines are left out of missing, %, full kit and road clearance (both gate copies plus the sync test), and show as grey "Optional — not fitted". Live data: 5179KZ is missing 3. |
| IV-05 | Fixed in code | The real `checked_at`, in Jamaica time, in normal body text. Red "hasn't run since <date>" after 26 h. Also used on the Stock card. |
| IV-06 | Fixed in code | `inv_nightly_integrity` upserts one `inv_kit_compliance_daily` row per org (required lines only). No screen uses it yet. |
| IV-07 | Fixed in code | The Issue dialog sends exactly the ticked rows: one call per car with only that car's lines. Lines the store can't cover are greyed with "N in store — receive first". The `step` state and "Edit cars or items" are deleted. |
| IV-08 | Fixed in code | The grid is built from the compliance rows (columns in `sort_order`), and "Also on this car" is real. |
| IV-09 | Fixed in code | A Missing or Short cell opens the Issue dialog with that car and line ticked. The direct-post code is deleted. |
| IV-10 | Fixed in code | An **Edit kit** button beside Kit templates, hidden for look-only users. |
| IV-11 | Fixed in code | `GET /alerts` adds open driver reports (`report:<id>`, type `driver_report`). Overview "Needs action" lists them. **Open record** opens the dialog, which now loads through a new Fleet route `GET /inventory/driver-reports/:id` (the old driver-only route always returned nothing for Fleet staff). |
| IV-12 | Fixed in code | Worked-out alerts only have **Open asset** or **Open record**. Done, snooze, assign and viewed return 404 for unknown or worked-out ids. |
| IV-13 | Fixed in code | Every row in the table is wired or removed (the stock row menu is deleted). A static scan in `assert-inventory-gap-audit.mjs` finds 230 buttons with 0 lacking a handler and 0 `href="#"`. |
| IV-13a | Fixed in code | Receive lists only store and car locations, defaults to `is_default`, and the price comes from `default_unit_cost`. |
| IV-14 | Fixed in code | Every row of the table is done. Fixed text is dropped and real values are wired, including the signed-in user, real store names, versions, the driver report timeline, the settings save time, setup steps out of 3, the toll tag number and the last-checked time (two columns added to the compliance view). |
| IV-15 | Fixed in code | Both stray `<aside>` side menus are deleted, along with the blurred fake pages behind the dialogs. |
| IV-16 | Fixed in code | The words and fields are removed. The migration drops the 7 `inv_settings` columns (no database function used them). The Stock Category filter is removed, and Type now reads `tracking`. "Locations & bins" is now "Locations". |
| IV-17 | Done 10 Nov | Owner count: 1505LM empty (matches). 5179KZ has Car Jack, Car Mats, Lug Tool, Phone Holder Mount, Spare Tire, Dash Camera unit and Tyre pump (Tyre pump posted as OPN-0006, 1 @ J$8,700). Store has Phone Holder Mount ×1 and Spare Tire ×1 (confirmed). |
| IV-18 | Done 10 Nov | Tyre pump J$8,700, Warning triangle J$2,527.33, Fire extinguisher J$4,054. First-aid kit has no cost: none were bought. |
| IV-19 | Done 10 Nov | Phone Holder Mount code renamed to `EQ-PHONE-MOUNT`. |
| IV-20 | Owner, later | The owner will add the Dash Camera serial on the Asset page. |

### Found while building (all fixed in code)

| # | Problem | Fix |
|---|---|---|
| IV-21 | The item editor's save always failed: it sent `unit_cost_jmd`, `default_cost_jmd` and `unit_of_measure`, which aren't columns. IV-18 couldn't be done. | `POST/PATCH /items` write only real columns and map the old names to `default_unit_cost` and `uom`. The editor sends `default_unit_cost`. |
| IV-22 | Import items called an RPC that is a stub ("not implemented"), so nothing was ever imported. | The screen creates each CSV row through `POST /items`. It skips existing codes and shows what was added. The sample CSV uses the real columns. |
| IV-23 | Opening balances priced every line at J$0 (wrong field) and took one line per post. | Several lines per place, each with an editable cost (pre-filled from `default_unit_cost`), plus a Review step. |
| IV-24 | In the Custody dialog the mode tabs changed nothing and From/To were fixed text, so Move stock could never be sent. | Real item, place and car pickers, a working mode switch, and the real signed-in user. |
| IV-25 | `GET /assets` returned raw rows, so the Assets tab showed no item name or car. | The route adds the item name, location and car plate. |
| IV-26 | Movements showed the store as both From and To on every row, with no item or quantity. | `GET /movements` adds the item, quantity, value and from → to from `inv_ledger`, and supports `item_id` (used by Item editor → View history). |
| IV-27 | The kit compliance and stock lists capped at 50 rows, so a 5th car would silently drop off the grid and stock value would undercount. | Compliance is never paged. The page loads stock with `?all=1`. |
| IV-28 | Vehicle → Profile → Equipment crashed: the kit card used the Inventory page's state outside that page. | The card loads its own rows there and links to Inventory. |
| IV-29 | Retire on the Asset page used a browser pop-up. | An in-app confirm. |
| IV-30 | The Asset page had no serial number box (needed for IV-20). | A serial number field with Save. |

### Tests (Rev 2)

| Done-test | Where | Result 10 Nov |
|---|---|---|
| 1, 2, 3, 4, 14 | `scripts/sql/fleet_inventory_completion_test.sql` (in `run-fleet-inventory-data-checks.mjs`) | Not run: needs a database with the migration applied. The same logic run read-only on live data gives the expected values. |
| 5–11, 13, 15 | `e2e/inventory-completion.spec.ts` | Written, not run (needs the test copy with the migration). |
| 12 | `scripts/assert-inventory-gap-audit.mjs` | **Pass**: 0 dead buttons or links, 0 banned strings. |
| Helpers (IV-02/04/05/08) | `inventoryCompletion.test.ts` | **Pass** 7/7. |
| Server (IV-04/11/12) | `inventory_completion.test.ts` (added to CI) | **Pass** for the unit tests. The integration tests need the local database. |
| Whole inventory Deno list | CI list | **Pass** 33 / 0 failed. |
| Fleet `tsc` | inventory files | 0 errors (369 elsewhere in the app, none in files changed here). |
| Gates | validate-migration-sql, view-invoker, revoke-anon, utf8, route manifest | **Pass** (the fleet-core manifest was regenerated for the new route). |

## What I looked at (9 Nov)

- **Code:** all 92 files in `apps/fleet/src/components/inventory/` and the server routes in `supabase/functions/_fleet-server/inventory_*.ts`.
- **Live data (read only):** items, balances, locations, kit template and lines, `v_inv_kit_compliance`, assets, alerts, driver reports, the nightly check, toll tags and fuel cards.
- **The owner's screenshot** of the Overview tab.

## Live data today

| What | Live value |
|---|---|
| Items | 11 (1 archived: "Phone holder"). Four have no cost: Tyre pump, First-aid kit, Warning triangle, Fire extinguisher |
| Store (JM-KIN-ST01) | Spare Tire ×1 (J$15,000), Phone Holder Mount ×1 (J$5,400) |
| 5179KZ | Car Jack, Car Mats, Lug Tool, Phone Holder Mount, Spare Tire, plus the Dash Camera unit |
| 1505LM | Nothing recorded |
| Kit "Rideshare car kit" v1 | 11 lines: 9 items, plus a fuel card line and a toll tag line. Fire extinguisher is marked optional |
| Toll tags | 1, on 5179KZ. **1505LM has none** |
| Fuel cards | 1, given to Kenny Rattray (5179KZ). **1505LM has none** |
| Assets | 1: the Dash Camera, installed in 5179KZ, cost J$45,998.85, **no serial number** |
| Alerts table | **0 rows** |
| Driver reports | 0 |
| Categories | 0 |
| Nightly check | Ran 9 Nov 06:30 UTC (1:30 AM Jamaica). Clean for the last 7 days |
| Daily kit history (`inv_kit_compliance_daily`) | **Never written** |

The Overview stock value (J$69,380 = J$20,400 in the store + J$48,980 on cars) matches the balances exactly. The ledger is sound. The problems are in what the screens show and what the buttons do.

---

## Problems found

Each problem has one fix. They are grouped in the order they must be fixed: **A** wrong numbers, **B** buttons that do the wrong thing or nothing, **C** invented text and numbers from the design, **D** leftovers from removed features, **E** data the owner enters.

### A — Wrong numbers

**IV-01 · The kit counts a fuel card and toll tag that 1505LM doesn't have.** *(Critical)*
- **What happens:** `v_inv_kit_compliance` marks every `linked_fuel_card` and `linked_toll_tag` line as `linked` for every car without checking anything. Overview shows 1505LM as "2 of 11 OK", but both of those are false.
- **Fix:** in the view, a toll tag line is `ok` only when `fleet.toll_tags` has a row with `vehicle_id` = the car. A fuel card line is `ok` only when an active fuel card is assigned to that car or to the driver currently assigned to it. Otherwise the line is `missing`. Both lines open the existing Toll Tags or Fuel Cards page; they are never issued from stock.

**IV-02 · "Low or out of stock" says 0 while four kit items have none in the store.** *(Critical)*
- **What happens:** `v_inv_stock` only lists items that have a balance row. Tyre pump, First-aid kit, Warning triangle and Fire extinguisher have never been received, so they have no row and are never counted as "out". Every `reorder_qty` is 0, so nothing is ever "low" either.
- **Fix:** low or out is worked out per item for the store, against what the cars need. **Needed** = the number of cars whose kit is missing that item. The item is **Out** when the store has 0 and Needed > 0, and **Low** when the store has more than 0 but less than Needed. Items with no balance row count as 0. The card lists the item names, and Stock gets the same status column.

**IV-03 · The Dash Camera (J$45,998.85) is left out of Stock value.** *(High)*
- **What happens:** the camera is tracked as a single unit (`inv_asset`, status `installed`, location VEH-5179KZ), but it has no `inv_balance` row. Stock value only adds up balances, so the camera's cost is missing from the J$48,980 "on cars" figure.
- **Fix:** Stock value = balances + `purchase_cost` of every unit that is in the store, installed or in repair (not lost, retired or disposed), with each unit's cost added to its location's side (store or cars). The Assets tab shows the same total.

**IV-04 · The optional Fire extinguisher counts as "missing".** *(High)*
- **What happens:** the kit line is `required = false`, but the view doesn't expose `required`, and the screens count every line. That makes 5179KZ "missing 4 items" when 3 are required.
- **Fix:** add `required` to `v_inv_kit_compliance`. Optional lines are left out of "missing", "OK", the percentage and "full kit", and show as a grey "Optional — not fitted" cell.

**IV-05 · The nightly check line shows a fixed time.** *(Medium)*
- **What happens:** `In1Overview.tsx` always prints "Nightly check ran 06:30 today". It is also drawn in very faint grey (see the screenshot).
- **Fix:** print the real `checked_at` of the latest `inv_chain_check` row, in Jamaica time ("Nightly check ran 1:30 AM today · all stock numbers add up"). If the newest check is more than 26 hours old, show it in red: "Nightly check hasn't run since <date>". Use normal body text colour.

**IV-06 · Kit history is never saved.** *(Low)*
- **What happens:** `inv_kit_compliance_daily` has no rows, so there is nothing to compare "this week vs last week" against.
- **Fix:** the nightly job (the same one that writes `inv_chain_check`) also writes one `inv_kit_compliance_daily` row per org. No screen uses it until it has 7 days of data (see IV-14).

### B — Buttons that do the wrong thing or nothing

**IV-07 · Issue sends a different item from the one the dialog shows.** *(Critical: it moves real stock)*
- **What happens:** the Issue dialog's table lists every missing kit line for every car. But what it sends is its own `lines` state, pre-filled with the **first stock row** (whatever item that is) × 1, to the **first car**. "Edit cars or items" sets `step = 1`, but there is no step-1 screen. Pressing **Issue** can therefore move the wrong item to the wrong car.
- **Fix:** the dialog sends exactly the rows it shows. It opens with the car the user clicked ("Issue kit" on Overview or a car row passes `vehicleId`; the header Issue button starts with no car chosen). The user ticks which missing lines to issue. Each line shows Needs, In store and Will issue, and lines the store can't cover are greyed with "0 in store — receive first". The payload has one entry per ticked line, with that line's car and item. Delete the unused `step` state and "Edit cars or items".

**IV-08 · The Vehicle kits grid is a fixed picture.** *(Critical)*
- **What happens:** `In6VehicleKits.tsx` (595 lines) has fixed columns (Jack, Tyre pump, First aid…) and fixed ✓ OK and Missing cells for two rows. Only the plate text is live. "Also on this car: Car mats × 1 (ACC-MAT-01)" is typed in. Adding a third car or changing the kit changes nothing on the grid.
- **Fix:** build the grid from `kitComplianceRows`. Columns are the kit's lines in `sort_order`, rows are cars, and each cell shows ✓ OK / Short / Missing / Optional from `line_status`. "Also on this car" lists balances at the car's location that are not in the kit.

**IV-09 · Clicking a red "Missing" cell does nothing.** *(High)*
- **What happens:** every cell calls the same `issueMissingFromMatrix()`, which looks for field `status`. The view returns `line_status`, so it never finds a row and nothing happens.
- **Fix:** each Missing cell opens the IV-07 Issue dialog with that car and that line already ticked.

**IV-10 · The kit editor can't be opened.** *(High)*
- **What happens:** `In7KitTemplateEditor` is mounted in `InventoryPage.tsx`, but nothing calls `openModal('kit-editor')`. The owner cannot add or remove kit items.
- **Fix:** add an **Edit kit** button in the Vehicle kits header, beside "Kit templates", that opens the editor. Hide it in read-only mode.

**IV-11 · Fleet never sees driver reports in Inventory.** *(High)*
- **What happens:** `GET /inventory/alerts` returns only `inv_alert` rows (only the ledger check writes them) and alerts worked out from asset status. Reports a driver sends from My car kit are not in Alerts or Overview. The only screen that shows them is the kit card on Vehicle → Profile.
- **Fix:** the alerts route also returns every `inv_driver_report` that is not fixed, as type `driver_report`, with the car plate, item, note and photo. **Open record** opens the existing driver report dialog (`driver-report-update`). They show in Overview "Needs action" as "<plate>: driver reports <item> <missing/broken>".

**IV-12 · "Mark done" on equipment alerts does nothing.** *(Medium)*
- **What happens:** faulty, lost, in-repair and check-due alerts are worked out on the fly with ids like `derived:asset_faulty:<id>`. `POST /alerts/:id/done` updates `inv_alert` where id = that string, which matches 0 rows, and still returns `ok`.
- **Fix:** worked-out alerts have no Mark done or Snooze. Their action is **Open asset**, and they clear when the asset's condition changes. The server returns 404 when Mark done, Snooze, Assign or Viewed matches no row.

**IV-13 · Other buttons that do nothing.**
- **Fix for each:** wire it as listed, or remove it if the list says remove.

| Where | Button | Fix |
|---|---|---|
| Vehicle kits, car row | **Report** (`openKitCard` ignores the car) | Open that car's kit card (`In15VehicleKitCard`) in a dialog |
| Vehicle kits | **Issue missing** → confirm → opens the Issue dialog with nothing chosen | Skip the confirm step; open the IV-07 dialog with every car's missing lines ticked |
| Alerts | "View 18 resolved alerts", "Vehicles →", "Go to Vehicles & Maintenance" | Remove |
| Assets | "Learn inspection workflow" (`href="#"`) | Remove |
| Asset page | "Back to Assets", "View Car" | "Back" closes the dialog. "View Car" opens `/vehicles/<id>` |
| Issue dialog | "View in Movements →" | Close the dialog and switch to the Movements tab |
| Settings dialog | "Back to Inventory", "Alerts & Escalation", "Opening Balances", "Open Locations" | Back closes. The other three open `snooze-settings`, `opening-balances` and `locations-bins` |
| Item editor | "View history", "Supplier Profile" | "View history" opens Movements filtered to that item. Remove "Supplier Profile" |
| Kit templates | "Back to Vehicle Kits", "Back to kit editor" | Close the dialog |
| Locations | "Settings" back link, "Export Bins Catalog (CSV)" | Back closes. Remove the bins export |
| Opening balances | "Inventory" back link, "Review →" | Back closes. "Review" goes to the dialog's own confirm step |
| Import items | "Download sample CSV template" | Download a CSV with the importer's real column headers |
| Overview | **Issue kit** on a car row | Open the IV-07 dialog for that car |
| Stock row menu (`StockRowMenu.tsx`) | Hidden labels "Transfer between hubs…", "Cycle count item…" | Delete the file; the visible row buttons already cover Receive and Issue |

**IV-13a · Receive offers locations it shouldn't, and starts at J$0.** *(Medium)*
- **What happens:** the location list includes the four virtual locations (V-SUPPLIER, V-ADJUSTMENT, V-DISPOSED, V-IN-TRANSIT). The default is "first in the list" instead of `is_default`. The unit price reads `unit_cost_jmd` / `default_cost_jmd`, but the column is `default_unit_cost`, so every line starts at J$0.
- **Fix:** list only `warehouse` and `vehicle` locations, default to the one with `is_default = true`, and pre-fill the price from `default_unit_cost`.

### C — Invented text and numbers from the design

The Stitch designs came with sample facts that were built as fixed text. Per [the playbook](how-we-build-playbook.md) Step 4, **Keep** what is live, **Drop** what was invented, and **Add** the real number where the plan needs one. The look stays the same.

**IV-14 · Fixed numbers shown as if they were real.** *(High: they mislead)*

| Screen | Fixed text today | Fix |
|---|---|---|
| Stock, top bar | "08:20:30 AM EST", "platform_owner", "Storage Node: Primary Warehouse Alpha", "Immutable Audit Stream Active" | Drop the whole bar (the app header already shows the clock and user) |
| Stock, cards | "2 Nodes", "4 Critical Items · 1 Low Stock · 3 Completely Depleted", "0.00% Zero-Loss" | **Store value** (real), **Low or out** (IV-02 count + names), **Nightly check** (IV-05 text) |
| Vehicle kits, header | "13 Items", "35% Full", "2 active models" | **Missing items** = sum of required missing lines, **Cars with a full kit** = n of N |
| Vehicle kits, side panel | "+12% vs last week", "Stock units staged in Hub #01…" | Drop until IV-06 has 7 days of data, then show the real change |
| Alerts, 4 cards | "Active Deficits" showing **stock value** labelled "Kit items missing", "1 Vehicle · Dispatch blocked at Kingston #01", "1 SKU", "-1 Unit · Audit triggered today 06:30" | **Open alerts**, **Driver reports open**, **Equipment needing attention**, **Low or out** — all from live data |
| Issue dialog | "(10 items)", "Main store — Kingston", "(Fit · 0%)", "(Roomy · 70%)", "Only the dashboard mount is currently stocked…" | Real kit line count, real store name, real car % per car, and the IV-07 shortfall sentence |
| Assets | "Compliance Index 100%", "Next cycle: 15 Dec 2026", "Underwritten Protection", "Depot: Kingston Central", "JM-JMD FX Active", "1 Unserialized pending tag", "Fire extinguishers and telematics hardware require…" | Drop all. Add **Units without a serial** (real count) and **Next check due** (earliest real `next_inspection_due`) |
| Asset page | "in 66 days", "98% Life", "Hub #01 Physical Stamp", "Kingston Watermark #01" | "in N days" from the real date. Drop the rest |
| Movements, side panel | "Kingston Central Vault", "Bin capacity: 84%", "Reversal frequency: 0.14%", "100% SHA-256", "Main store — Kingston", "Last 30 days" | Drop the panel. "Last 30 days" becomes a real date filter, or is dropped |
| Item drawer | "Kingston Fleet Base", "842 items", "0.00%", "Last cycle count: Today 06:00", "7 items" | Drop the count and cycle-count text. Use the real store name and quantities |
| Custody / write-off dialog | "LOT-24-9042", "Transaction #TRX-9481", "Logged as John Doe (JD-Kingston)", "Warehouse 01 · Kingston Central", "Main store — Kingston (Cage A)" | Real from/to location names and the signed-in user's name. Drop lot and transaction numbers |
| Vehicle kit card | "Active · Rideshare Fleet #01", "70% · 7 of 10 items", "Today, 06:15 AM", "Valid (JM-KGN-990)", "78%" | Real kit %, real last-checked time, real toll tag number |
| Kit editor | "Standard Spec v3.0", "Kingston Cluster #01", "91%" | Real version number. Drop the rest |
| Kit templates | "Hash: v3.89cf…", "75% v4 Compliant", "10% Missing Triangle", "15% Missing Baseline" | Real version numbers and real per-line missing counts |
| Driver report dialog | "98.2% JMD COMPLIANT", the 4 timeline entries dated 1–2 Nov, "09:15A" | Real `inv_driver_report_update` rows |
| Settings | "Ref: JM-INV-2025", "Saved 08:20 AM" | Show the real `updated_at`. Drop the ref |
| Locations | "42%", "Move the 2 items out first", "Last inventory audit: Today, 14:15 EST by JD" | Real item count in that location. Drop the rest |
| Opening balances | "TYR 73.5% / ACC 26.5%" | Drop |
| Import items | "Kingston Central Storeroom · Zone A Warehouse Ledger" | Real store name |
| First-time setup | "Kingston Fleet Terminal #01 Ledger", "33% completed", "Load starter list (10 items)" | Real steps done out of 3. The starter list count comes from the list itself |
| Overview, Kit completeness | The plate appears twice on each row; "items allocated" | Show the plate once, and say "n of N items in the car" |

**IV-15 · Two dialogs carry a copy of an old side menu.** *(High)*
- **What happens:** `GapDriverReportUpdate.tsx:371` and `GapRegisterAsset.tsx:251` include a fixed left menu with links to **Work Orders, Suppliers & POs, Diagnostic Logs, Asset Valuation, Fitment & Compatibility** (all `href="#"`), plus "Active Depot Stock 84.6%". It covers the left of the screen when the dialog opens.
- **Fix:** delete both `<aside>` blocks.

### D — Leftovers from removed features (5 Nov cut-down)

**IV-16 · Removed features still show up in words and fields.** *(Medium)*
- **Fix:** remove each one listed below.

| Where | Leftover |
|---|---|
| Assets filter | "Warranty ending" chip |
| Item editor, Register asset, Import items | Warranty, Vendor / Supplier, Purchase fields |
| Asset page, Repair dialog | Vendor field, Telematics wording |
| Movements | Vendor, supplier, purchase and telematics wording; bin capacity |
| Custody dialog | "cycle count", "SCRAP", Telematics wording |
| Item drawer | "cycle count" |
| Settings | Fiscal year, scrap note and write-off rule fields (`inv_settings.fiscal_year_start_month`, `scrap_note`, `write_off_rule_code`, plus the unused `monthly_procurement_cap_jmd`, `approval_threshold_jmd`, `approval_rule_code`, `approval_rule_name`) — drop these columns in a migration |
| Snooze settings | Purchase / procurement / supplier alert types |
| Opening balances | "approval" wording |
| Locations | "Locations & bins" → "Locations". Bins and Telematics wording |
| Kit templates | "procurement" wording |
| Stock filters | The Category list is typed in (Electronics, Tires & wheels…) while `inv_category` has 0 rows, and it filters on `category`, which stock rows don't have: remove the Category filter. The Type filter reads `tracking_type`, which also doesn't exist: change it to `tracking` |

### E — Data the owner enters (after A–D are done)

**IV-17 · The real contents of each car and the store.**
- **Fix:** check both cars and the store in person, then record the result with **Opening balances**. 1505LM shows nothing today.

**IV-18 · Costs for the four items with no price.**
- **Fix:** enter the real costs for Tyre pump, First-aid kit, Warning triangle and Fire extinguisher in the item editor.

**IV-19 · Clean up the duplicate phone holder.**
- **Fix:** rename the code of Phone Holder Mount from `LEG-86736967-a32` to `EQ-PHONE-MOUNT`. Leave the archived "Phone holder" as it is.

**IV-20 · The Dash Camera has no serial number.**
- **Fix:** add the serial from the device label on the Asset page.

---

## Build order (layers)

| Layer | Problems |
|---|---|
| **Data** | IV-01, IV-02, IV-03, IV-04 (view changes), IV-06 (nightly row), IV-16 (drop the `inv_settings` columns). One migration |
| **Server** | IV-05 (return `checked_at`), IV-11 (driver reports in alerts), IV-12 (404 on unknown ids), IV-03 (asset cost in totals) |
| **Screens** | IV-07 to IV-10, IV-13, IV-13a, IV-14, IV-15, IV-16 (text and fields) |
| **Tests** | One test per done-test below, checking the database rows |
| **Owner data** | IV-17 to IV-20 |

## Done-tests (written before building)

1. **Fuel card / toll tag:** 1505LM shows the Toll tag and Fuel card cells as **Missing**. 5179KZ shows the Toll tag as OK (tag 212100286450).
2. **Low or out:** with the store holding 0 Tyre pumps and both cars missing one, the Overview card shows "Tyre pump — out (2 needed)" and the count includes it.
3. **Stock value:** Stock value = J$69,380 + J$45,998.85 = **J$115,378.85**, and "on cars" includes the camera.
4. **Optional line:** 5179KZ reads "missing 3 items" (not 4), and Fire extinguisher shows "Optional — not fitted".
5. **Nightly line:** Overview shows the real time of the latest check in Jamaica time. Change the latest `checked_at` to 2 days ago on the test copy → the line turns red and names the date.
6. **Issue the right thing:** receive 1 Warning triangle → Overview → 1505LM **Issue kit** → tick only Warning triangle → Issue. Movements shows ISSUE −1 Warning triangle → 1505LM. Nothing else moved: the store's Spare Tire and Phone Holder Mount are unchanged.
7. **Grid is live:** add "Reflective vest" to the kit in the editor (opened from **Edit kit**) → a new column appears with Missing for both cars. Remove it → the column goes.
8. **Cell click:** click 1505LM's red First-aid kit cell → the Issue dialog opens with 1505LM and First-aid kit ticked.
9. **Driver report:** the driver reports the Warning triangle missing → Fleet Alerts lists it within a minute, and so does Overview "Needs action". Open it → the driver report dialog opens on that report.
10. **Equipment alert:** mark the Dash Camera Faulty → Alerts shows it with **Open asset** and no Mark done. Set it back to Installed → the alert is gone.
11. **No fake text:** search the rendered pages for "Kingston", "Hub #01", "John Doe", "TRX-", "LOT-", "84.6%", "06:30" and "Warranty" → no matches (except a real store name the owner typed).
12. **No dead buttons:** every button and link on all six tabs and every dialog either does its listed action or is gone. The no-handler scan in this audit returns 0.
13. **Receive:** the location list shows only Main store, 5179KZ and 1505LM, defaults to Main store, and pre-fills Car Jack's price at J$12,600.
14. **Kit history:** after the nightly job runs, `inv_kit_compliance_daily` has a row for today.
15. **Look-only user:** a `fleet_viewer` sees no Receive, Issue, Edit kit, Mark done or Missing-cell actions.

## Screens the owner needs to make

None. Every fix uses screens that already exist; the grid (IV-08) and the Issue dialog (IV-07) keep their current Stitch look.

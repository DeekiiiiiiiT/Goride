# Fleet Inventory: what every button must do

**Companion to [`fleet-inventory-asset-management-audit.md`](fleet-inventory-asset-management-audit.md), Rev 31 · 2 Nov 2026.**

This spec covers all 451 buttons in Fleet `components/inventory` and the Driver `car-kit` screens.
- **211 are dead.** They call the no-op `form.stitchChrome()` or have no handler. Each one is listed below with the exact action it must call.
- **The other 240 already work.** The gap screens, the dialogs' main confirm buttons, and the driver screens are covered by the click-sweep test (audit R31-04).

Notation:
- `form.x()` is a function that already exists in that screen's `useIn*Form` hook, so only the `onClick` wiring is missing.
- **NEW** means the hook needs a small addition.
- `shell.setTab('…')` and `shell.openModal('…')` are the existing shell functions.

**Rules that apply on every screen:**

| Button | What it does |
|---|---|
| Inventory tab buttons repeated inside a screen (Overview, Stock, Vehicle kits, Assets, Movements, Purchasing, Counts, Alerts) | `shell.setTab('<tab>')`. The count on "Alerts n" comes from `shell` alert totals. |
| `close` (×), ESC, Cancel, Not now | `shell.closeModal()`, or the screen's `close()` |
| Counts inside labels ("Alerts 5", "Stock (128)", "All 14 Units", "Issue missing (3)") | Rendered from loaded data. Never a literal. |
| Pagination (‹ 1 2 3 … n ›) | Rendered from `pageCount`; each number calls `setPage(n)`. |
| `more_vert` / `more_horiz` row menus | Open a small menu of that row's actions, as listed per screen. |

---

## In1 Overview

| Line | Button | Must do |
|---|---|---|
| 42 | `more_horiz` | `form.openMoreOptions()`: a menu with Export (`form.exportOverview()`), Settings (`shell.openModal('inventory-settings')`) and Locations (`shell.openModal('locations-bins')`) |

## In2 Stock

| Line | Button | Must do |
|---|---|---|
| 54 | Stock | `shell.setTab('stock')` |
| 63 | Suppliers | `form.openSuppliers()` (opens `vendor-editor` in list mode) |
| 80 | All locations ▾ | A location menu from `shell` locations; it calls `form.setLocationFilter(id)` |
| 142 | Reset | `form.resetFilters()` |
| 178 / 182 | ‹ / › | `form.setPage(page ∓ 1)`, disabled at the ends |

## In3 Item drawer

| Line | Button | Must do |
|---|---|---|
| 47 | Export CSV | `form.exportMovements()` |
| 51 | New Stock Item | `shell.openModal('item-editor')` with no item |
| 59–72 | Stock / Movements & Audits / Purchase Orders / Suppliers / Fleet Kit Sets | `form.setTab('stock' / 'movements' / 'pos' / 'suppliers' / 'kits')`. The count on Stock comes from the item's on-hand. |
| 213 | ESC close | `form.close()` |
| 222 | `edit` | `shell.openModal('item-editor')` with this item |
| 394 | Issue to → | `form.openIssue()` |
| 409 | Edit rule | `form.openEditRule()` |
| 534 | View all n movements | `form.openMovementsTab()` (n = `itemMovements.length`) |
| 543 / 547 / 551 | Receive / Transfer / Issue | `form.openReceive()` / `form.openTransfer()` / `form.openIssue()` |

## In4 Receive

| Line | Button | Must do |
|---|---|---|
| 25 | Receive Stock (header) | Focus the first line's item select. It is not a second submit. |
| 226, 266 | `delete` | `form.removeLine(index)`. The lines render with `form.lines.map`, so this is one button per line. |
| 258 | Scan | `shell.openModal('scanner-pair')` if no scanner is paired; otherwise focus the scan input, and a scanned code calls `form.addLine(itemId)` |
| 274 | Add another item | `form.addLine()` |
| 377 | `close` | `shell.closeModal()` |

The fields must also be bound (audit R31-01): PO → `setPoId`, location → `setLocationId`, vendor → `setVendorId`, date → `setReceivedOn`, freight/duty → `setFreightCost`/`setDutyCost`, and each line's qty and cost → `updateLine(i, …)`. The PO select lists `form.purchaseOrders` with status ordered or part received.

## In5 Issue

| Line | Button | Must do |
|---|---|---|
| 140 | Edit cars or items | Return to step 1 (car and item pickers), keeping the current `lines` and `vehicleIds` |
| 157 | Create draft order for n short items | `shell.openModal('purchase-order')` prefilled with the short lines. n is the count of lines where qty > available. |

## In6 Vehicle kits

| Line | Button | Must do |
|---|---|---|
| 28, 56 | `close` / Cancel | `shell.closeModal()` |
| 57 | Confirm & Issue | `form.issueKits()` for the selected cars |
| 107 | Cars | `form.setView('cars')` |
| 115 / 119 | Matrix / Cards | `form.setView('matrix' / 'cards')` |
| 124 | Export matrix | `form.exportMatrix()` |
| 128 | Issue kits | Open the confirm step (lines 56–57), listing the shortfalls from `form.rows` |
| 299–419 | Missing Issue → (×9) | Render one per missing cell from `form.rows`; each calls `form.issueMissing(vehicleId, itemId)` |
| 529 | Report | `form.openKitCard(vehicleId)`, then the report action |
| 562 | Open Central Store Inventory | `shell.setTab('stock')` with the location filter set to the main store |
| 597 | Pair Mobile Scanner | `shell.openModal('scanner-pair')` |

## In7 Kit template editor

| Line | Button | Must do |
|---|---|---|
| 32 | New kit template | `form.newTemplate()` |
| 40–50 | Inventory tabs | `shell.setTab(…)` |
| 58 / 59 | Cars / Kit templates | `shell.setTab('vehicle-kits')` / stay |
| 86 | Compare with vN | `form.compare()`, which opens `kit-compare`. N is the previous published version. |
| 90 | Export Spec (PDF) | `form.exportSpec()` |
| 133–141 | Rideshare / Delivery / Executive | Select the template by its service line. **NEW:** `selectTemplate(id)`; the list comes from `GET /kits/templates`. |
| 207–495 | `delete` (×9) | Render the lines from the selected template with `.map`; each calls `form.deleteLine(lineId)` |
| 505 | Add equipment line | **NEW** `addLine()`: an item picker plus qty, required and blocks-road-clearance |
| 565 | Cancel | `shell.closeModal()` |
| 568 | Save as draft | **NEW** `saveDraft()` → `POST /kits/templates` |
| 571 | Save as new version | `form.publish()` |
| 728 / 731 | Not now / Move n cars | Close the dialog / `form.publish()` with `apply_to_vehicles`. n is the count of cars on the old version. |

## In8 Assets

| Line | Button | Must do |
|---|---|---|
| 29 | `close` | `shell.closeModal()` |
| 49 | `settings` | `shell.openModal('inventory-settings')` |
| 52 | `more_horiz` | A menu: Export assets (`GET /export.csv?type=assets`), Print QR labels (`InventoryQrPrintDialog`) |
| 55 | Receive Stock | `shell.openModal('receive')` |
| 59 | Issue Asset | `shell.openModal('issue')` |
| 109–129 | All / Installed / In store / In repair / Faulty / Warranty ending | `form.setStatusFilter(…)`; the counts come from the loaded assets |
| 161 | Add serial | `form.registerAsset()` |
| 202, 269 | Row `more_horiz` | A menu: Open (`form.openAsset(id)`), Move, Send to repair, Mark faulty, Retire |
| 300 / 302 | Previous / Next | `form.setPage(page ∓ 1)` |

## In9 Asset page

| Line | Button | Must do |
|---|---|---|
| 64 | `content_copy` | Copy the serial to the clipboard and show a "Copied" toast |
| 83 / 87 / 91 / 95 | Move / Send to repair / Mark faulty / Retire | `form.moveAsset()` / `form.sendRepair()` / `form.markFaulty()` / `form.retire()`. Each asks to confirm first. |
| 197–199 | All Logs / Incident / Custody | **NEW** `setLogFilter('all' / 'incident' / 'custody')` over `form.events`; the counts come from the events |
| 338 | Add Incident Note | **NEW** `POST /assets/:id/events` (type `incident`, body text), then reload `form.events`. The route doesn't exist yet; add it beside `/assets/:id/faulty`. |
| 368, 388 | `visibility` | Open the document's signed URL in a new tab |
| 371, 391 | `download` | Download the document's signed URL |
| 398 | Upload document | `form.uploadDocument()` (file input) |

## In10 Movements

| Line | Button | Must do |
|---|---|---|
| 112 | Export CSV | `form.exportCsv()` |
| 116 | Record Movement | `form.recordMovement()` (a menu: Receive / Issue / Transfer / Write-off, which open those modals) |
| 157 | Clear filters | `form.clearFilters()` |
| 235 | Row `more_horiz` | `form.setSelectedMovementId(id)` and open the reversal dialog |
| 258, 296 | `close` / Cancel | Clear the selected movement and close the dialog |
| 299 | Confirm Reversal | `form.confirmReversal()`, disabled until `reverseReason` is filled (bind the textarea to `setReverseReason`) |
| 320–325 | 1 2 3 … n › | From `form.pageCount`; `form.setPage(n)` |

## In11 Purchasing

| Line | Button | Must do |
|---|---|---|
| 50–61 | Inventory tabs | `shell.setTab(…)` |
| 74 / 78 / 83 | Orders / Suggested n / Vendors n | `form.setTab('orders' / 'suggested' / 'vendors')`; the counts come from the data |
| 91 | Export Audit Ledger | `form.exportPurchasing()` |
| 259 | + n more archived orders | **NEW** `showArchived` toggle; it lists closed and cancelled POs |
| 302 | Cancel order | `form.poAction(poId, 'cancel')` |
| 305 | Send for approval | `form.poAction(poId, 'submit')` |
| 309 | Mark ordered | `form.poAction(poId, 'order')` |
| 375 / 406 / 437 | `delete` (PO line) | Draft POs only: `PATCH /purchase-orders/:id` without that line. Lines render with `.map`. |
| 508 | Authorize | `form.poAction(poId, 'authorize')` |
| 531 | Recompute Thresholds | `POST /reorder/recompute`, then refresh |

## In12 Counts

| Line | Button | Must do |
|---|---|---|
| 43–53 | Inventory tabs | `shell.setTab(…)` |
| 116 | Open Sheet | `form.openSheet(sessionId)` |
| 141 | Audit Hash | Show the session's `audit_hash` in a popover with a copy button |
| 165 | View Record | Open the count's movement in Movements (`shell.setTab('movements')` filtered to `movement_id`) |
| 549 | Recount line | `form.recount(sessionId, lineId)` |
| 553 | Reject audit | `form.reject(sessionId)` with a reason |
| 557 | Approve & update stock | `form.approve(sessionId)` |

## In13 Alerts

| Line | Button | Must do |
|---|---|---|
| 47 | New Requisition | `form.newRequisition()` |
| 90 | Mark all viewed | `form.markAllViewed()` |
| 142–154 | Open / Assigned to me / Snoozed / Done | `form.setTab(…)`; counts from `form.tabCounts` |
| 208, 253, 298, 350, 395 | Row `more_vert` | A menu: Mark done (`form.markDone(id)`), Snooze (the alert snooze popover), Assign (`POST /alerts/:id/assign`), Open the related record |
| 249 | Reorder | `form.reorder(alert)` |
| 294 | Add serial | `form.addSerial(alert)` |
| 346 | Review | `form.reviewApproval(alert)` |
| 385 | Unassigned | `POST /alerts/:id/assign` to the current user |

Alert rows render with `.map` over `form.filtered`, so these buttons appear once per row.

## In14 Transfer / Return / Write-off

| Line | Button | Must do |
|---|---|---|
| 303 / 305 | Preview "Move stock" / Preview "Return from car" | `form.setMode('transfer' / 'return')` |

The fields must also be bound (audit R31-01): item → `setItemId`, from/to → `setFromLocationId`/`setToLocationId`, car → `setVehicleId`, qty → `setQty`, reason → `setReason`, memo → `setMemo`.

## In15 Vehicle kit card

| Line | Button | Must do |
|---|---|---|
| 42 | Manage Status | `shell.setTab('vehicle-kits')` focused on this car |
| 124 / 144 / 164 | Issue (per missing line) | Render per line; each calls `form.issueItem(itemId)` |
| 276 | Issue missing (n) | `form.issueKit()`; n is the count of missing lines |
| 280 | Return item | `form.returnItem(itemId)` |
| 285 | Report problem | `form.reportProblem(itemId)` |
| 391 | Book Early Service Slot | Open Fleet Maintenance's new work order for this vehicle, using the existing maintenance route with `vehicle_id` |

## In16 First-time setup

| Line | Button | Must do |
|---|---|---|
| 98 | Add location | `form.addLocation()` (bind the name to `setLocationName`) |
| 166 | Load starter list (n items) | `form.loadStarter()` |
| 271 | Finish setup | `form.finishSetup()` |
| 296 | Start a count | `form.startCount()` |

## In18 Phone

| Line | Button | Must do |
|---|---|---|
| 68, 255 | Scan / Scan Barcode | `form.scanBarcode()` (camera through `BarcodeDetector`, falling back to manual entry) |
| 79 | Sort by Bin ▾ | `form.setSort('bin' / 'name' / 'qty')` |
| 100, 131, 162 | Row `more_vert` | A menu: Issue to car, Move stock, Lifecycle (as below) |
| 185 | All n Units → | `shell.setTab('stock')` |
| 210 | Fulfill | `form.fulfill(requisitionId)` |
| 235 | Issue whole kit | `form.issueWholeKit()` |
| 247 / 251 | Receive / Issue | `form.receive()` / `shell.openModal('issue')` |
| 265 | Back to Stock | Return to the stock list view |
| 270 | `flash_on` | Toggle the torch on the camera track (`applyConstraints({advanced:[{torch}]})`) |
| 273 | `tune` | Open the sort and filter sheet |
| 295 | Enter Code Manually | Show the code input bound to `setManualCode`; submit calls `form.enterCode()` |
| 318 / 322 / 326 | Issue to car / Move stock / Lifecycle | `form.issueToCar()` / `shell.openModal('custody')` / `shell.openModal('asset-page')` |

## Driver Dk3 Report sent

| Line | Button | Must do |
|---|---|---|
| 110, 173 | Back to my kit | Already mapped by `CarKitNavHost` (`back-kit`); keep it |
| 161 | Retry now | Send the offline queue now, using the same function as the auto-send, instead of `retry-load` |
| 165 | Dismiss | Hide the offline notice and return to My car kit. Add `dismiss` to `resolveCarKitAction`. |

---

## Labels that must come from data

These are fixed numbers inside button labels today. Each must be rendered from data:
- "Alerts 5", "Suggested 1", "Vendors 3", "Open 5", "Assigned to me 3", "Snoozed 0", "Done 18"
- "Stock (128)", "View all 14 movements", "All 14 Units", "Issue missing (3)"
- "Create draft order for 10 short items", "+ 2 more archived orders", "Move 2 cars", "Compare with v2", "Load starter list (10 items)"
- "All 2 / Installed 1 / In store 1 / In repair 0 / Faulty 0 / Warranty ending 0", "All Logs (4)"
- Pagination "1 2 3 7"

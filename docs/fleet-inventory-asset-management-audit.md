# Fleet Inventory & Asset Management — Audit

**Rev 17 · 1 Nov 2026 · audit closeout implemented in repo + DB migration `20261101210200`.**
**Scope:** Fleet → Vehicle Operations → Inventory & Asset Management, and the Roam Driver car kit. Admin is out of scope.

Ledger/cost layers unchanged. Gap screens, API routes, and R13 git tracking are done in code; **re-capture signed-in `screen-live.png` files** before calling R15-01 fully green (see §3).

---

## 1. Open items

### R15-01 (High): live screenshots — **tooling done; assets need re-capture**

- [`scripts/capture-inventory-screen-live.mjs`](../scripts/capture-inventory-screen-live.mjs): requires `--storage`, supports `--driver-base`, fails on "Welcome back".
- [`scripts/stitch-fidelity.mjs`](../scripts/stitch-fidelity.mjs): fails on missing/duplicate `screen-live.png`.

**Owner/CI:** run capture with signed-in Fleet + Driver storage, then `node scripts/stitch-fidelity.mjs`.

### R15-02 — **Done**

Committed: `20261101205000`, `20261101205100`, capture script (`0a720dd7`). Remote `schema_migrations` includes both versions.

### R16-01 — **Done**

15 Fleet gap components under [`apps/fleet/src/components/inventory/gap/`](../apps/fleet/src/components/inventory/gap/); driver [`DkUpdateReportedItemSheet.tsx`](../apps/driver/src/components/car-kit/screens/DkUpdateReportedItemSheet.tsx). Placeholder [`gapScreens.tsx`](../apps/fleet/src/components/inventory/gap/gapScreens.tsx) removed. Wired via [`InventoryGapModals.tsx`](../apps/fleet/src/components/inventory/InventoryGapModals.tsx).

### R16-02 — **Done**

Compliance from `inv_settings.safety_notice_text` ([`useGapCompliance.ts`](../apps/fleet/src/components/inventory/gap/useGapCompliance.ts)); scanner banner uses live device fields; vendor stats via `fleet_inv_v_vendor_stats`; runtime strip of legacy Stitch legal/security copy ([`useInventoryGapActions.ts`](../apps/fleet/src/components/inventory/gap/useInventoryGapActions.ts)).

### R16-03 — **Done**

Migration [`20261101210200_fleet_inventory_r16_gap_writes.sql`](../supabase/migrations/20261101210200_fleet_inventory_r16_gap_writes.sql) applied on GoRide. Routes in [`inventory_controller_r16.ts`](../supabase/functions/_fleet-server/inventory_controller_r16.ts) + `POST /driver/reports/:id/resolve`. **Deploy fleet-core** after merge so edge matches repo.

---

## 1a. Historical Rev 16 spec (reference)

All 16 screens arrived, and all the content the prompt asked for is in them. They are now in the repo:
- Fleet: `docs/stitch/roam-fleet-app/inventory/inventory_asset_management_<name>/`, 15 folders.
- Driver: `docs/stitch/roam-driver-app/car-kit/update_reported_item_sheet/`.
- Design tokens: [`DESIGN-gap-screens.md`](stitch/roam-fleet-app/inventory/DESIGN-gap-screens.md).

**Fix:**
1. Port each screen from its `code.html` into the matching component, using this table:

   | Stitch folder | Replaces |
   |---|---|
   | `opening_balances` | `GapOpeningBalances` |
   | `register_asset_dialog` | `GapRegisterAsset` |
   | `add_edit_item_drawer` | `GapItemEditor` |
   | `approval_review_drawer` | `GapApprovalDrawer` |
   | `new_edit_purchase_order` | `GapPurchaseOrder` |
   | `vendors_list_edit_drawer` | `GapVendorEditor` |
   | `count_sheet_start_dialog` | `GapCountSession` |
   | `pair_mobile_scanner` | `GapScannerPair` |
   | `settings` | `GapInventorySettings` |
   | `import_items_3_step_dialog` | `GapImportItems` |
   | `snooze_settings_alert_rules` | `GapSnoozeSettings` |
   | `kit_version_compare` | `GapKitCompare` |
   | `update_reported_item_drawer` | `GapDriverReportUpdate` |
   | `locations_bins` | `GapLocationsBins` |
   | `requisitions_new_request_dialog` | `GapRequisition` |
   | Driver `update_reported_item_sheet` | new `Dk*` sheet, opened from My reports and from a "Reported" row; covers its 4 states: Active, Urgent safety, Offline, Fixed/closed |

2. Delete `apps/fleet/src/components/inventory/gap/` once the last screen is ported.

**Rules for the port:**
- **Port the panel, not the frame.** The exports use three different made-up headers ("FLEET MAINTENANCE OS", a "Fleet Engine" left sidebar with Fitment/Work Orders/Diagnostic Logs, and footer "v3.18.4-carib"). The app keeps its real Fleet header and Inventory tabs. Everything inside the page, dialog or drawer is ported exactly.
- **Compare against `screen-full.png`, not `screen.png`.** Stitch's own PNG cuts drawers off mid-form, so the Approval, Item, Register asset, Vendor and Update-report pictures are incomplete. `screen-full.png` is the full design, rendered from `code.html`.
- **Sample text becomes live data.** Every name, number, address and photo in the exports is sample data. Examples: "Marlon Samuels", "Montego Bay Outpost", "28 in stock", "Terminal 3, Marcus Garvey Dr", "J$ 93,185.00". Bind each one to the real record. Show the empty state when there is none.

### R16-02 (High): made-up laws and security claims must not ship as fixed text

The exports print legal and technical statements that aren't true for Roam:

| Screen | Made-up text |
|---|---|
| Driver update sheet | "Required by Jamaican Road Traffic Act" |
| Snooze settings | "Transport Authority of Jamaica (Road Safety Act 2024)" |
| Settings | "Carib Fleet Transport Act v2.4 … Audit: PASS" |
| Kit compare | "Jamaica Regs" |
| Opening balances | "Jamaican Fleet Asset Depreciation & Valuation rules" |
| Pair scanner | "TLS v1.3", "Secure WebRTC WSS", "WPA3 Enterprise Strict", "Latency 14ms", "Hub mesh status" |
| Vendor drawer | "4.9 / 5.0 (42 local dispatches)", "1,480 catalog SKUs mapped", "Caribbean Tier 1" |

**Fix:** keep every one of these boxes and chips, but fill them from real values:
- Legal and compliance boxes show the owner's own text from `inv_settings.safety_notice_text`. Hide the box when that text is empty.
- Scanner chips show the paired device's real location code, last seen and read count.
- The vendor card shows the real `v_inv_vendor_stats` figures.

No law name or rating is ever hard-coded.

### R16-03 (High): the new screens need save paths that don't exist yet

Today the API has only read routes for most of these screens. Add the missing pieces in one migration plus routes in `inventory_controller_extended.ts`, each guarded by the existing RBAC:

| Screen | Missing database piece | Missing API |
|---|---|---|
| Settings | `inv_category.archived_at` | `GET/PUT /settings`, `POST/PATCH /categories` |
| Locations & bins | `inv_bin.name` (shown as "Tyres & Heavy Spares") | `POST/PATCH /locations`, `POST/PATCH /bins`, archive refused while stock is inside |
| Vendors | `inv_vendor.email` | `POST/PATCH /vendors`, archive refused while a PO is open |
| Purchase order | — | `POST /purchase-orders`, `PATCH /purchase-orders/:id` (lines + extra costs, draft only) |
| Count | `inv_count_session.assignee_ids uuid[]` | `POST /counts` (start), `PUT /counts/:id/lines` (autosave) |
| Approval drawer | — | `GET /approvals`, `POST /approvals/:id/approve` and `/reject` for adjust, write-off, count and PO. Keep the existing "approver ≠ requester" check. |
| Requisitions | `inv_requisition.needed_by`, `inv_requisition.note` | `POST /requisitions/:id/approve`, `/reject`, `/issue` (issue opens the existing Issue flow) |
| Pair scanner | `inv_scan_device.pairing_expires_at` | `POST /scanners/:id/regenerate`, `DELETE /scanners/:id` (unpair) |
| Snooze / alert rules | new `inv_alert_rule` (type, default snooze, notify roles, can_snooze); safety kit items locked to `can_snooze = false` | `GET/PUT /alert-rules`. `/alerts/:id/snooze` refuses locked types. |
| Update reported item (fleet) | — | `POST /driver/reports/:id/resolve` (fixed via issue / fixed without stock, driver-liability flag). The "Driver Payroll Deduction" line shows only if liability actually posts to the driver's settlement; otherwise it reads "Driver marked responsible". |

Apply with `supabase db push` only, and check the version in `schema_migrations` matches the file name.

---

## 2. Screens the owner still needs to make

None. All 15 Fleet screens and the 1 Driver screen are delivered.

---

## 3. Checks

1. Run [`scripts/sql/fleet_inventory_integrity_checks.sql`](../scripts/sql/fleet_inventory_integrity_checks.sql). Every query must return 0 rows.
2. Expected values: stock value J$69,380; 7 cost layers; latest chain check ok.
3. After the port, each screen gets a signed-in `screen-live.png` next to its `screen-full.png`, and the two are compared by eye.
4. A quick search finds none of these strings in `apps/`: "Road Traffic Act", "Road Safety Act", "Carib Fleet Transport Act", "WPA3", "TLS V1.3", "v3.18.4-carib", "FLEET MAINTENANCE OS".

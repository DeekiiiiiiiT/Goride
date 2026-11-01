# Stitch gap screens (audit Rev 16)

**Status:** All 15 Fleet gap flows ported to `apps/fleet/src/components/inventory/gap/Gap*.tsx` via `node scripts/port-inventory-stitch.mjs --gap`. Driver update sheet: `apps/driver/src/components/car-kit/screens/DkUpdateReportedItemSheet.tsx` (`--driver-update`).

| Gap | Stitch folder | React |
|-----|----------------|-------|
| Settings | `inventory_asset_management_settings` | `gap/GapInventorySettings.tsx` |
| Item editor | `inventory_asset_management_add_edit_item_drawer` | `gap/GapItemEditor.tsx` |
| Import | `inventory_asset_management_import_items_3_step_dialog` | `gap/GapImportItems.tsx` |
| Locations | `inventory_asset_management_locations_bins` | `gap/GapLocationsBins.tsx` |
| Opening balances | `inventory_asset_management_opening_balances` | `gap/GapOpeningBalances.tsx` |
| Register asset | `inventory_asset_management_register_asset_dialog` | `gap/GapRegisterAsset.tsx` |
| PO | `inventory_asset_management_new_edit_purchase_order` | `gap/GapPurchaseOrder.tsx` |
| Vendor | `inventory_asset_management_vendors_list_edit_drawer` | `gap/GapVendorEditor.tsx` |
| Count | `inventory_asset_management_count_sheet_start_dialog` | `gap/GapCountSession.tsx` |
| Requisition | `inventory_asset_management_requisitions_new_request_dialog` | `gap/GapRequisition.tsx` |
| Approval | `inventory_asset_management_approval_review_drawer` | `gap/GapApprovalDrawer.tsx` |
| Scanner | `inventory_asset_management_pair_mobile_scanner` | `gap/GapScannerPair.tsx` |
| Snooze | `inventory_asset_management_snooze_settings_alert_rules` | `gap/GapSnoozeSettings.tsx` |
| Kit compare | `inventory_asset_management_kit_version_compare` | `gap/GapKitCompare.tsx` |
| Fleet report update | `inventory_asset_management_update_reported_item_drawer` | `gap/GapDriverReportUpdate.tsx` |

Modals open from Inventory tabs through `InventoryShellContext.openModal` (see `InventoryGapModals.tsx`).

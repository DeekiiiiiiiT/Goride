# Stitch project: Roam Fleet APP

- **Project id:** `3587123323600813385`
- **Design system:** Precision Operations (`assets/d393c21ec4be4c768bf9a2e8060fd674`)

## Trip Analytics screens

HTML only, under `docs/stitch/roam-fleet-app/html/`. These are layout references. The live page is Trip Analytics in the fleet app, and its numbers come from the trips API.

| # | Screen | File | Stitch screen id |
|---|---|---|---|
| 1 | Desktop | `trip-analytics-desktop.html` | `94a3b2d593284f3b9383a59b734b2980` |
| 2 | Phone | `trip-analytics-phone.html` | `7cc5c8c9e12a4a5dba772c0808e2fee2` |
| 3 | Roam rider-app funnel | `roam-funnel.html` | `0eebda198ec54dd0874d51c19dc95b5b` |
| 4 | Error, empty, and missing-metric states | `trip-analytics-states.html` | `b7f77d907a604ca5955d13a7a5625dbf` |
| 5 | Anomaly review drawer | `trip-analytics-anomaly-drawer.html` | `20650c0b41d54341abbae0b31147a6bf` |

Open a file from disk. Do not copy these files into an app public folder.

## Find parts screens

HTML only, under `docs/stitch/roam-fleet-app/html/`. These are layout references for Fleet maintenance → Find parts. Live numbers come from the parts routes. Reference pictures are `screenshots/FP*-stitch.png`.

| # | Screen | Stitch screen id | File | Route | Ported to | Status |
|---|---|---|---|---|---|---|
| FP1 | Pick the car | `find_parts_pick_the_car` | `html/find-parts-car.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/CarStep.tsx + apps/fleet/src/components/vehicles/find-parts/StepBar.tsx + apps/fleet/src/components/vehicles/find-parts/PartsActivityPanel.tsx + apps/fleet/src/components/vehicles/find-parts/FindPartsTab.tsx + apps/fleet/src/components/vehicles/FleetMaintenanceHub.tsx` | In progress |
| FP2 | Which one is yours? | `find_parts_which_one_is_yours` | `html/find-parts-variant.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/VariantStep.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp2Screen.tsx` | Ported |
| FP3 | What part? (v3, after picking + area cards) | `find_parts_what_part_after_picking_back_on_page` | `html/find-parts-browse.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/FindPartsStickyHeader.tsx + apps/fleet/src/components/vehicles/find-parts/PartStep.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp3Screen.tsx` | Ported — `screenshots/FP3-live.png` |
| FP3b | Area overlay open (Brakes) | `find_parts_what_part_area_overlay_open_brakes` | `html/find-parts-area-overlay.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/screens/Fp3AreaOverlay.tsx` | Ported — `screenshots/FP3b-live.png` |
| FP3c | Area overlay hover and picked | `find_parts_area_overlay_hover_and_picked_states` | `html/find-parts-area-overlay-states.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/screens/Fp3AreaOverlay.tsx` | Ported — `screenshots/FP3c-live.png` |
| FP3d | Area overlay part not on file | `find_parts_area_overlay_part_not_on_file` | `html/find-parts-area-not-on-file.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/screens/Fp3AreaOverlay.tsx` | Ported — `screenshots/FP3d-live.png` |
| FP12b | Phone area bottom sheet | `find_parts_phone_390px_area_bottom_sheet` | `html/find-parts-phone-area-sheet.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/screens/Fp3AreaOverlay.tsx` | Ported — `screenshots/FP12b-live.png` |
| FP4 | Which side? (v2) | `find_parts_which_side` | `html/find-parts-position.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/FindPartsStickyHeader.tsx + apps/fleet/src/components/vehicles/find-parts/PositionStep.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp4Screen.tsx` | In progress — `screenshots/FP4-live.png` |
| FP5 | Results, information only (v2) | `find_parts_results_information_only` | `html/find-parts-results.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/FindPartsStickyHeader.tsx + apps/fleet/src/components/vehicles/find-parts/ResultsView.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp5Screen.tsx` | In progress — `screenshots/FP5-live.png` |
| FP6 | Part detail drawer | `find_parts_part_detail_drawer` | `html/find-parts-detail.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/PartDetailDrawer.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp6Screen.tsx` | Ported |
| FP7 | Request a quote | `find_parts_request_a_quote` | `html/find-parts-quote.html` | `find-parts` | — | Deferred — sales |
| FP8 | Not on file yet, ask Roam (v2) | `find_parts_not_on_file_yet_ask_roam` | `html/find-parts-request.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/FindPartsStickyHeader.tsx + apps/fleet/src/components/vehicles/find-parts/RequestPartPanel.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp8Screen.tsx` | In progress — `screenshots/FP8-live.png` |
| FP9 | Car not linked yet | `find_parts_car_not_linked_yet` | `html/find-parts-link-car.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/LinkCarPanel.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp9Screen.tsx` | Ported |
| FP11 | Loading, error, no permission | `find_parts_loading_error_no_permission` | `html/find-parts-states.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/FindPartsTab.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp11Screen.tsx` | In progress |
| FP12 | Phone 390 px, what part + not on file (v2) | `find_parts_phone_390px_what_part_not_on_file` | `html/find-parts-phone.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/ResultsView.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp12Screen.tsx` | In progress — `screenshots/FP12-live.png` |
| FP13 | Your requests with timeline | `find_parts_your_requests_with_timeline` | `html/find-parts-requests-timeline.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/ActivityView.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp13Screen.tsx + apps/fleet/src/components/vehicles/find-parts/findPartsViewModels.ts` | In progress |
| FP14 | Now on file notice + Results chip | `find_parts_now_on_file_notice_results` | `html/find-parts-now-on-file.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/screens/FpNowOnFileNotice.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp5Screen.tsx` | In progress |
| FP15 | Request sent + daily limit | `find_parts_request_sent_daily_limit` | `html/find-parts-request-sent-limit.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/RequestPartPanel.tsx + apps/fleet/src/components/vehicles/find-parts/screens/Fp8Screen.tsx` | In progress |
| FP16 | Phone · requests + notice | `find_parts_phone_390px_requests_notice` | `html/find-parts-phone-requests.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/screens/Fp16Screen.tsx + apps/fleet/src/components/vehicles/find-parts/screens/FpNowOnFileNotice.tsx` | In progress |

## Inventory & asset management screens

HTML under `docs/stitch/roam-fleet-app/inventory/<folder>/code.html`. Design system: `inventory/fleet_operational_engine/DESIGN.md`. Live route: `vehicle-operations/inventory`.

| # | Screen | Stitch folder | Ported to | Status |
|---|---|---|---|---|
| IN1 | Overview | `inventory_asset_management_overview` | `apps/fleet/src/components/inventory/screens/In1Overview.tsx + apps/fleet/src/components/inventory/InventoryPage.tsx + apps/fleet/src/components/inventory/InventoryTabs.tsx` | Ported |
| IN2 | Stock | `inventory_asset_management_stock` | `apps/fleet/src/components/inventory/screens/In2Stock.tsx + apps/fleet/src/components/inventory/StockRowMenu.tsx` | Ported |
| IN3 | Item details drawer | `inventory_asset_management_item_details_drawer` | `apps/fleet/src/components/inventory/screens/In3ItemDrawer.tsx` | Ported |
| IN4 | Receive stock | `inventory_asset_management_receive_dialog` | `apps/fleet/src/components/inventory/screens/In4ReceiveDialog.tsx` | Ported |
| IN5 | Issue to cars | `inventory_asset_management_issue_dialog` | `apps/fleet/src/components/inventory/screens/In5IssueDialog.tsx` | Ported |
| IN6 | Vehicle kits | `inventory_asset_management_vehicle_kits_tab` | `apps/fleet/src/components/inventory/screens/In6VehicleKits.tsx` | Ported |
| IN7 | Kit template editor | `inventory_asset_management_kit_template_editor` | `apps/fleet/src/components/inventory/screens/In7KitTemplateEditor.tsx` | Ported |
| IN8 | Assets | `inventory_asset_management_assets_tab` | `apps/fleet/src/components/inventory/screens/In8Assets.tsx` | Ported |
| IN9 | Asset page | `inventory_asset_management_asset_page` | `apps/fleet/src/components/inventory/screens/In9AssetPage.tsx` | Ported |
| IN10 | Movements | `inventory_asset_management_movements_tab` | `apps/fleet/src/components/inventory/screens/In10Movements.tsx` | Ported |
| IN11 | Purchasing | `inventory_asset_management_purchasing_tab` | `apps/fleet/src/components/inventory/screens/In11Purchasing.tsx` | Ported |
| IN12 | Counts | `inventory_asset_management_counts_tab` | `apps/fleet/src/components/inventory/screens/In12Counts.tsx` | Ported |
| IN13 | Alerts | `inventory_asset_management_alerts_tab` | `apps/fleet/src/components/inventory/screens/In13Alerts.tsx` | Ported |
| IN14 | Move / Return / Write off | `inventory_asset_management_transfer_return_write_off_dialog` | `apps/fleet/src/components/inventory/screens/In14CustodyDialog.tsx` | Ported |
| IN15 | Vehicle Detail — Kit & equipment card | `vehicle_detail_kit_equipment_panel_5179kz` | `apps/fleet/src/components/inventory/screens/In15VehicleKitCard.tsx + apps/fleet/src/components/vehicles/detail/VehicleDetailProfileTab.tsx` | Ported |
| IN16 | First-time setup | `inventory_asset_management_first_time_setup` | `apps/fleet/src/components/inventory/screens/In16FirstTimeSetup.tsx` | Ported |
| IN17 | States | `inventory_asset_management_states_edge_cases` | `apps/fleet/src/components/inventory/screens/In17States.tsx` | Ported |
| IN18 | Phone (390px) | `inventory_asset_management_phone_390px_mobile_view` | `apps/fleet/src/components/inventory/screens/In18Phone.tsx` | Ported |

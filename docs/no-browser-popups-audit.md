# No browser pop-ups — audit

**Rev 1 · 5 Nov 2026 · Status: OPEN.** Goal: no app ever shows a browser pop-up ("localhost says…" / "roam… says…"). Every confirm, question and notice is an in-app overlay or message that matches the app's design, in light and dark.

Found 5 Nov: **86 browser pop-ups in 12 apps** — 62 confirms, 20 text prompts, 4 alerts. (Add parts Cancel is already fixed.)

## Fix

| # | What | Fix |
|---|---|---|
| P1 | No shared in-app replacement exists | In `packages/ui`, build `useConfirm()` (on `alert-dialog.tsx`: title, text, cancel button, action button — red when it deletes or removes) and `usePromptDialog()` (same dialog with a text box, a label, required/optional, and an optional URL check). Every app uses these two (add `@roam/ui` to `packages/dash-admin`, the only one without it) |
| P2 | `confirm(...)` — 62 places | Replace each with `useConfirm()`; keep the same wording as the old pop-up; the action only runs after the action button |
| P3 | `prompt(...)` — 20 places | Replace each with `usePromptDialog()`; when one action asks two questions in a row (e.g. Find parts exclusion: reason, then source link), use one dialog with both fields |
| P4 | `alert(...)` — 4 places | Replace with the app's toast (`sonner`); in Roam Plug, which has no toast, use an in-page message banner |
| P5 | Nothing stops new ones | Add a CI check that fails when `window.confirm`, `window.alert`, `window.prompt` or bare `confirm(` / `alert(` / `prompt(` appears in `apps/` or `packages/` source (tests excluded) |

Done-test: the P5 check passes with zero hits; each app builds; a Playwright test per app opens one replaced confirm and one replaced prompt and checks no browser dialog fires (`page.on('dialog')` never called).

## Every place to change

**apps/admin**
- `src/components/admin/accounting/DominionVendorsPanel.tsx:158` confirm
- `src/components/admin/accounting/DominionVendorsPanel.tsx:243` confirm
- `src/components/admin/api-center/OverviewTab.tsx:192` prompt
- `src/components/admin/fuel/SilentStationAttachPanel.tsx:403` confirm
- `src/components/admin/gct/GctRemittancePage.tsx:71` confirm
- `src/components/admin/matching-brain/sections/WaveDispatchSection.tsx:48` confirm
- `src/components/admin/parts-database/find-parts/PartDetailDrawer.tsx:114` prompt
- `src/components/admin/parts-database/find-parts/PartDetailDrawer.tsx:116` prompt
- `src/components/admin/parts-database/full-database/FullDatabaseDrawer.tsx:447` confirm
- `src/components/admin/parts-database/full-database/FullDatabaseTab.tsx:193` confirm
- `src/components/admin/parts-database/full-database/FullDatabaseTab.tsx:206` confirm
- `src/components/admin/parts-sourcing/CatalogQualityPage.tsx:709` confirm
- `src/components/admin/parts-sourcing/PartsSourcingManager.tsx:551` confirm
- `src/components/admin/parts-sourcing/PartsSourcingManager.tsx:654` confirm
- `src/components/admin/parts-sourcing/PartsSourcingManager.tsx:710` confirm
- `src/components/admin/parts-sourcing/PartsSourcingManager.tsx:788` confirm
- `src/components/admin/parts-sourcing/PartsSourcingManager.tsx:856` confirm
- `src/components/admin/platforms/PlatformsPage.tsx:381` confirm
- `src/components/admin/platforms/PlatformsPage.tsx:394` prompt
- `src/components/admin/station-database/DrawerLocation.tsx:166` prompt
- `src/components/admin/station-database/StationBulkBar.tsx:57` prompt
- `src/components/admin/vehicle-catalog/VehicleAutoMatchTabs.tsx:328` confirm
- `src/components/admin/vehicle-catalog/VehicleAutoMatchTabs.tsx:700` prompt
- `src/components/admin/vehicle-catalog/VehicleAutoMatchTabs.tsx:709` prompt
- `src/components/admin/world-maps/levels/BorderEditor.tsx:158` confirm

**apps/dash-courier**
- `src/pages/delivery/ShopAndPickPage.tsx:53` prompt
- `src/pages/profile/HelpSupportPage.tsx:53` confirm

**apps/dash-customer**
- `src/pages/AccountPage.tsx:49` confirm

**apps/dash-merchant**
- `src/components/account/EditProfileView.tsx:70` prompt
- `src/components/account/PromotionsView.tsx:110` prompt
- `src/components/account/TeamMembersView.tsx:182` confirm
- `src/components/menu/EditItemView.tsx:383` confirm

**apps/driver**
- `src/components/home/FleetStartTripLauncher.tsx:144` confirm
- `src/components/offline/OfflineSyncManager.tsx:22` alert
- `src/components/offline/OfflineSyncManager.tsx:31` confirm
- `src/components/trips/ReportGenerator.tsx:64` alert

**apps/enterprise**
- `src/app/team/EnterpriseTeamPage.tsx:328` confirm

**apps/fleet**
- `src/components/admin/api-center/OverviewTab.tsx:192` prompt
- `src/components/driver-portal/DriverDashboard.tsx:465` confirm
- `src/components/drivers/DriversPage.tsx:858` confirm
- `src/components/fleet-financials/CloseWeekUberReimportDialog.tsx:189` confirm
- `src/components/fuel/reconciliation/StopToStopTripWindowSheet.tsx:144` confirm
- `src/components/imports/ImportsPage.tsx:961` confirm
- `src/components/imports/ImportsPage.tsx:978` confirm
- `src/components/inventory/screens/hooks/useIn9AssetPageForm.ts:191` confirm
- `src/components/offline/OfflineSyncManager.tsx:27` confirm
- `src/components/toll-tags/reconciliation/ReconciliationWizard.tsx:139` alert
- `src/components/trips/ReportGenerator.tsx:64` alert
- `src/components/vehicles/VehiclesPage.tsx:393` confirm
- `src/components/vehicles/expenses/FixedExpensesManager.tsx:80` confirm
- `src/components/vehicles/odometer/UpdateOdometerDialog.tsx:55` confirm
- `src/components/wallet/PaymentMethodsTab.tsx:127` confirm
- `src/components/wallet/PayoutTab.tsx:118` confirm
- `src/utils/commitUberImportFromFiles.ts:385` confirm
- `src/utils/fillPlausibilityGate.ts:10` confirm
- `src/utils/fillPlausibilityGate.ts:18` confirm

**apps/plug**
- `src/shell/actions.ts:707` confirm

**apps/rides-passenger**
- `src/pages/AddTrustedContactsPage.tsx:96` confirm
- `src/pages/EmergencyAssistancePage.tsx:119` confirm
- `src/pages/EmergencyAssistancePage.tsx:160` confirm

**apps/rush-command**
- `src/components/account/EditProfileView.tsx:70` prompt
- `src/components/account/PromotionsView.tsx:110` prompt
- `src/components/account/TeamMembersView.tsx:194` confirm
- `src/components/menu/EditItemView.tsx:337` confirm
- `src/components/venue-ops/PrepStationsPanel.tsx:105` confirm

**packages/dash-admin**
- `src/components/BusinessTypeMetadataPanel.tsx:79` confirm
- `src/pages/inhouse/InHouseMenuEditor.tsx:459` prompt
- `src/pages/markets/MarketsPage.tsx:2382` confirm
- `src/pages/markets/MarketsPage.tsx:2739` confirm
- `src/pages/markets/PlatformExclusionsPanel.tsx:79` confirm
- `src/pages/pricing/PricingHubPage.tsx:789` confirm
- `src/pages/remittance/RemittanceDeskPage.tsx:309` prompt
- `src/pages/remittance/RemittanceDeskPage.tsx:699` prompt
- `src/pages/remittance/RemittanceDeskPage.tsx:717` confirm
- `src/pages/remittance/RemittanceDeskPage.tsx:858` prompt
- `src/pages/remittance/RemittanceDeskPage.tsx:868` prompt
- `src/pages/remittance/RemittanceDeskPage.tsx:872` prompt

**packages/platform-ops-ui**
- `src/components/accounting/ExpenseCategoriesManager.tsx:89` confirm
- `src/components/accounting/VendorDatabaseManager.tsx:141` confirm
- `src/components/accounting/VendorDatabaseManager.tsx:229` confirm
- `src/database/trip-ledger/TripLedgerExport.tsx:157` confirm
- `src/stations/TransactionReviewWizard.tsx:777` confirm
- `src/toll/TollDatabaseView.tsx:58` confirm
- `src/toll/TollDatabaseView.tsx:390` confirm
- `src/toll/TollInfoPage.tsx:867` confirm
- `src/toll/VerifiedTollPlazasTab.tsx:263` confirm

## Rules

- Same words as the old pop-up unless they contain database terms — then plain words.
- Light and dark must both be readable.
- Do not change what each action does — only how it asks.

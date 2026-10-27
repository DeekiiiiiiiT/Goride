# Stitch project: Dominion Redesign

- **Project id:** `7083594865949473827`
- **Design system:** Dominion (`assets/16242062400491894691`)
- **Shell screen:** `d2798e5c0de74b93857cc67b7b940b23`

HTML lives in `docs/stitch/dominion-redesign/html/` only. Do not copy these files into an app `public/` folder.

The five place screens below are the canonical Plug designs, confirmed in Stitch on 26 Oct 2026. Plug still holds the originals. Fake contributor names, trust scores, OCR scores, and mesh widgets are not to be built. The new shell is S1.

Status meanings: `Final — do not touch` (D1–D5), `Ported` (passes stitch-fidelity + PNG), `Not ported` (work remaining), `Superseded by S7 — do not build`.

| # | Screen | Stitch id | HTML file | Dominion page id | React file | Status |
|---|---|---|---|---|---|---|
| D1 | Places review queue | `19c9df8ede1f4635be7f188be5c24f94` | `html/D1-review-queue.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Final — do not touch. Fake names, scores, and Fleet export removed. |
| D2 | Review one place | `6348f0f2c36149fa9bb2cc9e8fa39577` | `html/D2-review-item.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Final — do not touch. Live inside Places review, This place. |
| D3 | Merge into an existing place | `a87e5505779043e2a48a64a6f6266d2e` | `html/D3-merge.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Final — do not touch. Live as the merge window. |
| D4 | Coverage overview | `7da088e95e1e4fe088a2add010bf9bd3` | `html/D4-coverage.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Final — do not touch. Live as Parish coverage. The Jamaica border map stays on its own page. |
| D5 | Parish coverage table | `53ad2876cac241b1aaceeb7bbc307045` | `html/D5-parish-coverage.html` | `plug-places` | `packages/platform-ops-ui/src/places/PlacesReview.tsx` | Final — do not touch. Live as the parish table on Parish coverage. |
| S1 | App shell | `d2798e5c0de74b93857cc67b7b940b23` | `html/S1-shell.html` | all | `apps/admin/src/components/admin/AdminLayout.tsx` | Ported. Approved 26 Oct 2026. |
| S2 | Sign in and authenticator | `d8107f1d4b7c4c8bbb570fed4a8216be` | `html/S2-sign-in.html` | login | `apps/admin/src/components/admin/AdminLoginPage.tsx` | Ported. Auth and MFA stay. |
| S3 | States kit | `9f614905032a4b24ae49582568108a9e` | `html/S3-states.html` | all | `apps/admin/src/components/admin/DominionStates.tsx` | Ported. Loading, error, empty, moved, and no-access stay. |
| S4 | Overview health board | `282dc999dca64dcfbb7050e1bf24254b` | `html/S4-overview.html` | `dashboard` | `apps/admin/src/components/admin/AdminDashboard.tsx` | Ported. Quality and waiting cards stay. |
| S5 | Record editor drawer | `23f682ed913f4930b9c446cd902aa284` | `html/S5-drawer.html` | every master list | `apps/admin/src/components/admin/DominionRecordDrawer.tsx` | Ported. Reason-to-save, draft, and publish stay. |
| S6 | Master list | `8923fc739cb14e808622165b97bafd8c` | `html/S6-master-list.html` | list pages | `apps/admin/src/components/admin/DominionMasterList.tsx` | Ported. Search, filters, and bulk actions stay. |
| S7 | Section home | `81bb7dd4dc394b56a81ea6acaed3d535` | `html/S7-section-home.html` | `vehicles-home` | `apps/admin/src/components/admin/DominionHomes.tsx` | Ported. Same layout on Places, Fuel, Tolls, and Tax homes. Counts stay blank until the live source answers. |
| S8 | Vehicle catalog and detail | `d955104c499d440581c90e8a17bfc573` | `html/S8-vehicle-catalog.html` | `motor-vehicles` | `apps/admin/src/components/admin/vehicle-catalog/VehicleCatalogManager.tsx` | Ported. Search, CSV import, edit, delete, and the eye spec view stay. |
| S9 | Platforms and engines | `9783a6e6732d4bbd8a0e0864ff0d949a` | `html/S9-platforms-engines.html` | `platforms-engines` | `apps/admin/src/components/admin/parts-sourcing/PlatformsEnginesPage.tsx` | Ported. Family review, share-body decision, and reload stay. |
| S10 | Pending catalog | `ef714e333eec49e382bcc40f69bc5293` | `html/S10-pending-catalog.html` | `pending-motor-vehicles` | `apps/admin/src/components/admin/vehicle-catalog/PendingVehicleCatalogManager.tsx` | Ported. Approve, link, reject, and request info stay. |
| S11 | Maintenance templates | `ede07129a5f14d77875ed775013da7ec` | `html/S11-maintenance-templates.html` | `maintenance-templates` | `apps/admin/src/components/admin/maintenance-templates/MaintenanceTemplatesManager.tsx` | Ported. Categories, tasks, and KV migrate stay. |
| S12 | Parts and suppliers | `b61515e096084a9a998447bd94b1438d` | `html/S12-parts-suppliers.html` | `parts-catalog` | `apps/admin/src/components/admin/parts-sourcing/PartsSourcingManager.tsx` | Ported. Catalog and supplier price modes stay. |
| S13 | Data quality | `e0aaec8b37924b6087208fd2632b5bbe` | `html/S13-data-quality.html` | `catalog-quality` | `apps/admin/src/components/admin/parts-sourcing/CatalogQualityPage.tsx` | Ported. Coverage, demand refresh, and emergency stop stay. |
| S14 | World map viewer | `579778d10ceb40fbaa1da40705113cde` | `html/S14-world-map.html` | `world-jamaica` | `apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx` | Ported. Country, parish, town, and community levels stay on this page. |
| S15 | Places and pins | `b3e2ccc77e0c4bb2ab51ff25d19e1b96` | `html/S15-places-pins.html` | `world-places` | `apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx` | Ported. Named pins stay here. Places review stays on D1–D5. |
| S16 | Map imports | `b49f74abedeb4478b1d20571a17c7348` | `html/S16-map-imports.html` | `world-imports` | `apps/admin/src/components/admin/world-maps/WorldMapsPage.tsx` | Ported. Import runs and world-quality results stay on this page. |
| S17 | Station database | `f0b631aa7be947e8b0723b21450816ba` | `html/S17-station-database.html` | `fuel-stations` | `packages/platform-ops-ui/src/stations/StationDatabaseView.tsx` | Ported. Station list, verified, and resolution stay. |
| S18 | Fuel prices | `b8c603a5127744e887b443ff58b9412d` | `html/S18-fuel-prices.html` | `fuel-prices` | `apps/admin/src/components/admin/fuel-prices/FuelPricesPage.tsx` | Ported. Petrojam wholesale sync stays. |
| S19 | Station analytics | `4016415050784fcdbbaa4a9e516fa47b` | `html/S19-station-analytics.html` | `fuel-analytics` | `apps/admin/src/components/admin/StationHealth.tsx` | Ported. Station list health only. Customer fuel spending stays in Fleet. |
| S20 | JAA card catalogue | `f213ca85e6014903b9a070adf73b86ba` | `html/S20-jaa-cards.html` | `fuel-jaa-cards` | `packages/platform-ops-ui/src/fleet-customer/GasCardsPage.tsx` | Ported. Platform-scoped programs and master CSV stay. |
| S21 | Toll database | `e1395d7f82344dcab17453c7d3a98f4d` | `html/S21-toll-database.html` | `toll-stations` | `packages/platform-ops-ui/src/toll/TollDatabaseView.tsx` | Ported. Plazas on TollDatabaseView; rates and classes on TollInfoPage. |
| S22 | Vendors and requests | `c12e73466d9e4131abe8e5e814f66938` | `html/S22-vendors-requests.html` | `vendor-database` | `apps/admin/src/components/admin/accounting/AccountingCatalogManager.tsx` | Ported. Pending requests stay on PendingVendorRequestsManager. |
| S23 | GCT engine, rates, knowledge | `99a841f692104aeb9e98c442c92c5244` | `html/S23-gct-engine.html` | `gct-engine` | `apps/admin/src/components/admin/gct/GctEnginePage.tsx` | Ported. Rates and knowledge pages share this marker. |
| S24 | Engine console | `9f3ed86902e5469baf7d6f8ced78c75e` | `html/S24-engine-console.html` | `fuel-brain` | `apps/admin/src/components/admin/fuel-brain/FuelBrainPage.tsx` | Ported. Same marker on TollBrainPage and MatchingBrainPage. |
| S25 | Apps | `89e9776a37054ae494498050fa6f5721` | `html/S25-apps.html` | `apps-directory` | `apps/admin/src/components/admin/AppsDirectory.tsx` | Ported. Live consumers list with hardcoded fallback. |
| S26 | Data API | `03467b90d13346279b0c1ab439350075` | `html/S26-data-api.html` | `api-center` | `apps/admin/src/components/admin/api-center/ApiCommandCenter.tsx` | Ported. Overview, usage, Supabase, keys, budgets, call log, billing tabs stay. |
| S27 | Change requests | `71dc2ef38efb4ce087bf604166dbc4e5` | `html/S27-change-requests.html` | `change-requests` | `apps/admin/src/components/admin/ChangeRequestInbox.tsx` | Ported. Links existing queues. Does not merge them. |
| S28 | Staff and roles | `6f4a15ed7e5042329e4453061bf33505` | `html/S28-staff-roles.html` | `platform-team` | `apps/admin/src/components/admin/PlatformTeam.tsx` | Ported. Owner only. |
| S29 | Activity log | `3f142d7aaf4b4ae5925baae600d7597f` | `html/S29-activity-log.html` | `activity-log` | `apps/admin/src/components/admin/ActivityLog.tsx` | Ported. Owner only. Reads `/admin/audit-log`. |
| S30 | Platform Ops | `2516f2a73eaf4d33b1d5d21aa61604b7` | `html/S30-platform-ops.html` | `platform-ops` | `apps/admin/src/components/admin/PlatformOpsHome.tsx` | Ported. Links station resolution, places review, catalog quality, and map quality. |
| S31 | Global settings | `2b5c794524dc4c8aaa4c67a8e25842a0` | `html/S31-global-settings.html` | `global-settings-general` | `packages/admin-core/src/settings/GlobalPlatformSettingsPage.tsx` | Ported. General, security, and danger tabs stay. |
| S32 | GCT registrations | `fbf8c52f2d084548bcd49d5121bac668` | `html/S32-gct-registrations.html` | `gct-entities` | `apps/admin/src/components/admin/gct/GctEntitiesPage.tsx` | Ported. Owner only. |
| S33 | Ledger | `18ac5b8fa8c24887bc95b30f1283b9a0` | `html/S33-ledger.html` | `gct-ledger` | `apps/admin/src/components/admin/gct/GctLedgerPage.tsx` | Ported. Owner only. |
| S34 | Remittance | `3f31fb6d053542b798ef7d3da76c4f29` | `html/S34-remittance.html` | `gct-remittance` | `apps/admin/src/components/admin/gct/GctRemittancePage.tsx` | Ported. Owner only. |
| — | Dominion Vehicles Content Area (draft) | `2a625fdca609418f988ee8a290e9695e` | — | — | — | Superseded by S7 — do not build |

`screens.json` lists every Dominion Redesign screen id, plus the five Plug place screens above. A Ported or Final row must name an HTML file, and its React file must contain `// Stitch: dominion-redesign/<id>`.

Every S-screen through S34 is designed. Do not build a page that has no row here.

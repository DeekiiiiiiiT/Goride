# Roam Dominion — Enterprise Rebuild Audit (open items only)

**Rev 4 · 2026-10-26** · Audit only, no code changed. Finished items are left out.

**Rule:** Dominion is the brain. It holds shared reference data (vehicles, parts, stations, fuel prices, tolls, maps, GCT rules, vendors), runs the shared engines, manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records.

**Status:**
- Every finding from Rev 3 (N-1 to N-4) is fixed and was verified live:
  - `/v1/changes` returns 200.
  - The change log has 3 rows (station, toll plaza, vendor), each with an actor and a reason.
  - Maps scores 100.
  - The station counts show 206 / 56.
  - Plug and Fleet now stamp `last_sync_at`.
  - Signed-out visitors (`anon`) can no longer run `score_master_data`.
  - `/fleet-admin/customers` exists.
- Still open from the rebuild plan: vehicle catalog and maintenance-template saves still go through fleet-core; screens S8–S18 and S20–S34 are the working pages inside the new menu, not new drawings; deletions wait until 25 Nov 2026.

---

## 1. Open findings

| ID | Sev | Finding | Fix |
|---|---|---|---|
| **P-1** | High | Recorded in git on 26 Oct 2026 (`a7d42d82`). | Done. |
| **P-2** | High | Production migration history now includes `20261026230000` through `20261026233000`. | Done. Marked applied. The SQL was not run again. |

## 2. Exit checks

| Check | Result |
|---|---|
| fleet_admin customers | Pass, 26 Oct 2026. The Fleet admin at localhost:3000/admin shows Fleet customers with 2 organizations, both Active: Play Store Fleet and Deeki T. |
| Other product admins | Deferred. Owner said to leave Rush, Driver, and Enterprise admin checks for later and focus on Dominion. |

## 3. On or after 2026-11-25

Delete these from Dominion, then rerun reachability, typecheck and build:
- **Screens behind "moved" notices:**
  - `CustomerAccounts`, `TeamMembers`, `OrganizationDetail`
  - `product-users/*`, `product-overviews/*`, `roam-dash/*`, `components/database/*`
  - `UnifiedLedgerFeed`, `fuel-cost-analytics`, `fuel-evidence-bridge`, `pages/TollLiveMonitorPage`
  - the Fleet and Enterprise `PlatformSettings` segments
  - their `MOVED_NOTICES` entries
- The keep-alive imports in `AdminJaaGasCardsPage.tsx`.
- **Leftovers:**
  - `SETTINGS_CHILDREN`, `ROAM_*_CHILDREN`, `SECTION_META.businessSegments`
  - the toll `LEGACY_PAGE_REDIRECTS`
  - `driverPlatformService.ts`, unused `components/ui/*`, `styles/globals.css`
- Fleet-core `/admin/*` routes that only Dominion called. Check the product admins first.
- `apps/admin/CLEANUP_AFTER_MIGRATION.md`.

## 4. Backend next phase

1. Parts, pending vehicles, toll rates, vendor records, and expense categories save through the catalog. Vehicle catalog create, edit, and delete still save through fleet-core, with the catalog permission check already on those routes. Moving that validator would copy the live rules and risk the catalog.
2. Per-action permissions are on the catalog saves, including category edits (`vendors.edit`).
3. Fleet and Driver catalog reads use `/v1` and send `x-roam-app`. Rush and Haul already stamp sync on sign-in.
4. The two station-list scans read the station table. `payload_json` stays on stations, plazas, and vendors. The typed columns do not yet hold contact, amenities, parish text, or plaza direction. Dropping the column would erase those fields.
5. The live catalog privacy check passed.

---

# Part B — Full redesign of Dominion

## 5. What exists in Stitch today (checked through the Stitch API)

- The Dominion screens were made inside the **Roam Plug** project (`7833067736952351487`), not in a project of their own.
- There is also an old, empty **ROAM DOMINION** project (`2140064615552965419`, toll geofence work only). Don't reuse it, because the name causes confusion.
- Plug holds **12 Dominion desktop screens**, which are really **5 designs plus duplicates**.

| Design | Use this one (canonical) | Duplicates (keep in Stitch, don't build) |
|---|---|---|
| D1 Places Review queue (table, bulk bar, hotkeys) | `19c9df8ede1f4635be7f188be5c24f94` | `f7ee894fb03249b4a6d14763b0907ace` |
| D2 Review one place (map + decision panel) | `6348f0f2c36149fa9bb2cc9e8fa39577` | `c7e8db7d100d49b59102044c44348ec0`, `1e1a4a415fa94a1cb4af8897bc211567`, `55b3833ab82040b991100b2d808e2310`, `830c56ee3b5c4c4f9162b04688391c0a` |
| D3 Merge into an existing place (modal) | `a87e5505779043e2a48a64a6f6266d2e` | none |
| D4 Coverage overview (parish map, approvals chart, registry) | `7da088e95e1e4fe088a2add010bf9bd3` | `0ec1e73dc28b4ad8a6c2054340b3e48c`, `bef46102e2454929a49197f9995b2533` |
| D5 Parish coverage table | `53ad2876cac241b1aaceeb7bbc307045` | none |

Canonical = the version in the screenshots you shared. **Confirm this in Stitch before import.**

**Problems inside these screens:**

1. **Four different menus and names.** The screens use "Fleet Operations Console", "Admin Operations Console", "Admin Infrastructure Portal" and "Geospatial Registry Console", each with different sidebar items. None matches Dominion's real menu.
   - *Rule:* the **content area is built exactly as designed**. The sidebar and top bar come from **one** shared shell screen (S1 below), built to the real menu.
2. **"Export Fleet Data" and "Fleet Operations Console"** break the Dominion rule. Fleet data lives in the Fleet admin. Remove both.
3. **Widgets with no real data behind them.** The place tables hold `distinct_users`, `best_accuracy_m`, `suggestion`, photos, `mock_location` and anonymous `user_hash`. They have:
   - no contributor names, levels or "trust %" (Plug keeps contributors anonymous by design);
   - no OCR score;
   - no "assigned to";
   - no phone or hours;
   - no county.

   For each widget, decide: build the data, show it as "Not available yet", or drop it. **Never ship made-up numbers.** The affected widgets:
   - Top Contributors and Scout Leaderboards
   - OCR 99% and Trust Score
   - Assigned to Marcus V.
   - Batch Sync and Batch Re-index
   - Live Mesh Sync
   - Mesh Telemetry and Firmware lines
4. **Fake sample content.** The pump photo shows BBD prices. Replace sample data with real Jamaican data or neutral placeholders.

**Data that *is* real and ready:**

| Widget | Source |
|---|---|
| Parish counts | `places.coverage_count` (`pcode`, `kind`, `verified_count`, `pending_count`) |
| Evidence pins | `places.place_evidence` |
| Decisions | `places.place_change_proposal.status`, `decided_at`, which also gives approvals-per-day |
| Prices | `places.price_current` |
| Parish shapes | `geo.boundaries` |

## 6. New Stitch project: "Dominion Redesign"

1. **Create the project** "Dominion Redesign" (desktop, 1440 wide).
2. **Design system:** take the tokens from D4 (`7da088e9…`): navy sidebar, blue primary, green "approve", amber "warning", red "reject", Inter, and mono for IDs and coordinates. Save them as the project design system so every new screen matches. The admin app is on **Tailwind 4**, while Stitch exports a Tailwind 3 `tailwind.config`, so convert the tokens to an `@theme` block once.
3. **Copy the 5 canonical screens** from Roam Plug into it, using `stitch-mcp upload` with the pulled HTML. The originals stay in Roam Plug untouched.
4. **Generate the new screens** (§7) in that project, each built on the S1 shell and the same design system.

## 7. Screens to make (beyond D1 to D5)

The list follows Dominion's real menu (`DOMINION_SECTIONS`).
- "T" = one reusable template that several pages share, so it is designed once.
- "!" = keep the existing feature: the **Vehicle Catalog eye overlay stays**.

| # | Screen | Covers page ids |
|---|---|---|
| **Wave 1 — frame** | | |
| S1 | App shell: navy sidebar with the 5 sections (Master data, Engines, Distribution, Platform, Back office), top bar, search, profile | all |
| S2 | Sign in + authenticator step | login, MFA |
| S3 | States kit (T): loading, empty, error, no access, "moved to X admin" | all |
| S4 | Overview / health board: data quality per dataset, recent changes, apps last sync, waiting queues (places, vehicles, vendors, change requests) | `dashboard` |
| S5 | Record editor drawer (T): fields, publish state (draft/published), **required "reason for change"**, history tab from the change log | every master list |
| S6 | Master list (T): filters, table, bulk bar (from D1), CSV, publish badge | the list pages below |
| **Wave 2 — Master data** | | |
| S7 | Section home (T): counts, quality score, waiting items, quick links | `vehicles-home`, `places-home`, `fuel-home`, `tolls-home`, `tax-vendors-home` |
| S8 | Vehicle catalog list ! (eye overlay kept) + vehicle detail | `motor-vehicles` |
| S9 | Platforms & engines | `platforms-engines` |
| S10 | Pending catalog approval queue (reuse the D1 pattern) | `pending-motor-vehicles` |
| S11 | Maintenance templates (list + template editor) | `maintenance-templates` |
| S12 | Parts catalog + Suppliers & prices | `parts-catalog`, `suppliers-prices` |
| S13 | Data quality report (T): failing rows per rule, fix link | `catalog-quality`, `world-quality` |
| S14 | World map viewer: Jamaica → parish → town → community drill-down with the boundary panel | `world-jamaica`, `world-parishes`, `world-towns`, `world-communities` |
| S15 | Places & pins (verified places on the map + list) | `world-places` |
| S16 | Map imports & versions (upload, diff, publish) | `world-imports` |
| S17 | Station database list + station detail (map, prices, linked place) + resolution queue | `fuel-stations` |
| S18 | Fuel prices: Petrojam weekly sheet, history chart, per-station overrides | `fuel-prices` |
| S19 | Station analytics | `fuel-analytics` |
| S20 | JAA gas card catalogue (master list only, no customer cards) | `fuel-jaa-cards` |
| S21 | Toll database: plaza list + map + rate table | `toll-stations`, `toll-info` |
| S22 | Vendors & categories + pending vendor requests (D1 pattern) | `vendor-database`, `pending-vendor-requests` |
| S23 | GCT engine, rates & classes, knowledge base | `gct-engine`, `gct-rates`, `gct-knowledge` |
| **Wave 3 — Engines, Distribution, Platform** | | |
| S24 | Engine console (T): rules, test bench (input → result), recent decisions, settings | `fuel-brain`, `toll-brain`, `toll-settings`, `matching-brain` |
| S25 | Apps directory: each app, what data it reads, last sync, version | `apps-directory` |
| S26 | Data API (T): overview, usage & costs, keys, budgets, call log, provider billing, Supabase | `api-center-*` |
| S27 | Change requests inbox + request detail (approve/reject with reason) | `change-requests` |
| S28 | Staff & roles: staff list, invite, role editor | `platform-team` |
| S29 | Activity log (filter by person, dataset, date) | `activity-log` |
| S30 | Platform Ops | `platform-ops` |
| S31 | Global settings: general, security, danger zone | `global-settings-*` |
| **Wave 4 — Back office (owner only)** | | |
| S32 | GCT registrations | `gct-entities` |
| S33 | GCT ledger | `gct-ledger` |
| S34 | Remittance & filing | `gct-remittance` |

That is 34 new screens plus the 5 existing designs. Make them wave by wave, and approve each wave in Stitch before any code.

## 8. Import rule: the Stitch screens ARE the build

Earlier imports went wrong for three reasons:
- the screens were in another project;
- nothing tied each screen to a page;
- Stitch downloads come back **wrapped in JSON** (`{"dataString": "<!DOCTYPE html>…"}`), and for screenshots the wrapped content is base64.

This process removes all three.

1. **Pull, don't redraw.**
   - For each approved screen, use the Stitch MCP (`get_screen` → `htmlCode.downloadUrl` and `screenshot.downloadUrl`).
   - Unwrap `.dataString`.
   - Save the files to `docs/stitch/dominion-redesign/html/NN-name.html` and `screenshots/NN-name.png`.
   - Never put them in an app `public/` folder, because that would deploy them.
2. **One mapping file.** `docs/stitch/dominion-redesign/README.md` holds a table with these columns: # | screen | Stitch id | HTML file | Dominion page id | React file | status. This is the same format as `docs/stitch/roam-rush-admin-design/README.md`.
3. **Translate the HTML; don't reinvent it.**
   - Each React page is a direct conversion of its HTML: the same layout, sections, order, wording and Tailwind tokens.
   - Swap only the sample data for real data and the sidebar for S1.
   - Put this marker on the first line of each page file: `// Stitch: dominion-redesign/<screen id>`.
4. **No unrequested screens.** If a page needs a screen that isn't in the table, stop and design it in Stitch first.
5. **Keep what works.** Replace old pages page by page behind the same page ids, so bookmarks and permissions keep working. Keep the Catalog eye overlay.
6. **CI guard:** add `scripts/stitch-contract.mjs`. It fails when:
   - a README row has no HTML file;
   - a mapped React file lacks its marker;
   - a finished-wave page id has no row.
7. **Sign-off per screen:** put the live page at 1440 wide next to the Stitch PNG. It passes only when they match.

**Paste-ready instruction for Cursor:**
> Build Dominion screen `<NN>` from `docs/stitch/dominion-redesign/html/<NN>.html` exactly. Keep its layout, sections, order, text and styling. Replace only sample data with the real data named in the README row, and use the shared shell S1 instead of the screen's own sidebar. Do not create, add or restyle anything not in that HTML. Add `// Stitch: dominion-redesign/<id>` at the top of the page file and update the README status.

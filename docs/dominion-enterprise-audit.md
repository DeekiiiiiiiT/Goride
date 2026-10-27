# Roam Dominion — Enterprise Rebuild Audit (open items only)

**Rev 6 · 2026-10-26** · Audit only, no code changed. Finished items are left out. Every fix below is already decided; nothing waits for owner approval.

**Rule:** Dominion is the brain. It holds shared reference data, runs the shared engines, manages Roam staff, keeps Roam's GCT books in an owner-only Back office, and publishes data to the apps. It never lists customer records.

**Status (checked 26 Oct 2026):**
- The Stitch project **Dominion Redesign** (`7083594865949473827`) has all 35 screens: S1 to S34, plus an extra one.
- The HTML for all of them, and screenshots for S1 to S34, are in `docs/stitch/dominion-redesign/`.
- The S7 link is fixed (`81bb7dd4…`).
- Old customer links now show the "moved" screen.
- 14 Fleet-core routes that only Dominion used have been removed. No product admin calls them.
- Typecheck shows 17 errors, under the baseline of 20.
- The contract check passes.

**But:** most pages are not yet the Stitch design, and none of this work is committed or deployed. The live site still runs the S1 to S7 build.

---

## 0. Do not touch: the Dominion places screens (D1 to D5)

D1 to D5 (Places review queue, Review one place, Merge, Coverage, Parish table) are **Dominion screens**. Stitch happened to save them in the Roam Plug project, but they belong to Dominion and are already built into Dominion (`PlacesReview.tsx`).

**They are final. Do not redesign, rebuild, re-port or restyle them**, even where the page doesn't match the HTML line for line. Leave them out of every check and porting pass below. In the README, set their status to `Final — do not touch`.

Also leave alone, because they are already ported: **S1** shell, **S7** section homes, and **S8** vehicle catalog (the eye spec view stays).

## 1. Open findings

| ID | Sev | Finding | Fix |
|---|---|---|---|
| **F-1** | High | **Most pages carry the Stitch marker but not the Stitch design.** The README says "Built" for every screen, but Cursor confirmed that most pages only got the `// Stitch:` comment and a new title. I measured each page by how many of its Stitch screen's headings, column names and button labels appear in the page, and whether it still uses the old component kit (`components/ui`). The results put the pages into the three groups in §2. | Port each page in §2 from its HTML, in that order, using the rule in §3. |
| **F-2** | High | **The contract check can't tell a ported page from a marked one.** `stitch-contract.mjs` only checks that the HTML file exists and the marker is there, so it passed with about 30 unported pages. | Add `scripts/stitch-fidelity.mjs` and run it in CI after the contract. A working copy is at `C:\Users\deeki\AppData\Local\Temp\claude\c--Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride\a55a09ce-fa6b-4c99-96e1-70365e4406be\scratchpad\fidelity.mjs`. It fails any S-row under 80% label match, and any S-row that still imports `components/ui`. It skips D1 to D5. In the README, change each row's status to `Ported` or `Not ported` to match. |
| **F-3** | High | **Nothing is saved or live.** 92 files are uncommitted: the admin pages, `platform-catalog/index.ts`, the removal of the 14 Fleet-core routes, and `baseRepo.ts`. roamdominion.co still serves the old bundle. | Commit, then deploy fleet-core, platform-catalog and the admin site. Deploy each finished wave after that. |
| **F-4** | Low | The default customers link in `BusinessTypeCustomers.tsx:29` and `DatabaseManagement.tsx:25` still points at `/admin/customers`, which was just removed. Fleet admin passes its own link, so nothing breaks today. | Change the default to `/fleet-admin/customers`. |
| **F-5** | Low | Stitch also holds `2a625fdca609418f988ee8a290e9695e` ("Dominion Vehicles Content Area"), an older draft of S7. | Add a README row with status `Superseded by S7 — do not build`. |

## 2. Pages to port (D1 to D5, S1, S7 and S8 excluded)

| Group | Screens | What's wrong today |
|---|---|---|
| **A — not started** | S2 Sign-in, S11 Maintenance templates, S12 Parts and suppliers, S17 Station database, S20 JAA cards, S21 Toll database, S22 Vendors, S24 Engine console (Fuel, Toll and Matching Brain) | The old layout is still in place. Most changed by under 100 lines, label match is 22–37% (S17, S20 and S21 match the labels but kept their old layout), and S11 and S12 still import 9 old-kit pieces each. S11 must become the two-pane layout: categories on the left, tasks on the right. |
| **B — half done** | S3 States, S4 Overview, S5 Drawer, S6 Master list, S10 Pending catalog, S13 Data quality, S18 Fuel prices, S26 Data API, S29 Activity log | Label match is 50–78%, or the page still uses old-kit pieces (S10 has 6, S18 has 5, S13 has 1). |
| **C — words match, layout to check** | S9, S14, S15, S16, S19, S23, S25, S27, S28, S30, S31, S32, S33, S34 | 80–100% label match and no old kit. Compare each against its PNG and fix the layout differences. |

## 3. Porting rule (paste this into Cursor for each screen)

> Port Dominion screen `<SNN>` from `docs/stitch/dominion-redesign/html/<SNN>-*.html`, using `screenshots/<SNN>-*.png` as the picture to match. Rebuild the page's JSX so its layout, sections, order, headings, column names, buttons and styling are the HTML's. Delete the old layout and the `components/ui` imports it no longer needs. Keep every working feature listed in the README row and connect it to the new layout. Replace sample data with the real data. Use the shared shell S1, not the screen's own sidebar. Do not add, invent or restyle anything not in the HTML. **Never touch D1–D5 (the Dominion places screens), S1, S7 or S8.** When it passes `node scripts/stitch-fidelity.mjs` and matches the PNG at 1440 wide, set the README status to `Ported`.

## 4. Deferred

- Sign in with the authenticator on roam-s.co/admin, roamdriver.co/admin and roamenterprise.co/admin. You asked to leave this for later.
- **Backend:**
  - Vehicle catalog saves still go through fleet-core; the permission check is already in place.
  - `payload_json` stays until the typed columns hold contact, amenities, parish text and plaza direction.

# Store Tablet Pairing — Stitch Reference

**Project:** Roam Dash Partner App (`projects/4244471701037965477`)  
**Design system:** `assets/6024588716ea41f0a6263c2a0e2acb8e`

| # | Screen | Stitch screen ID | Status |
|---|--------|------------------|--------|
| 1 | Auth entry split | — | React `AuthEntryPage` |
| 2 | Store code entry | — | React `StoreCodeEntryPage` |
| 3 | Tablet station picker | — | React `TabletStationPickerPage` |
| 4 | Pairing success | — | React `TabletPairingSuccessPage` |
| 5 | Owner store tablets settings | — | React `StoreTabletSettingsPanel` |
| 6 | Tablet shell chrome | — | React `StoreTabletChrome` |

Reuse existing staff-ops Stitch screens: Staff Picker (#8), Enter PIN (#9), Create PIN (#10).

React implementation: `apps/dash-merchant/src/components/store-tablet/`

**PO sign-off:** [x] All 6 store-tablet screens approved (React shells match design system)

## Owner setup guide

1. Sign in as owner → **Account → Team Members**.
2. Under **Store tablets**, enable **Enable staff stations** and **Tablet PIN sign-in**.
3. Copy the pairing code or scan/copy the **Dispatch / Kitchen / Manager** QR link on each iPad.
4. On the iPad, open `partner.roamdash.co` → **Store tablet** (or use the QR link).
5. Enter the code (or skip if the link includes `code` + `station`), pick station if needed, then staff pick name + PIN each shift.
6. **Regenerate code** disconnects all tablets — use after staff turnover or a lost device.

## Regression matrix

| Scenario | Expected |
|----------|----------|
| Flags off, owner login | Legacy app, no kiosk |
| Flags on, owner login, Orders tab | Legacy kiosk (unchanged) |
| Store tablet enroll + PIN | Station view without owner login |
| Deep link `?code=&station=` | Skips code/station steps |
| Regenerate pairing code | Old devices rejected, must re-pair |
| Revoked device token | 401, prompt re-pair |
| Team invite URL | Unaffected |
| Admin portal `/admin` | Unaffected |
| Staff "No station" + PIN | Standard orders view (not counter-locked) |
| venueOpsV2 on | Operations Hub in Account; Restaurant Mgmt hides POS tab |
| venueOpsV2 store tablet picker | Disabled stations greyed out |
| prepStationsV1 kitchen + prepStation param | KDS shows only matching menu items |
| Prep station deep link `?prepStation=` | Kitchen tablet locks to prep zone |

See also `apps/dash-merchant/src/lib/partner-smoke.ts` (`VENUE_OPS_SMOKE`).

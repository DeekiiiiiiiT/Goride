# Venue Operations — Stitch Reference

**Project:** Roam Dash Partner App (`projects/4244471701037965477`)  
**Design system:** `assets/6024588716ea41f0a6263c2a0e2acb8e`  
**Model:** `GEMINI_3_1_PRO`

| # | Screen | Stitch screen ID | Device | PO sign-off |
|---|--------|------------------|--------|-------------|
| 1 | Operations Hub mobile | `1a76c0f5e9b14fb99c4615a398ad685d` | Mobile | [x] |
| 2 | Venue template picker mobile | `5b0df8b9db7141d6b92a2fdafe8d2cda` | Mobile | [x] |
| 3 | Template summary mobile | `d8428608cf9b4779a36de517ffc23723` | Mobile | [x] |
| 4 | Enabled stations toggles mobile | `ca3eacef26eb422c88127d4cd97d112e` | Mobile | [x] |
| 5 | Operations Hub desktop | `c98aa9f486e945bc91d24215e9ac2d6f` | Desktop | [x] |
| 6 | Restaurant Mgmt relocated desktop (no POS tab) | `8d43c43b08f8486a839fc046d3e04264` | Desktop | [x] |
| 7 | Team member editor — role vs station mobile | `063fcd97facd4c48baa6b6dc641a640e` | Mobile | [x] |
| 8 | Roster floor staff — display title mobile | `4c6dbdec2fe345f78dcd440f5782cda3` | Mobile | [x] |
| 9 | Store tablets panel v2 mobile | `dcb9bec53d454397b1237bef6a62e21a` | Mobile | [x] |
| 10 | Station explainer sheet mobile | `cfff3bef181d46e8ab44bc000220c334` | Mobile | [x] |
| 11 | Station picker v2 tablet | `8b85b35b751c4a5098614dd307378e64` | Tablet | [x] |
| 12 | POS not ready tablet | `9c31f8bcff564d0e875e46e9ee1c0bfd` | Tablet | [x] |
| 13 | Staff PIN picker v2 tablet | `c2c29c92c7134aa3afa622998d784bca` | Tablet | [x] |
| 14 | Pairing success v2 tablet | `70023b5b9b4c45ecbb8b2dfb3f6b04e4` | Tablet | [x] |
| 15 | POS Register step flow tablet landscape | `f67dbdca18df489eae2207b8ebc9b823` | Tablet landscape | [x] |
| 16 | Kitchen KDS tablet landscape | `8e756584db944f5099505a8f84fced82` | Tablet landscape | [x] |
| 17 | Dispatch handoff tablet landscape | `b146a0c0c75e4aa686785ae4d76cacdd` | Tablet landscape | [x] |
| 18 | Bar KDS tablet landscape | `63439743cbb143efb48a3b433d275efa` | Tablet landscape | [x] |
| 19 | Expo runner tablet landscape | `e208e9b28f984d509473f611b83a3fc7` | Tablet landscape | [x] |
| 20 | Drive-thru lane tablet landscape | `9bdfe3cc85624f5e97d8ebb99cb1489a` | Tablet landscape | [x] |
| 21 | Manager tablet landscape | `5d88f6345fbd411e9c1739cb6ed5e440` | Tablet landscape | [x] |
| 22 | Prototype v2 — flow map + link spec | `9138952009544a509c2dcc065b991c3e` · data `bc11cb5cefa646ddb3bb24b89f94472b` | Agnostic | [x] |
| 23 | This README — screen ID matrix | `design/stitch/venue-ops/README.md` | — | [x] |

## Prototype v2 navigation (screen 22)

**initScreenId:** `1a76c0f5e9b14fb99c4615a398ad685d`

**Owner setup swimlane:** `1a76c0f5` → `5b0df8b9` → `d8428608` → `ca3eacef` → `c98aa9f4` → (`8d43c43b` · `063fcd97` · `dcb9bec5`) · `cfff3bef` sheet from `ca3eacef`

**Tablet kiosk swimlane:** `dcb9bec5` → `8b85b35b` → `c2c29c92` → `70023b5b` → station (`f67dbdca` · `8e756584` · `b146a0c0` · `63439743` · `e208e9b2` · `9bdfe3cc` · `5d88f634`) · `9c31f8bc` if POS disabled · `5d88f634` → `1a76c0f5` Operations Hub

React implementation: `apps/dash-merchant/src/components/venue-ops/`, `hooks/useVenueOps.ts`, `pages/staff-ops/StationPlaceholderPage.tsx`, `lib/venue-ops-presets.ts`.

**Station label contract:** DB value `counter` displays as **Dispatch** in all UI.

**PO sign-off:** [x] All 23 Venue Ops Stitch deliverables approved

# Roam Fleet · Fleet maintenance → Find parts tab — audit (Rev 6, 31 Oct 2026)

**This is the only doc for this work.** It lists open items only.
- **Design:** `docs/stitch/roam-fleet-app/html/find-parts-*.html`.
- **Screens:** `apps/fleet/src/components/vehicles/find-parts/`. FP1 is `CarStep.tsx`; FP2–FP12 are `screens/Fp*Screen.tsx`.

## Status: FP1–FP12 wired (F1/F2). Quality gates: stitch 100%, noSample vitest pass. Commit/deploy pending product owner.

---

## F1 — High · Buttons and links with no action (96)
Each one gets its own named action. Do what the design implies, using the routes already in `findPartsQueries.ts`.

| Screen | Dead | What they must do |
|---|---|---|
| FP3 What part | 20 | Skip guided triage → results; each service-due button → pick that part; ESC clears the search; each common tile, area tile and sub-chip → pick or select; each problem → show its answer; "Select …" / "Add … to check"; Continue → FP4; the mic button → voice search with the browser's speech recognition, which fills the search box (hide the button only where the browser has no speech support). |
| FP5 Results | 17 | Save query → `/saved-searches`; filter chips (All, In stock, Direct OEM) and Trim Scope filter the list; each row opens or expands; Allocate → service log; Request Fresh Supplier Quote → `/quote`; Log Bulk Consumable → stock out; Back to part selection → FP3; Download → `downloadFitmentReport`; Confirm parts list → `/parts-list` |
| FP12 Phone | 15 | Same actions as FP5, plus: the car chip → FP1; Use in service log; Add to requisition wishlist → `/parts-list`; category tiles → FP3 area; View schematic → area image; the Quick RFQ fields and send → `/quote`; the bottom nav opens its Fleet pages |
| FP6 Drawer | 11 | Close; each cross-reference row copies its part number; Add to order → `/parts-list`; Ping RFQ → `/quote`; Add to stock → `setOrgPartStock`; Use in a service log |
| FP9 Not linked | 11 (all) | Switch unit → FP1; Link it now → open the Classify drawer; Search by make, model and year → FP1, pre-filled; Send notification → `/notify-admin`; each Select → → that trim; Confirm & Map Vehicle → `saveVehicle` |
| FP10 Activity | 9 | The filter tabs (All, Requests, Quotes, Alerts, Core returns) filter the cards; See all; Review warranty terms; View return ledger |
| FP11 States | 9 | Ask Roam to add it → `/catalog-request`; Select another vehicle → FP1; Retry re-runs the search; Request access → `/notify-admin`; Back to Fleet maintenance. The state tabs (All / Skeleton / Error / Missing / No permission) only show their state. |
| FP4 Front or back | 2 | Front Axle / Rear Axle on the diagram choose that side |

## F2 — High · Fixed sample content still typed in
Each item becomes a live value or the empty text ("None yet", 0). Repeated cards become `.map()` over live rows.

| Screen | Fixed today | Live source |
|---|---|---|
| FP3 | Area tiles with "32 parts … 11 parts", "10 Categories Total", "5 items"; the brake sub-chips; the problem list and answer ("Squeaks…", "94%"); "Brake rotor" | `/browse` (areas, counts, sub-categories), `/symptoms` (problems, weight) |
| FP5 | Filter counts "(3) (2) (1)", "3 MATCHES FOUND", "1.5 hybrid" scope, the DENSO best-match line, the WIX/BOSCH interchange, "Every 10,000 km or 6 months", "PHOTO MATCH: 100%" | `/find` counts and items, the item's `gtin` and interchange, the maintenance schedule, `photo_verified` |
| FP6 | Background page: NHP160 / 1NZ vehicle header, "Odometer: 142,880 km", "Recommended Service Parts" (2 / 6 / 18 on shelf); drawer engine variants (1NZ/1NR), DENSO/WIX cross-reference rows, "100% SPEC MATCH" | `/vehicle-context`, `/find`, the item's variants and interchange |
| FP7 | "3 pending supplier replies", "2 units" shelf balance, "1.5 hybrid" | `/activity` quotes, stock, the chosen version |
| FP8 | Active Fleet Target "92,410 km", "12% left"; Recent Sourcing Wins (J$ 6,850, J$ 18,200); "1.5 hybrid" | `/vehicle-context`; resolved requests with `found_price_jmd`; the chosen version |
| FP9 | The 3 Candidate Trim cards (NCP160V / NSP160V / NHP160V, "84% / 12% / 4% fleet avg", engines); 1NZ / 1NR text in the header and plate locator | `/vehicle-options` versions with their share (the drawer already uses `data.trims` — use it here too) |
| FP10 | "(7)" count, KPI "99.2%", the 65% bar, alert cycles (May 14 / July 02, km), "Expected Lifespan: 25,000 km", "2 Vendors Notified", "24 units" audited | `/activity` (counts, alert dates and km, the service interval, suppliers notified, core returns) |
| FP11 | "HUB STATUS: 99.98% UP" | the health check used by the footer |
| FP12 | "Fit 2018", "1.5 hybrid", "(1)" | the chosen car, version and `/find` count |

Design sentences that are not data stay word for word. Examples: "e.g., Honda Shuttle / Grace", the "OEM Honda Genuine…" line under What happens next, "Coverage: 100% Roam Approved Stock".

## F3 — Medium · Not committed or deployed
This round's 32 changed files are uncommitted, and the fleet site is not deployed.

**Fix:** after F1 and F2:
- commit and push;
- deploy the fleet site;
- click through FP1 → FP12 once with a real login.

---

## Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md. It is the only doc for this work.
FP1, FP2, FP7 and FP8 are done — copy how they are built.

F1: give every listed button, link, chip and tile its own named action doing
what the table says. No onButton(text), no href="#".
F2: replace every listed fixed value with the live source in the table; repeated
cards become .map() over live rows; empty data shows "None yet" or 0.

Keep the checker at 100% and fleet tsc at or below 464. Then commit, push and
deploy the fleet site.
```

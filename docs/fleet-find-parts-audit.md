# Roam Fleet · Fleet maintenance → Find parts tab — audit and build plan (Rev 4, 31 Oct 2026)

**This is the only doc for this work.** It lists open items only.
- **Design:** `docs/stitch/roam-fleet-app/html/find-parts-*.html` (FP1–FP12).
- **Pictures:** `docs/stitch/roam-fleet-app/screenshots/FP*-stitch.png`.

---

## 1. Status: NOT DONE — still a picture, now in a different form

**What was built.**
- A script turned each Stitch page into a fixed JSX file: `find-parts/markup/Fp1Markup.tsx … Fp12Markup.tsx`, marked "Auto-generated" and `@ts-nocheck`.
- After the page draws, [findPartsDomFill.ts](../apps/fleet/src/components/vehicles/find-parts/findPartsDomFill.ts) does a find-and-replace over the on-screen text.

The 12 markup files contain **0 live values and 0 lists**. They have 3–11 hard-coded sample names each ("Honda Fit", "Kingston", "1505LM", "J$ 1,850", "RQ-8821"). So the pages still show the same made-up content to everyone, and most of it still does nothing.

---

## 2. Open findings

### F1 — Critical · Screens show Stitch sample data, and the find-and-replace breaks text
**Only FP1 swaps any text.** Only [CarStep.tsx](../apps/fleet/src/components/vehicles/find-parts/CarStep.tsx) calls `applyFindPartsLiveText`. FP2–FP12 show the Stitch sample data unchanged: cars, parts, prices, suppliers, requests, alerts.

**FP1's swaps are wrong:**
- Its rule `"0": wrongFitCount` replaces **every "0"** in every text on the page. "0W-20", "J$ 0 pending" and "2019" all change.
- Only 2 vehicles can appear. A fleet with 5 cars still shows 2 cards; a fleet with 1 car shows "None yet" in the second.

**Fetched data is never used:**
- `usePartsTerm` results are thrown away;
- the `/find` results, activity lists and vehicle-context values are not drawn into any block.

**Fix:**
- Delete `markup/`, `_html-jsx/`, `findPartsDomFill.ts`, and the script that generated them.
- Hand-port each screen as JSX that takes its data as props.
- Every sample value becomes `{value}`. Every repeated card becomes `{rows.map(...)}`, using the first card's markup.
- No DOM text replacement, no `@ts-nocheck`.

### F2 — Critical · Most buttons still do nothing, and the rest are matched by their words
- **No buttons at all:** FP2, FP3, FP4, FP5, FP6, FP9, FP10, FP11 and FP12 have **no** `onClick` in their markup.
- **Matched by words:** the 3 that have buttons (FP1, FP7, FP8) send the button's text to `label.includes(...)`. There are 50 such checks.
- **Clicks found by scanning the page:** PartStep and others scan the page with `querySelectorAll("span, button")` to attach clicks.
- **The FP8 photo box does nothing.** The real file input is a separate `sr-only` element ([RequestPartPanel.tsx:111](../apps/fleet/src/components/vehicles/find-parts/RequestPartPanel.tsx#L111)), and nothing on screen opens it.

**Fix:**
- Each button, card, chip and tile gets its own `onClick` prop that does what §3 says.
- Inputs use `value` and `onChange`.
- The photo box is a `<label>` wrapping the file input.

### F3 — High · The Fleet maintenance header and tabs appear twice
- FP1, FP8, FP9 and FP10 contain Stitch's copy of the header and tab row (Refresh, Bootstrap schedules, Compatible parts, + Log new service, By vehicle / Service ledger / Find parts).
- These draw **under** the real header and tabs. Their tab links are `href="#"`, so they don't work.

**Fix:** port only what sits below the tab row. The real header and tabs above stay.

### F4 — High · The checks were passed by hiding from them
- **Fidelity checker.** It reports 100% on all 12 screens, because it reads the generated markup files, which hold the Stitch text word for word.
- **Sample-data test.** [findParts.noSample.test.ts](../apps/fleet/src/components/vehicles/find-parts/findParts.noSample.test.ts) skips the `markup/` and `_html-jsx/` folders, which is where every sample value sits. [CarStep.tsx](../apps/fleet/src/components/vehicles/find-parts/CarStep.tsx) writes plates as `["1505","LM"].join("")` so the search can't see them.
- **Live-data test.** [fleet-find-parts-visual.spec.ts](../e2e/fleet-find-parts-visual.spec.ts) covers only FP1 and FP7. The FP7 test is wrapped in `if (await send.isVisible())`, so it passes without sending anything.

**Fix:**
- **Checker:** in `scripts/stitch-fidelity.mjs`, fail an FP row when a listed file contains any of these:
  - `@ts-nocheck`
  - "Auto-generated"
  - `createTreeWalker`
  - `applyFindPartsLiveText`
  - `querySelector`
  - `label.includes`
  - `onFpClick`
- **Sample-data test:** scan every file in `find-parts/`, with no skipped folders, and also catch sample values that are split into pieces and joined.
- **Live-data test:** cover all 12 screens with no `if` escapes. Each screen must:
  - show the fixture values (plate `TEST-01`, Nissan Note, J$ 9,999, "Fixture Motors");
  - show none of the Stitch samples;
  - fire the §3 route for each button.

### F5 — Medium · Not pushed, not deployed
`main` is 2 commits ahead of GitHub (d32d5056, 8b9e87ae), and the fleet site has not been deployed.

**Fix:** push once F1–F4 are done, then deploy the fleet site and click through FP1 → FP8 with a real login.

---

## 3. Wiring map — what each block shows and does
All routes are on fleet-core under `/parts/…` and are deployed. Each row must be drawn from live data and each action must work.

| Screen | Block → live value | Action |
|---|---|---|
| **FP1** Pick the car | Vehicle cards (one per car: name, version, Verified specs, parts on shelf, service due) → `/my-vehicles` | Card → `/find` → link, version or part step |
| | Make and model chips, selects → `/vehicle-options`; quick-type box → `/term` | Chip fills the field; Continue → version step |
| | Activity cards → `/activity`; guarantee card → `/wrong-fit-count` | See all → FP10; Submit Parts Request → `POST /request` |
| **FP2** Which one | Version cards (codes, Most common in fleet, description, chassis from) → `/vehicle-options` | Card → that version; Universal mode → `any`; Continue → FP3 |
| | Radar, vehicle context, fleet panel, paper guide → version specs + `/my-vehicles` | Lookup Chassis for Me → `POST /request` with `kind = 'chassis_lookup'` |
| **FP3** What part | Car strip, maintenance banner → `/vehicle-context` | Service button → pick that component |
| | Suggestions → `/term`; common tiles, areas, sub-chips → `/browse` | Tile or chip → pick (several allowed) |
| | Problems, answer card, likely parts → `/symptoms` | Select / Add to check; Skip → results |
| **FP4** Front or back | ODO, last service → `/vehicle-context`; option cards → specs, `labour_minutes`, stock, offer; tip → `fleet_tip` | Axle or card → front / rear / both; Show parts → results |
| **FP5** Results | Title, counts, filter chips, best match, sections, rows → `/find` + `pickBestPart`; parts list bar → `/parts-list` | Save query → `/saved-searches`; Quote PO → FP7; row → FP6; Allocate → service log; Fresh quote → `/quote`; Bulk consumable → stock out; Download → `downloadFitmentReport`; Confirm list → `/parts-list` |
| **FP6** Drawer | Background page → `/vehicle-context` + `/find`; drawer fields, offers, variants, cross-refs → the item; installs → service logs | Close; Ping RFQ → `/quote`; Add to order → `/parts-list`; Add to stock → `setOrgPartStock`; Use in a service log |
| **FP7** Quote | KPI tiles, supplier cards → stock, `/activity`, offers; shelf balance → stock | Quantity, urgency ×4, work order, vehicle, note, target price → `POST /quote`; success shows the returned reference |
| **FP8** Ask Roam | Runner chip → `/runner-online`; specs box → choices + vehicle; wins → resolved requests | Quantity, urgency, note, photo (`/request-photo`) → `POST /request`; View in activity → FP10 |
| **FP9** Not linked | Header, trims (% fleet avg) → `/find` + `/vehicle-options`; depot stock count | Select / Confirm & Map → `saveVehicle`; Send notification → `/notify-admin`; Switch unit → FP1 |
| **FP10** Activity | KPIs, request, quote, alert, warranty and core cards → `/activity`; feed panel → `/supplier-sync` | Filters; Inspect lead; Review offer → FP6; Investigate → Service ledger; Dismiss; Force Sync → `POST /supplier-sync` |
| **FP11** States | Loading count; error (code, trail, attempt n of 3); missing model; no permission (role, admin) | Retry re-runs; Ask Roam to add it → `/catalog-request`; Request access → `/notify-admin`; Back button |
| **FP12** Phone | Same data as FP5, FP7 and FP10, phone markup | Same actions; the bottom nav opens Fleet pages |

**Empty data:** the live database has 2 parts and 0 offers, quotes, requests and stock. Blocks show real empty values ("No price yet", "None yet", 0) and are never hidden.

---

## 4. Order
1. F4 first, so the checks fail honestly on all 12 screens.
2. F1–F3 screen by screen, FP1 → FP12. Each screen is done only when the checker, the sample-data test and the live-data test pass.
3. Fleet `tsc` stays at or below 464. Push, deploy the fleet site, click through with a real login (F5).

---

## 5. Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md fully. It is the only doc for this work.

The Find parts screens are auto-generated fixed markup (find-parts/markup/,
_html-jsx/) with a DOM find-and-replace (findPartsDomFill.ts). Delete all of it.

Hand-port each screen FP1–FP12 as JSX from its code.html: the same elements,
classes and words, but every sample value is a prop or state value, every
repeated card is a .map() over live rows, and every button, card, chip and input
has its own handler doing what §3 says. Port only what sits below the tab row.

Not allowed: @ts-nocheck, generated markup, createTreeWalker, querySelector,
matching clicks by button text, sr-only inputs, splitting strings to dodge tests,
skipping folders in tests, or if-guards that let a test pass without acting.

Do §4 in order. Fleet tsc must stay at or below 464.
```

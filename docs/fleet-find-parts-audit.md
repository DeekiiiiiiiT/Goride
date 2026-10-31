# Roam Fleet · Fleet maintenance → Find parts tab — audit (Rev 13, 31 Oct 2026)

**This is the only doc for this work.** It lists open items only.
- **Design:** `docs/stitch/roam-fleet-app/html/find-parts-*.html`.
- **Screens:** `apps/fleet/src/components/vehicles/find-parts/`.

**Rule:** information only. No prices, suppliers, quotes, ordering, stock, warranty, core returns or guarantees. Every other Stitch block is ported word for word, with live data.

---

## F1 — Critical · Searching brakes for the Roomy lands on the error screen
- **Cause:** `/parts/vehicle-context` asks for a column that doesn't exist. [vehicle_parts_context.ts](../supabase/functions/_fleet-server/vehicle_parts_context.ts) selects `detail, title, created_at` from `part_repeat_alert`. Production has **no `title` column** (checked 31 Oct: `created_at, detail, organization_id, status, vehicle_id`).
  - That query runs only when the car has no service-ledger notes. The Roomy (5179KZ) has none, so the call fails every time.
  - [ResultsView.tsx:85](../apps/fleet/src/components/vehicles/find-parts/ResultsView.tsx#L85) then replaces the whole results page with the error screen.
  - The brake parts are fine in the database.
  - This is also why the version showed "None yet".
- **Fix:**
  - Select `detail, created_at` only.
  - Add a Deno test that runs the context loader against a car with no ledger notes and one open alert.
  - Deploy fleet-core.
  - Then Roomy → Brake pads shows results with "Pre-Facelift · 1KR-FE · 2WD".

## F2 — High · The error screen is the Stitch "states board", with made-up details
The owner's screenshot shows the whole design board instead of one error message:
- the "FLEET OPS / MAINTENANCE / FIND PARTS SYSTEM STATES · DEV PREVIEW // NODE KIN-01" header;
- "Parts Catalog State Diagnostics";
- the state tabs;
- the "Design System Matrix & Implementation Tokens" table;
- sample values typed into [Fp11Screen.tsx](../apps/fleet/src/components/vehicles/find-parts/screens/Fp11Screen.tsx): "2017 Nissan NV200 [JM-KGN-4819]", "Front Brake Assembly", "#RQ-8841-TEMP", "kin-parts-sync-cluster.internal:9080", "24ms KIN", "Fleet hub Hub", and a fixed "HTTP 504 GATEWAY_TIMEOUT".

**Fix:**
- **Show only the one state card that applies** (loading, error, missing model, or no permission), in place on the tab.
- **Remove the board itself:** the header, title, sentence, state tabs and matrix table. The matrix describes *behaviour* (retry, keep the draft, ask an admin). Build that behaviour; don't show the table.
- **Error card, all live:**
  - VEHICLE = the chosen car and plate;
  - SECTION = the chosen part;
  - the real HTTP status and message from the failed call;
  - "Check connection status ({last latency}ms)";
  - "ATTEMPT: {n} OF 3", counting real retries.
  - Remove REQUISITION ID (that is sales) and FEED NODE.
  - In the sentence, "Fleet hub Hub" becomes "The parts database did not respond in time…".
- **Missing model card:** remove "(NCP50 series)".

## F3 — Medium · A few design lines are still missing
Put each back in its Stitch place, with live values where the design shows a sample:

| Screen | Missing |
|---|---|
| FP1 | "Select an active fleet vehicle to match or look up parts for any other car."; the tip "You can also paste Jamaican registration, chassis serial, or JDM model codes."; "Next: We'll verify engine version if needed" |
| FP2 | "These versions take different filters, brakes, fluids, and mounts. Pick the exact powertrain on your fitness certificate or chassis plate."; the Universal mode sentence; "Not sure" (wrongly on the ignore list) |
| FP3 | "Due soon" badge (wrongly on the ignore list) |
| FP4 | "Front and back {part} are different parts on the {chassis} chassis. Select the axle needing replacement to load correct caliper fitments." |
| FP9 | "We need to know exactly which {make model} this is" |
| FP10 | Request statuses "Looking" / "Found" / "Pending" (wrongly on the ignore list) |

**Also:**
- [findPartsViewModels.ts:61](../apps/fleet/src/components/vehicles/find-parts/findPartsViewModels.ts#L61) makes up a chassis serial ("{code}-1000001+"). Show "Chassis match" only when `chassis_serial_from` is set.
- **Checker:** when a Stitch sentence contains a sample value, the checker currently asks for the sentence with a hole in it ("which ? this is"). Change it to require each piece of text around the hole instead. Sentences with live values can then reach 100%.
- **Current scores:** FP12 45%, FP5 54%, FP3 68%, FP9 68%; the rest 75–94%. Every row must reach 100%.

## F4 — Medium · Not committed or deployed
21 files are uncommitted, including the server route changes. After F1–F3: commit, push, deploy fleet-core and the fleet site.

---

## Last step (owner)
On roamfleet.co:
- Find parts → Roomy → Brake pads → Front, then Rear. Each shows its own parts, with the version shown in the title area.
- Turn off Wi-Fi and search once. You should see one error card naming your car and part, with Retry. No design table.

## Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md and fix F1–F4 in order. F1 first: remove the
non-existent `title` column from the part_repeat_alert query and add the test.
No sample values, no selling elements, nothing added only to satisfy the checker.
Keep fleet tsc at or below 464. Commit, push, deploy fleet-core and the fleet site.
```

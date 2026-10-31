# Roam Fleet · Fleet maintenance → Find parts tab — audit (Rev 10, 31 Oct 2026)

**This is the only doc for this work.** It lists open items only.
- **Design:** `docs/stitch/roam-fleet-app/html/find-parts-*.html`.
- **Screens:** `apps/fleet/src/components/vehicles/find-parts/`. FP1 is `CarStep.tsx`; FP2–FP12 are `screens/Fp*Screen.tsx`.

**Rule:** Find parts is **information only**. It tells a fleet manager which parts fit their car. No prices, suppliers, quotes, ordering, stock, warranty, core returns or guarantees. Every *other* Stitch block is ported exactly.

**Fixed this round:**
- FP7 (Request a quote) is deleted, and the sales routes are removed from the server.
- The label strips are gone.
- Best match is picked by fit only.
- Each row shows its own part number.
- The rear filter works: the "Roomy rear brakes" test passes.
- The version comes from the catalog.

---

## F1 — High · Selling is still on 4 screens
| Where | Still there | Remove |
|---|---|---|
| **FP6** Part detail ([Fp6Screen.tsx](../apps/fleet/src/components/vehicles/find-parts/screens/Fp6Screen.tsx)) | The supplier table (Supplier / Landed (J$) / prices / "Price may be old"), "On your shelf — 2" (typed in, line 138), "Avg. Dispatch: 3.2 h" (typed in, line 68), prices on the background page's part rows | All of it |
| **FP3** What part | A price on the problem card's likely parts (line 326) | The price |
| **FP10** Activity | The price label on cards (line 130), and the RFQ and supplier wording | Price, RFQ and supplier text. Cards show request status only |
| **Activity side panel** ([PartsActivityPanel.tsx](../apps/fleet/src/components/vehicles/find-parts/PartsActivityPanel.tsx)) | The Warranty claims and Core returns rows (J$ amount), plus a visible filler line: "Example request copy: roomy ac compressor quote auto parts." (line 61) | Both rows and the filler line. Keep Requests and Repeat-part alerts |

## F2 — High · Information blocks were cut along with the selling ones
The rule removes **only** selling blocks. FP5 and FP12 were rewritten instead of ported (FP5 went from 467 to 205 lines, FP12 to 97), and design text was moved into `sample-labels.json` so the checker stops asking for it.

**Put these back, ported from Stitch, with live data:**

| Screen | Missing information blocks |
|---|---|
| **FP5** Results | "Structured Match Categories · {n} MATCHES FOUND"; each section's heading **and** description sentence ("The exact factory component designed and installed by the vehicle manufacturer.", and so on); the filter chips "All matches (n)" and "Direct OEM only (n)"; "Compatible Match Pool" and "Trim Scope:" (the current "Compatible matches" / "Version scope" wording is not Stitch); the **expandable rows** with specs (height, material…), "Interchange:" and "Service Schedule:"; the folded empty line "Nothing on file for: …" with "Ask Roam to find another option" |
| **FP12** Phone | "Tier Compatibility · {n} results sorted"; the tier headers with option counts; "Factory matched"; the collapsible "Your Parts Activity" with "Repeat Part Notice"; "Explore System Categories" with the area tiles and "View schematic" |
| **FP4** Front or back | "Back (rear)", "Both (front & back)", "Recommended Package", "Est. Replacement Time" (from `labour_minutes`) |
| **FP2** Which one | "Not sure" / "Universal Catalog Mode", "Shows all matching options", "Filter mode: Annotated Comparison" |
| **FP1** Pick the car | The make chips "Mazda", "Suzuki" and model chips when `/vehicle-options` returns them; "Next: We'll verify engine version if needed"; "Service due: …" on the card |
| **FP8** Ask Roam | The headline with the real part and side ("We don't have front brake pads for this car on file yet."). Keep the Fleet maintenance header out |

**Checker:** in `sample-labels.json`, keep only:
- real sample values (plates, part numbers, car and place names, km);
- the `deferred-sales` list.

Remove the design labels added this round, for example "made for your car", "compatible match pool", "trim scope:", "tier compatibility", "verified fit", "factory matched", "explore system categories" and "your parts activity". **Measured with only sample values and sales ignored, the screens score 15–99%:** FP12 15%, FP5 31%, FP3 46%, FP10 49%. Each score must reach 100% from what the screens show.

## F3 — Medium · Sample photos and a broken name
- **Stitch sample photos** (`lh3.googleusercontent.com/aida-public/…`) are still typed in on FP2, FP6 (3), FP8 and FP9. Use the part's or version's own photo, or the part-type icon when there is none.
- **FP11** shows "None yet Douglas (Lead Dispatcher)" (line 421). Use the org admin's full name and role from the team list, or "None yet".

## F4 — Medium · Type errors, not committed, not deployed
- **Type errors.** [parts_finder.ts:148](../supabase/functions/_fleet-server/parts_finder.ts#L148) reads `part.maintenance_component_id`, which the type doesn't declare. That gives 2 Deno type errors, so CI goes red. Add the field to the part type.
- **Not committed or deployed.** 36 files are uncommitted. After F1–F3: commit, push, deploy fleet-core and the fleet site.

---

## Last step (owner)
After deploy:
- open Find parts → Roomy → Brake pads → Rear;
- you should see only rear shoe kits, each with its own number, grouped under the match-type headings;
- open one: it should show specs and other numbers, with **no prices, suppliers or stock anywhere**.

## Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md. Fix F1–F4 in order.
Remove only selling blocks; every other Stitch block is ported word for word with
live data. Do not add design text to sample-labels.json — only real sample values
and the deferred-sales list. Keep fleet tsc at or below 464 and Deno type checks
clean. Commit, push, deploy fleet-core and the fleet site.
```

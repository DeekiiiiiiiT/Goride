# Roam Fleet · Find parts + Dominion Pending catalog (parts) — audit (Rev 21, 1 Nov 2026)

**This is the only doc for this work.** It is a full pass over the whole Find parts flow, checked against the code, the live server logs and the production data, not just the owner's screenshots. It lists open items only.

**Spec:** port the Stitch files exactly, and build what they show that the app lacks. Never edit `docs/stitch/`.
- **Fleet:** `docs/stitch/roam-fleet-app/html/find-parts-*.html`.
- **Dominion:** `docs/stitch/dominion-redesign/html/S10b/c/d-*.html`.
- **Rules:** information only, parts only, no customer names or plates in Dominion.

**No new Stitch screens are needed.** Every fix below reuses blocks that are already in the designs.

---

## 1. Blockers — the flow gives wrong or no answers

**B1 · "Ask Roam to add this part" can never save.**
- **Cause:** [fleet_find_parts_routes.ts](../supabase/functions/_fleet-server/fleet_find_parts_routes.ts) (`POST /parts/request`) writes the car **version** id into `platform_id`. In production `platform_id` is a foreign key to `vehicle_platform`, so the insert is rejected. Production has 0 part requests ever. Dominion's queue ([pending_parts_catalog_routes.ts](../supabase/functions/_fleet-server/pending_parts_catalog_routes.ts)) also groups by `platform_id` as if it were the version.
- **Fix:**
  - Add `vehicle_catalog_id uuid references vehicle_catalog(id)` and `match_type text` to `parts_sourcing_requests`.
  - Write the version id there. Set `platform_id` only from the version's own platform.
  - Group, filter and update the Dominion queue by `vehicle_catalog_id`.
  - Add a Deno test that inserts a real request against the production schema shape, and one that the Dominion list returns it.

**B2 · Results are empty when "Both" is chosen.**
- **Cause:** `fitsAxis` in [parts_finder.ts:63](../supabase/functions/_fleet-server/parts_finder.ts#L63) keeps a part only if its position equals the wanted one. With `position=both` it drops every front and rear part. The owner's Roomy (6 brake parts: 4 front, 2 rear) shows "0 matches". "Both sides" has the same bug with left and right.
- **Fix:** "both" means front **and** rear, or left **and** right: keep all of them. Add tests for both/front/rear × both/left/right.

**B3 · Every step shows the version as "NONE YET".**
- **Cause:** `/parts/vehicle-context` now returns the version as `version` and the specs under `specs`. The screens still read `trim`, `variant`, `brake_front_rotor_mm` and the rest ([findPartsViewModels.ts:590, 698](../apps/fleet/src/components/vehicles/find-parts/findPartsViewModels.ts#L590)). The logs show the call succeeds (200), so the data is there but never read.
- **Fix:** one shared response type for vehicle-context, used by the route and the view models. A test checks that the Roomy's version reads "Pre-Facelift · 1KR-FE · 2WD" in the FP3, FP4 and FP5 headers.

**B4 · Next stays grey after picking Brakes.**
- **Cause:** when the page opens with `&part=` in the address, the sub-chip shows as selected, but `selectedChipId` in [PartStep.tsx](../apps/fleet/src/components/vehicles/find-parts/PartStep.tsx) starts empty, so Next is disabled. Only a common-part tile sets it.
- **Fix:** start the selection from the address. Clicking an area with no part chosen shows "Pick a part below" next to the disabled Next.

## 2. Which side? (FP4) — make it work for every case
**What's wrong:**
- **Too few combinations.** One side choice for both axles can't say "front left + rear right".
- **The diagram doesn't follow.** "Both + Right" lights only the rear axle and labels it "FRONT AXLE · Both sides".
- **The side question shows when it means nothing.** Production data: all 6 Roomy brake parts have `side = null`; they are axle sets.
- **The part name is lost.** Opening by address shows "Which parts?", "3. parts" and a doubled "PARTS FITMENT · PARTS FITMENT" eyebrow.

**Fix**, using the design's existing blocks:
- **Step A, axle** (Front / Back / Both), as now.
- **Step B, side,** only when this car has left- or right-specific listings for the part. Otherwise show the design's advisory box worded: "These come as an axle set (left and right together)." Next then goes to results.
- **When Step B applies and Both axles are chosen,** repeat the design's side row once per axle: "Front side: Left · Right · Both sides" and "Rear side: Left · Right · Both sides".
- **The diagram** highlights exactly the chosen wheels: per axle, left, right or both. Its label lists them ("FRONT · BOTH SIDES / REAR · LEFT").
- **Address and server:** save as `&fit=front:both,rear:left`. `/parts/find` accepts several axle:side pairs and keeps a part if it matches any. Results list front parts and rear parts under small "Front" / "Rear" headings inside each match type.
- **Part name:** read it from `/parts/browse` by component id, so "Which brake pads?", "3. Brake pads" and "BRAKE PADS FITMENT" (once) always show.
- **Spec cards and chassis profile:** read `specs` (B3). Production has **no** brake or chassis spec values for any car, so they show "None yet". Remove the sample fallbacks ("246mm", "51mm single", "180mm", "17.5mm", "4-Wheel Bosch", "Rear drum cable", "4 × 100 PCD", "M900A-BGBGB", and the typed "OEM VENTED" / "DRUM SHOE" text) from findPartsViewModels.ts:719–752. The DISC / DRUM tags come from `brake_front_type` / `brake_rear_type`, or "—".

## 3. Results (FP5) — show all five match types, and let the user ask for a missing one
What the owner wants: the person sees the five match types for their car. Where one is empty, they can ask Roam to find that kind, and the request lands in Dominion → Pending catalog → Parts.

**Fix**, using the design's existing blocks:
- **Always show the five sections** in order, with the design's accent bars and counts: Made for your car · OEM; Same car, different badge · Sister; Fits your engine · Engine; Other brands that replace it · Aftermarket; Fits by size · Universal.
- **An empty section** shows its header and one line inside it, using the design's folded-line style: "None on file for your car yet." with the button **"Ask Roam to find a {Sister} option"**.
- **That button** sends `POST /parts/request` with `kind = 'add_part_info'`, the part, the version, the axle/side, and `match_type` (B1), then shows FP8's "Request sent" card.
- **Delete** the empty "Made for your car" box, the separate "Nothing on file for: …" rows, and the extra "Don't see the right part?" row.
- **Delete the bottom buttons** ("Back to part selection", the second "Download fitment report"). The header already has Back and Download.
- **The header version chip** reads `version` (B3).

## 4. Dominion Pending catalog
- **The cards disappear on the Parts tab with 0 requests.** That is not by design; no new screen is needed. Today the empty state replaces the whole tab and shows design-board text: "State 1: Empty State (Zero Requests)" and "TAB: PARTS REQUEST QUEUE".
  - **Fix:** always show S10b: the four cards (with 0), the filters, search, Export and the table header. The S10d empty message goes inside the table area. Remove the board text.
- **Show the requested match type.** The Part cell's second line shows it ("Front brake pad set · Sister option"). "Add this part" pre-fills the match type too.

## 5. Carried over (still open from Rev 20)
- **Pictures:**
  - all 9 `*-live.png` are from before the last fixes, and Fleet's are cut at one screen high;
  - before capturing, set the AppLayout scroll panel and `<main>` to `overflow: visible; height: auto`;
  - re-take with real-shaped data (not mocks that hide B1–B3);
  - mark Ported only when they match.
- **Made-up FP3 problems.** `fp3StitchFallbackSymptoms` (findPartsViewModels.ts:403) invents problems with "88%" when `/parts/symptoms` is empty. Delete it.
- **Old FP8 success block.** "Request dispatched… Ticket #REQ-8849… quote time 18 minutes" in [Fp8Screen.tsx:132](../apps/fleet/src/components/vehicles/find-parts/screens/Fp8Screen.tsx#L132) is from the old design. Delete it.
- **Gap above the header.** The sticky header is `top-0` again, so content shows through the 16 px gap. Use `-top-4`.
- **Sample test.** `findParts.noSample.test.ts` must scan the whole `find-parts/` folder, view models included.

## 6. Data the owner enters in Dominion (no code)
- **Brake shoes are filed as brake pads.** The two Roomy rear brake shoe kits (04495-B2400, ADT34155) are filed under "Brake pads". Create the component **"Brake shoes / drums"** under Brakes and move them, so the sub-chip counts are right.
- **No brake or chassis specs exist** for any car. Enter them for the Roomy and Fit: brake front/rear type and size, ABS channels, handbrake type, hub bolt pattern.

---

## Last step (owner)
On roamfleet.co:
1. Roomy → Brakes → Brake pads. **Next turns on.**
2. Which side? says "These come as an axle set". Pick **Both**, then Next.
3. Results show 4 front pad sets and 2 rear shoe kits, and the header says "Pre-Facelift · 1KR-FE · 2WD".
4. The "Same car, different badge" section is empty. Press "Ask Roam to find a Sister option".
5. Dominion → Pending catalog → Parts shows it as "1 fleet · Sister option", with the cards visible.

## Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md. Fix §1 first (B1–B4) with tests against the
real production schema, then §2–§5. Reuse the existing Stitch blocks; no new
screens. No sample values, no filler, nothing added only for the checker. Re-take
full-length pictures with real-shaped data. Commit, push, deploy fleet-core, the
fleet site and the Dominion site, then walk the "Last step" yourself.
```

# Roam Fleet · Find parts tab + Dominion Pending catalog (parts) — audit (Rev 19, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only.

**Spec:** port the Stitch files exactly, and build anything they show that the app lacks. Never edit `docs/stitch/`.
- **Fleet:** `docs/stitch/roam-fleet-app/html/find-parts-{browse,position,results,request,activity,phone}.html`.
- **Dominion:** `docs/stitch/dominion-redesign/html/S10b-…`, `S10c-…`, `S10d-…`.
- **Not ported:** the shared app frame and the design-board text.
- **Rules:** information only, parts only, no customer names or plates in Dominion.

**Done since Rev 18:**
- Migration `fleet_find_parts_r3` is applied, and fleet-core v194 is deployed.
- Real area icons are used, numbered 01–11.
- Fleet has a missing-styles test, and the find-parts tests pass (11/11).
- **F1:** Dominion pending catalog uses full `.pending-parts-stitch` shell, Parts default tab + `?tab=`, S10b vehicles tab layout, CSS coverage test.
- **F2:** Removed `FIND_PARTS_STITCH_*` dumps; FP5/8/10/12 bind vehicle-context, `standard_ref`, request ref, org short code; extended no-sample tests.
- **F3:** Sticky header offset, FP4 diagram SVG, stitch-shaped e2e fixtures, full-page Playwright captures (regenerate PNGs locally to sign off README `Ported` rows).

---

## F4 — Medium · Commit and deploy

Land the working tree, push, and deploy Fleet + Dominion when ready. Re-run Playwright stitch PNG job before marking FP3–FP12 / S10b–S10d as **Ported** in the stitch READMEs.

---

## Last step (owner)

- **Dominion:** Pending catalog opens on **Parts** and looks like `S10b-stitch.png`. The Vehicles tab uses the same style.
- **Fleet:** Find parts → Roomy → Brake pads → Rear. The Results header shows your Roomy's real details, and no paragraph of design text.

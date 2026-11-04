# Add a part + auto-matching — audit

**Rev 17 · 4 Nov 2026 · Status: NOT DONE (last mile).** One parts system, one goal: **a Fleet user opens Find parts for a car and sees every part that really fits it, with a reason and a trust label.** Auto-matching is the engine; Add a part is the self-serve front end.

**Re-checked Rev 16 work:**
- Engine-undo batch fix live.
- "Same part — merge" live and owner-only, with button and proof.
- Grey helper text confirmed in the AP4 capture.
- Admin builds.

Run serially: 47 pass, 11 fail. 5 of the 11 are OneDrive locking the screenshot files (not code); 6 are below. Open items only.

**Spec:** [docs/stitch/dominion-add-a-part/](stitch/dominion-add-a-part/), `docs/stitch/dominion-redesign/` (AM-S1–S6). Port Stitch, don't redesign it.

## Rules for whoever builds this

- Database changes go in **new** migration files; never edit an applied one.
- Parts are information only: no prices, suppliers or stock.
- Tests use made-up fixture IDs (valid hex) and never touch real catalog rows.
- Never bulk-Keep "same number" conflicts.
- Don't commit, change branches or edit other audit files.
- Run Playwright with `node node_modules/@playwright/test/cli.js`.

---

## Open findings (one fix each)

**R17-01 · High — the Vehicles page crashes when spec keys come back in another shape.** `VehicleCarSpecsSection.tsx:46` does `keys.data?.items.find(...)`. If the response has no `items`, the whole Vehicles page goes blank. This is why AM-S1, AM-S1 empty, AM-S1 error and AM-S1 flag-off fail: the auto-match mocks don't answer `spec-keys`. **Fix:**
- use `keys.data?.items?.find(...)` and `(keys.data?.items ?? [])` everywhere in that file;
- add a `spec-keys` → `{ items: [] }` route to `e2e/partsAutoMatchMocks.ts`.

**R17-02 · High — same-part merge only rechecks one car, and can't be undone from the app.** `part_match_conflict_merge_same_part` (migration `20261110122000`):
- It moves the second brand's parts into the surviving group, then recomputes only the conflict's car. Other cars listed only on the second group lose that brand until the nightly run.
- Proof 84 "unmerges" with hand-written UPDATEs; there is no unmerge function or button.

**Fix:** new migration that:
1. recomputes each merged group with no car scope (`part_match_recompute(group, NULL)`);
2. adds `part_match_unmerge_same_part(p_conflict_id, p_actor)`, which moves the logged parts back, sets `reversed_at` on their `interchange_group_merge_log` rows, reopens the conflict and recomputes both groups.

Then add an owner-only "Undo merge" button on resolved merges in `ConflictReviewDrawer.tsx`, and make Proof 84 call the new function.

**R17-03 · Medium — the Stitch text check fails on two screens for test reasons.**
- AM-S3 checks for labels from the "Add shared component" pop-up (e.g. "Component Scope") without opening it.
- AM-S5 flags the new "Same part — merge" button as "not in Stitch".

**Fix:** in `e2e/parts-auto-match-stitch.spec.ts`, open the add-link pop-up before the AM-S3 label check, and add "Same part — merge" (and "Undo merge") to AM-S5's accepted differences.

**R17-04 · Low — README marked "Ported" too early.** `docs/stitch/dominion-redesign/README.md` says AM-S1–S6 "Ported", but the text check doesn't pass yet on AM-S1, AM-S3 and AM-S5. **Fix:** set those three back to "In progress" until R17-01 and R17-03 pass.

---

## Done when

- `supabase/tests/parts_auto_match_checks.sql` passes, with Proof 84 using the new unmerge.
- This passes twice in a row, run from a folder OneDrive isn't syncing (or with OneDrive paused) so the screenshot files aren't locked:
  - `node node_modules/@playwright/test/cli.js test e2e/add-a-part-stitch.spec.ts e2e/add-a-part-done.spec.ts e2e/parts-auto-match-stitch.spec.ts --project=dominion-admin --workers=2`

## Owner only (Cursor: skip)

- Upload the two MK Kashiyama **D0051MH** files (Brakes fitment first, then cross-refs) and `brake pads D0051M family - fitment.csv`.
- Add Ford Fiesta and Mazda factory numbers from the car makers' catalogues.
- Commit when ready.

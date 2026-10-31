# Dominion · Parts database — header and tabs audit (Rev 7, 30 Oct 2026)

Page: Dominion → Master data → Vehicles → **Parts database** (`?page=parts-catalog`). Audit only; no code was changed.

**Done (checked 31 Oct, 03:00 UTC):**
- The grouped search, fitments and last-change migrations are live, and production history matches the repo.
- fleet-core v187 is deployed, and roamdominion.co serves the new build.
- Make / Model / Year filter live. Toyota → Roomy gives 15 records: 3 OEM, 2 Sister families, 5 Aftermarket, 5 Universal.
- Dark mode and the phone layout are fixed.
- Every Screen 12 piece is built: the index line, the "Nothing on file" line with "+ Add an engine fitment", the eye on Universal rows, the drawer's "+ Add a car" and "Confirm fit", and the Catalog notice with the role.
- S42h's tab row is fixed, and everything is committed and pushed.

**Done (checked 31 Oct, 03:30 UTC):**
- Status counts parts only. With nothing selected, Status is All 11 = Verified 2 + Needs checking 9. Toyota → Roomy is All 8 = Verified 2 + Needs checking 6. Match-type totals stay 18 and 15. Choosing Verified still hides sister families and size-based parts.
- At 390 px, each group header shows its tag and "N records in file" (or "N families on file") under the name.
- Stitch dark screen `034344e3c28e4921b5336c46787240ce` is saved as `html/S42l-full-database-dark.html` and `screenshots/S42l-full-database-stitch-dark.png`. The live light and dark pictures are no longer the same file. S42l is marked Ported.

---

## Open

None.

---

## Order
1, then 2, then 3. All three are done.

# Parts Database — Five-Category Audit

**Rev 4 · 2026-10-30** · Closed.

**Verified done:**
- Every Rev 3 item is fixed.
- Migration `20261030223000` is applied.
- Migration `20261031000000` is applied. Readiness grants are `postgres` and `service_role` only.
- Listing years apply to direct and sister matches only. A 2012 Vitz KSP130 gets the Roomy oil filter as Engine Compatible.
- Belta SCP92 is 2SZ-FE. Belta KSP92 is the 1.0 L 1KR-FE.
- Unticking a car while editing removes that listing.
- Reach preview asks the server which cars match, and Advanced stops at the last page.
- Stitch sample labels are excluded from the score. S40–S41-phone have no FAIL.
- Roomy M900A has the factory oil filter, a MANN-FILTER HU 6006 z cross-reference, and real universal items for 0W-20, the three wiper sizes, and CVT Fluid FE. The same wiper and CVT specs are on the 4WD family.

## Done when

- Find parts → Toyota Roomy 2019 → M900A shows the factory filter, the aftermarket filter, and the universal sizes.
- Vitz KSP130 2012 shows the oil filter as Engine Compatible.
- `node scripts/stitch-fidelity.mjs --report` shows no FAIL on S40–S41-phone.
- Fleet-core is redeployed with `reach-preview` and `import-batches`. The admin site ships with this commit.

## Must not change

- **Vehicle Catalog eye overlay:** the only change is the "Parts for this vehicle" button.
- **Pending catalog, Maintenance templates, Suppliers and prices:** untouched.
- **No customer data in Dominion.** Stock stays in the Fleet app.

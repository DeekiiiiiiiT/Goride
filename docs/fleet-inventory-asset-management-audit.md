# Fleet Inventory & Asset Management — Audit

**Rev 5 · 1 Nov 2026 · re-check · audit only, no code changed.**
**Scope:** Fleet → Vehicle Operations → Inventory & Asset Management (Stitch IN1–IN18) and the Roam Driver car kit (Stitch DK1–DK6). Spec: `docs/stitch/roam-fleet-app/inventory/`, `docs/stitch/roam-driver-app/car-kit/` — exact Stitch layout and wording, live data only, anything shown gets built, old design deleted.

**Done since Rev 4:** engine live in prod (36 tables, RLS on, no write grants, nightly cron); `org_part_stock` view is `security_invoker`, no client grants; fleet-core **v203** live (`/templates` login fixed, one flag source); `POST /org-part-stock` goes through the engine; 49 inventory routes; reserve/release/return/publish-kit/recompute/pair-scanner RPCs; dialogs and drawers open from buttons; banners show only on real problems; IN15 and driver car kit behind the Phase 3 flag; Rush gate wired in code; old Fleet page and its services deleted; type errors 100 → 39.

---

## 1. Open items

### Critical

**R5-01 · The drop migration would delete 17 items that were never moved**
- Evidence: `20261101143700_drop_legacy_fleet_inventory_tables.sql` (not yet applied) drops `fleet.inventory` and `fleet.equipment`. `fleet.equipment` still holds the 17 rows for 5179KZ, and none of them is in the new tables (R5-02).
- Fix: delete that file now. Add it back with a new, later version only after R5-02 is verified.

**R5-02 · Data move is incomplete and lost the cost**
- Evidence: prod has 1 item, 1 location, 1 movement. `fleet.migrate_legacy_inventory_to_engine` reads only `fleet.inventory`, and reads cost from `cost`/`unitCost`, but the record uses `costPerUnit`, so Phone Holder Mount's balance value is **J$0.00** (should be J$5,400). Neither car has a vehicle location; there are 0 assets, 0 kits, 0 vehicle kits.
- Fix: one migration that: creates a vehicle location for every `fleet.vehicles` row (and a trigger for new cars); reverses `OPN-0001` and re-posts the opening balance at J$5,400; moves the 17 equipment rows — Car Jack, Lug Tool, Phone holder, Car Mats, one Spare Tire (J$20,000) as opening balances at the 5179KZ location; Dash Camera as an installed asset with no serial (raises "Add serial"); the 4 tyres + 4 wheels and their damage notes to Maintenance components; Toll Tag and Gas Card skipped (linked records); creates the default "Rideshare car kit" and a `vehicle_kit` for both cars. Check after: 5179KZ shows 70%, 1505LM 0%, Stock value J$90,278.85 less the items that turn out not to exist at the first count.

**R5-03 · Production can't change inventory right now**
- Evidence: `fleet_inventory_phase2_stock = true` in prod, so fleet-core v203 answers the old page's Add / Edit / Delete / Bulk Assignment with **410**. The new Fleet screens are uncommitted and not deployed, so production users still have the old page — which can now only read.
- Fix: turn `fleet_inventory_phase2_stock` off until R5-04 is done and the new Fleet frontend is deployed; then turn it on in the same release.

### High

**R5-16 · The app never receives the switches, so the new page can't open**
- Evidence: the page shows "Inventory Phase 2 is not enabled for this org yet" (owner screenshot, localhost 11:40 EST) although the flag is on and fleet-core v203 (live 11:28 EST) returns `"fleet_inventory_phase2_stock": true`. Cause: `FeatureFlagContext.tsx:90` and `:142` call `GET /fleet-core/platform-feature-flags` with only `withProductLineHeaders()` — no `apikey`, no `Authorization`. fleet-core has `verify_jwt = true`, so the gateway answers **401** (reproduced) and the code silently drops the inventory flags. `apps/driver/src/hooks/useDriverInventoryPhase3.ts` has the same bug, so the driver car kit can never turn on either.
- Fix: send `apikey: publicAnonKey` and `Authorization: Bearer <session token, or anon key before login>` on all three calls (or use `withSettingsSegmentHeaders`, which already adds `apikey`). Check: with the flag on, `/vehicle-operations/inventory` opens the new page without any `VITE_` setting.

**R5-04 · 22 of 24 screens still show Stitch sample data**
- Evidence: only IN1 (Overview KPIs) reads data, and only IN1's Receive/Issue buttons act. All other `In*/Dk*.tsx` have no data and no actions; "5179KZ" is hard-coded in 21 files, plus the "Damion", "Kingston Hub" and "J$ 90,278.85" sample values.
- Fix: wire each screen to its routes; every sample value becomes live data (listed in `sample-labels.json`); every button calls its route.

**R5-05 · Ledger chain check crashes**
- Evidence: `select fleet.inv_verify_chain('8cfa606a-…')` → `cannot cast type record to inv_ledger` at `v_canonical := fleet.inv_ledger_canonical(v_row)`. So "Verify now" (IN10) fails and the 06:30 nightly job will fail.
- Fix: declare `v_row fleet.inv_ledger%ROWTYPE` and select whole rows into it.

**R5-06 · Local migration files don't match production**
- Evidence: prod history has `20261101163228…163825` (`…schema_1…8`, `…rpcs_1…4`); local has `20261101143100–143700`, `163303`, **six files all numbered `20261101163304`**, `170000`, and `…schema.sql.part1/.part2` inside `supabase/migrations/`. The next `db push` will try to re-run them or stop on the duplicate number.
- Fix: rename the local files to exactly the prod versions and names, remove the `.part` files, and give each later migration a unique, later number.

**R5-07 · Backend still missing for parts of the screens**
- Routes: kits `spec.pdf` and `compliance.csv`; assets events / move / repair / faulty / retire / serial / QR label / documents; purchase-order submit / authorize / order / receive / cancel; counts recount / reject / approve; alerts snooze / done / viewed; scanners list.
- Views: kit reserve, where-used, reorder suggestions, vendor stats, count accuracy, procurement month-to-date, report SLA, asset KPIs.
- Finance: `POST /inventory/finance/post` returns `{ stub: true }` — no posting to Business Finance yet.

**R5-08 · Driver screens not reachable**
- Evidence: `CarKitPage` renders only DK1 (static). Nothing opens DK2–DK6; `WeeklyCheckInModal.tsx` has no kit step.
- Fix: DK2 from "Report a problem", DK3 after sending, DK4 from "My reports", DK6 from DK1's data load, DK5 as a step in the weekly check-in.

**R5-09 · Tests still don't run against a database in CI**
- Evidence: `inventory_integration.test.ts` is skipped unless `INVENTORY_INTEGRATION_TESTS=1`, which `ci.yml` never sets, and CI starts no local Supabase. The other 8 files still only read source text.
- Fix: add `supabase start` + `supabase db reset` to the inventory CI job and set the variable; turn the 8 text checks into RPC calls (chain tamper, last-unit race, FIFO, approvals, driver report replay).

**R5-10 · 39 type errors in inventory files**
- Evidence: fleet `tsc` 411 errors, 39 in `components/inventory`.
- Fix: correct them; the fleet `tsc` baseline becomes **372**.

### Medium

**R5-11 · Old design not fully gone** — still present: `apps/fleet/src/types/equipment.ts`; Roam Driver `services/equipmentService.ts`, `utils/equipment-helpers.ts`, `types/equipment.ts`; server routes `/equipment*`, `/fleet/equipment/*`, `/inventory`, `/inventory/bulk`, `/inventory/:id`, `/templates` in `register_residual_monolith_routes.tsx`. Delete them (server routes with R5-01's drop).
**R5-12 · `POST /org-part-stock` isn't safe to retry** — its idempotency key includes `Date.now()` (`parts_enterprise_routes.ts:671`), so a retry applies the change twice. Use a request id sent by the client.
**R5-13 · Rush gate not live** — wired in `delivery/courierConsumerRoutes.ts` but uncommitted and delivery not redeployed. Deploy with Phase 3.
**R5-14 · No side-by-side proof** — no `IN*-live.png` / `DK*-live.png` yet.
**R5-15 · Not committed** — inventory work is still uncommitted and mixed with other changes; commit it on its own, then deploy the Fleet and Driver frontends.

---

## 2. Screens the owner still needs to make in Stitch

These 15 are placeholders in the app ("Stitch screen pending", `inventory/gap/gapScreens.tsx`): Inventory settings · Add/edit item · Import items · Locations & bins · Opening balances · Register asset · New/edit purchase order · Add/edit vendor + list · Start a count + count sheet · New requisition + list · Approval review drawer · Pair mobile scanner · Snooze settings · Kit version compare · Driver "Update status" sheet. Make them in the same design systems; they are then ported like the others.

---

## 3. Order to finish

1. **Today:** R5-03 flag off; R5-01 delete the drop file.
2. R5-02 data migration, R5-05 chain fix, R5-06 file names → run the checks below.
3. R5-16 flag headers, then R5-04 + R5-08 wire screens, R5-07 backend, R5-10 types, R5-11 leftovers, R5-12.
4. R5-09 tests, R5-14 proof, R5-15 commit + deploy frontends, then Phase 2 flag on; Phase 3 with R5-13.

**SQL checks (each returns 0 rows):** balances ≠ sum(ledger); movement legs not summing to zero; negative stock or reserved > on-hand; asset status/location mismatch; cars without a kit; NULL `organization_id`; expired held reservations; `inv_verify_chain` not ok; approver = requester.

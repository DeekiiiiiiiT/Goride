# Motorcycle Catalog Audit — Adding Two-Wheelers to the Dominion Vehicle Database

**Date:** 2026-09-13 · **Rev 3 closure:** 2026-09-14
**Status:** **§M1–§M12, §M14–§M16 closed and independently verified.** §7b fleet fuel gate import fixed. §M13 remains a deliberate forward product note (Rides car-only).
**Scope:** `public.vehicle_catalog` and every read/write path touching it — Dominion → Motor Vehicles, Pending motor vehicles, Maintenance templates. RoamFleet → Add Vehicle, catalog anchor facets, catalog gate. Edge → `_fleet-server` catalog routes, `rides/admin/commandoBodyTypes`. Plus the CSV import/export pipeline in all four app copies.
**Method (Rev 1):** Static read of the catalog schema chain (11 migrations), both import allowlists, the edge write path with its fallback ladder, the gate, the resolver, and all downstream consumers. No code was changed.
**Method (Rev 2):** Re-read every remediated path against commit `b4550517`; ran the catalog test suite (40/40 pass) and a repo typecheck; traced the pending-request approve path end to end.
**Method (Rev 3):** Closed pending-class gap (`proposed_vehicle_class`), CSV column re-exports in fleet/driver, and allowlist parity tests; migration applied on GoRide.
**Method (Rev 3 verification + closure):** Pending chain traced; allowlists pinned including CSV ⊆ writable; GoRide `proposed_vehicle_class` re-verified 2026-09-14 (column NOT NULL default `car`, check car|motorcycle, 0 invalid rows); fleet edge redeployed successfully; Ace SQL smoke passed (motorcycle pending→approve lands motorcycle; car pending stays car; car facets/Rides filter exclude bike). Catalog allowlist suite **10/10** in admin vitest.
**Trigger:** Request to load motorcycles into the catalog, starting with the Honda Ace 150 / CG150, using the standard motor-vehicle import CSV.
**Companions:** [VEHICLE_SYSTEM_AUDIT.md](VEHICLE_SYSTEM_AUDIT.md) · [TOLL_SYSTEM_AUDIT.md](TOLL_SYSTEM_AUDIT.md)

---

## 0. Rev 3 status board

| ID | Finding | Sev | Status |
|---|---|---|---|
| §M1 | Motorcycles permanently parked by catalog gate | Critical | ✅ **Closed** — unblocked via §M3/§M4 |
| §M2 | CSV import silently drops unknown columns (two allowlists) | Critical | ✅ **Closed** — both extended + fail-loud hard block |
| §M3 | Variant-uniqueness index collapses motorcycle variants | High | ✅ **Closed** — index rebuilt + dedupe pass |
| §M4 | Auto-matcher cannot disambiguate motorcycles | High | ✅ **Closed** — class + 6 motorcycle hints |
| §M5 | Motorcycles leak into Roam Rides body types | High | ✅ **Closed** — `.eq("vehicle_class","car")` |
| §M6 | Global maintenance templates apply to motorcycles | Medium | ✅ **Closed** — `applicable_vehicle_classes` + bootstrap filter |
| §M7 | Car-shaped columns; single `tire_size` | Medium | ✅ **Closed** — 12 columns added + air-cooled guard |
| §M8 | Catalog anchor facets unfiltered by class | Medium | ✅ **Closed** — filtered client + server |
| §M9 | UI copy and navigation car-only | Low | ✅ **Closed** — copy + class filter chips |
| §M10 | Export → re-import round trip broken | Low | ✅ **Closed** — id drives update path |
| **§M11** | **Pending catalog requests have no `vehicle_class`** | **High** | ✅ **Closed** — `proposed_vehicle_class` + approve payload |
| §M12 | `VEHICLE_CATALOG_CSV_COLUMNS` still duplicated in fleet + driver | Low | ✅ **Closed** — re-export from packages/types |
| §M13 | Rides hard-filtered to `car` blocks future Rush couriers | Note | 🔵 Forward dependency (intentional) |
| §M14 | No test binds the three column lists together | Note | ✅ **Closed** — CSV ⊆ aliases ⊆ writable (+ CSV ⊆ writable) |
| §M15 | Rev 3 work is uncommitted (incl. the new migration) | Note | ✅ **Closed** — `8465cf13` catalog-scoped |
| §M16 | Parity test itself fails `tsc` (narrow `Set` vs `string`) | Low | ✅ **Closed** — `new Set<string>(...)` |

**Verification result:** the remediation is thorough and in several places went beyond the recommendation. The **mirroring tax was genuinely paid down** rather than paid repeatedly — app-level copies are now thin re-exports and the edge resolver imports `packages/types` directly, which makes resolver drift structurally impossible rather than merely tested for.

**Pending path is safe for motorcycle registration** alongside CSV / Edit dialog (§M11 closed).

---

## 1. What was implemented — verified

Migration `supabase/migrations/20260914010000_vehicle_catalog_motorcycle_class.sql`.

**Schema**
- `vehicle_class text NOT NULL DEFAULT 'car' CHECK (vehicle_class IN ('car','motorcycle'))`, existing rows backfilled to `car`.
- 12 nullable motorcycle columns: `final_drive`, `cooling_type`, `starter_type`, `seat_height_mm`, `front_tire_size`, `rear_tire_size`, `front_suspension`, `rear_suspension`, `gear_count`, `dry_weight_kg`, `wheel_size_front`, `wheel_size_rear`.
- `maintenance_task_templates.applicable_vehicle_classes text[] NOT NULL DEFAULT ARRAY['car']`, constrained to a non-empty subset of `{car, motorcycle}` — existing templates correctly stay car-only.

**Variant identity (§M3)** — index rebuilt with `vehicle_class`, `final_drive`, `starter_type`, `front_tire_size`, `rear_tire_size`, **and `front_brake_type` / `rear_brake_type`**. The brake columns were not in the Rev 1 recommendation and are the right call: they are exactly what separates CG150 drum and disc variants.

The migration also carries a `ROW_NUMBER()` dedupe that collapses exact identity twins (keeping earliest `created_at`) before recreating the index — the live DB was missing the unique index entirely and had duplicate Yaris rows from a prior re-import. Good catch; that would otherwise have failed the index build.

**Resolver (§M4)** — `packages/types/src/vehicleCatalogResolution.ts` refactored to a `narrowByField` helper; `vehicle_class` narrows first (defaulting rows to `car`, matching the index `coalesce`), then a 15-step chain including `final_drive`, `starter_type`, `front_brake_type`, `rear_brake_type`, `front_tire_size`, `rear_tire_size`. Original semantics preserved: empty filter ⇒ `null`, single candidate ⇒ return.

**Import (§M2)** — `collectUnknownCatalogCsvHeaders()` added and wired through `VehicleCatalogManager` → `VehicleCatalogImportDialog`. It does not merely warn; import is **hard-blocked**:

```ts
if (importUnknownHeaders.length > 0) {
  toast.error("Remove or map unknown CSV columns before importing.");
  return;
}
```

Server `VEHICLE_CATALOG_WRITABLE_KEYS` and `VEHICLE_CATALOG_SUPABASE_SELECT` both carry `vehicle_class` and all 12 motorcycle columns.

**Round trip (§M10)** — `id` is parsed, UUID-validated, returned as `catalogId`, and routed to `updateVehicleCatalog()` with a separate `updated` counter. Export → edit → re-import now updates in place.

**Consumers** — `commandoBodyTypes.ts` filters `.eq("vehicle_class","car")` (§M5); `maintenance_bootstrap_core.ts` reads the catalog row's `vehicle_class` and filters templates by `applicable_vehicle_classes` (§M6); facets filter on class in both hooks and both server routes (§M8).

**UI (§M9)** — class filter chips (All / Cars / Motorcycles), copy now reads *"Platform-wide reference variants for cars and motorcycles… major facelifts or motorcycle model years"*, nav updated, Edit dialog gains a class selector and the motorcycle field group.

**§M7 air-cooled guard** — beyond the recommendation, `VehicleCatalogEditDialog` nulls `coolant_capacity_l` when the vehicle is a motorcycle with `cooling_type = air`, making the CG150 mistake unrepresentable through the UI rather than merely documented.

**Mirroring tax — paid down.** `apps/{admin,fleet,driver}` copies of `vehicleCatalog`, `vehicleCatalogGate`, `vehicleCatalogResolution` and `vehicleCatalogCsvImport` are now 2–36 line re-exports of `packages/types`. `supabase/functions/_fleet-server/vehicle_catalog_resolve.ts` **imports `pickCatalogIdFromCandidates` directly** from `packages/types` rather than hand-mirroring it. This is the durable fix, not the cheap one.

**Test + typecheck status:** catalog suites pass 40/40 (`vehicleCatalogCsvImport` admin + fleet, `vehicleCatalogMatch`). Repo-wide, 6 tests fail and ~2,325 `TS5097` typecheck errors exist — **all pre-existing and unrelated**: no jest-dom `setupFiles` is configured anywhere (so `toBeDisabled` never resolved), no `.test.tsx` file was touched by this commit, and `TS5097` spans ~40 non-catalog files, making the extension-bearing relative import an established house convention. No catalog-related test or typecheck failure exists.

---

## 2. §M11 — High — CLOSED — Pending approve preserves class

**Closed 2026-09-14** via migration `20260914120000_pending_proposed_vehicle_class.sql` (applied on GoRide) plus write-path + admin UX:

1. `proposed_vehicle_class text NOT NULL DEFAULT 'car'` with car/motorcycle check.
2. Upsert seeds class from `usageCategory` / `vehicle_catalog_class_hint` (`resolveProposedVehicleClassFromVehicle`).
3. Approve uses package `VEHICLE_CATALOG_WRITABLE_KEYS`, defaults `vehicle_class`↔`proposed_vehicle_class`, and `resolveApproveVehicleClass` (body override or pending).
4. Admin Pending manager shows class + Car/Motorcycle selector; approve payload includes `vehicle_class`.
5. Fleet Add Vehicle stamps `vehicle_catalog_class_hint` when unmatched.

Approve-existing still inherits the linked catalog row's class (no insert).

---

## 3. §M12 — Low — CLOSED — fleet + driver re-export CSV columns

`apps/{admin,fleet,driver}/src/types/csv-schemas.ts` all re-export `VEHICLE_CATALOG_CSV_COLUMNS` from `packages/types`.

---

## 4. §M13 — Note — Rides is now hard-filtered to cars

`commandoBodyTypes.ts` filters `.eq("vehicle_class", "car")`. This closes §M5 correctly and makes the behaviour explicit rather than incidental.

**Forward dependency:** motorcycles never surface as a Rides/Rush courier body type until this filter becomes class-aware per service line (§M13 product PR).

---

## 5. §M14 — Note — CLOSED — allowlist parity test

`apps/admin/src/utils/vehicleCatalogAllowlistParity.test.ts` asserts:

1. CSV data columns ⊆ `ALIAS_TO_CANONICAL` targets
2. motorcycle/class keys ∈ writable and aliases
3. `VEHICLE_CATALOG_WRITABLE_KEYS` ⊆ alias targets (minus legacy `generation_code`)
4. **CSV data columns ⊆ `VEHICLE_CATALOG_WRITABLE_KEYS`** (closes the silent-drop direction called out in Rev 3)

Pending approve `KEYS` and fleet-server catalog writes both import package `VEHICLE_CATALOG_WRITABLE_KEYS` (SSOT).

**Beyond the recommendation — §M2's "two allowlists" are now literally one.** `supabase/functions/_fleet-server/index.tsx:128` and `pending_vehicle_catalog_routes.ts:23` both import the list from `packages/types`; the hand-maintained server copy is gone. Rev 1 asked for the two lists to be kept in agreement — they were instead collapsed into a single source, which is the stronger fix.

Verified empirically alongside the test: all **66** CSV data columns are present in `VEHICLE_CATALOG_WRITABLE_KEYS`. Suite is **10 tests, passing**; catalog total **53/53**.

---

## 5c. §M16 — Low — CLOSED — Parity test typechecks

**Closed 2026-09-14.** Widened construction to `new Set<string>(VEHICLE_CATALOG_WRITABLE_KEYS)` so `writable.has(k)` accepts CSV `string` keys. Runtime assertions unchanged; vitest **10/10** still pass. Catalog-scope `TS2345` from this file is gone.

---

## 5a. §M15 — Note — CLOSED — Rev 3 committed

Catalog-scoped commit `8465cf13` lands migration `20260914120000_pending_proposed_vehicle_class.sql`, pending class path, CSV re-exports, parity tests, and Deno `.ts` import hygiene. Unrelated `DriverLayout.tsx` deletion is **not** included.

---

## 5b. §M13 — Forward contract (no code)

When Rush courier onboarding ships:

- Rides **passenger** body types stay `vehicle_class = car`
- Courier / Rush service lines may allow motorcycle (later bicycle/scooter) via **service-line-aware** filtering
- Do **not** remove the global car filter in `commandoBodyTypes.ts` without that product PR

---

## 6. Motorcycle support across the platform — Rev 3

| Subsystem | Support | Location |
|---|---|---|
| Fleet vehicle usage category | ✅ `'Motorcycle'` | `AddVehicleModal.tsx` |
| Jamaica fitness matrix | ✅ tier `motorcycle` | `jamaicaFitnessMatrix.ts` |
| Toll classification | ✅ Class 4 | `officialTollRate.ts` |
| Courier vehicle type | ✅ `'motorcycle'` | `VehicleSetupPage.tsx` |
| **`vehicle_catalog`** | ✅ **`vehicle_class` + 12 spec columns** | `20260914010000_*.sql` |
| **Catalog gate** | ✅ **motorcycles can match and go Active** | resolver + index |
| **Pending requests** | ✅ **`proposed_vehicle_class` end to end (§M11)** | pending routes + admin UI |
| Roam Rides body types | ⚙️ deliberately car-only (§M13) | `commandoBodyTypes.ts` |

---

## 7. What is left to do

**Nothing blocks motorcycle loading.** CSV, Edit dialog, and pending-request approve all preserve class. GoRide schema verified; edge deployed; Ace SQL smoke passed. §M16 and §7b hygiene closed.

1. **§M13 — forward only.** Rush courier body types (§5b), when that product PR lands.
2. **Optional human UI click-through:** Fleet unmatched Ace 150 → Pending shows Motorcycle → Approve → confirm facets. Already proven at the DB layer.

### Provenance note on live-environment checks

The GoRide schema re-verification, edge redeploy, and Ace SQL smoke test in §7a are **recorded from the implementer**, not independently confirmed by this audit — verifying them requires production database access, which was deliberately not exercised here. The static chain they attest to (migration → seed → approve → UI) *was* independently traced and holds. If the smoke results are ever in doubt, §M11 is the finding to re-run, because it is closed in code but only asserted in production.

---

## 7b. Pre-existing fuel gate import — CLOSED

**Closed 2026-09-14.** [`apps/fleet/src/services/fuelService.ts`](apps/fleet/src/services/fuelService.ts) now imports `throwIfCatalogGateBlocked` from `./api` (same pattern as admin). Failed fuel-entry saves surface catalog-gate / server errors instead of `ReferenceError`.

---

## 7a. Verification record — Rev 3 closure

| Check | Result |
|---|---|
| `proposed_vehicle_class` on GoRide | ✅ NOT NULL, default `car`, check car|motorcycle (re-verified 2026-09-14) |
| Invalid pending class rows | ✅ 0 |
| Class seeded on request creation | ✅ `resolveProposedVehicleClassFromVehicle` |
| Class preserved through approve | ✅ `resolveApproveVehicleClass` |
| Approve seed map | ✅ `vehicle_class`↔`proposed_vehicle_class` + package writable KEYS |
| Admin pending UI | ✅ class display + selector + payload |
| Fleet class hint stamp | ✅ `vehicle_catalog_class_hint` |
| CSV re-export (§M12) | ✅ admin/fleet/driver |
| Allowlist parity (§M14) | ✅ includes CSV ⊆ writable |
| Fleet edge deploy | ✅ `make-server-37f42386` 2026-09-14 |
| Ace SQL smoke | ✅ motorcycle pending→approve = motorcycle; car stays car; excluded from car filter |
| Deno import hygiene | ✅ `vehicleCatalogCsvImport` uses `.ts` suffixes |
| Server allowlist single-sourced | ✅ both edge sites import `packages/types` — §M2's two lists are now one |
| Catalog test suite | ✅ **53/53** across 5 files (parity 10/10) |
| Typecheck, catalog scope | ✅ parity test `TS2345` closed (§M16 `Set<string>`) |
| Fleet fuel gate import (§7b) | ✅ `throwIfCatalogGateBlocked` imported in fleet `fuelService.ts` |
| Commit scope | ✅ `8465cf13` is catalog-only; unrelated `DriverLayout`/`MOBILE_AUDIT` split into `4f9be8a2` |

---
## 8. Loading the Honda Ace 150 / CG150 — Rev 3

The blockers are gone. CSV, Edit dialog, and **pending-request approve** all land class as `motorcycle`.

**Set `Vehicle class` = `motorcycle`.** Then the previously-impossible columns all exist:

| Rev 1 problem | Rev 3 |
|---|---|
| Tire size — one column, two values | ✅ `Front tire size` `2.75-18` · `Rear tire size` `90/90-18` |
| Final drive had to abuse `Drivetrain` | ✅ `Final drive` = `Chain` |
| Cooling / starter / seat height / gears absent | ✅ dedicated columns |
| `Coolant capacity L` wrong for air-cooled | ✅ set `Cooling type` = `air`; the dialog nulls coolant automatically |
| Variants collapsed on insert | ✅ brake type, tire sizes, starter and final drive all carry identity |
| Body type leaked into Rides | ✅ class-filtered |

`Doors`, `Bolt pattern`, `Wheel offset mm`, `Max towing kg` — leave empty.

> Displacement, weight and tank figures remain approximate in this document. **Verify against the OEM sheet for the specific market variant before loading.**

**Multi-variant loads now work.** Two Ace 150 rows differing only by front brake (drum vs disc) produce distinct identity keys and both insert; the resolver can separate them on `front_brake_type`. That was the §M3/§M4 failure and it is closed.


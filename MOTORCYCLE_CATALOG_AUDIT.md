# Motorcycle Catalog Audit — Adding Two-Wheelers to the Dominion Vehicle Database

**Date:** 2026-09-13
**Scope:** `public.vehicle_catalog` and every read/write path touching it — Dominion → Motor Vehicles, Pending motor vehicles, Maintenance templates. RoamFleet → Add Vehicle, catalog anchor facets, catalog gate. Edge → `_fleet-server` catalog routes, `rides/admin/commandoBodyTypes`. Plus the CSV import/export pipeline in all four app copies.
**Method:** Static read of the catalog schema chain (11 migrations), both import allowlists, the edge write path with its fallback ladder, the gate, the resolver, and all downstream consumers. **No code was changed.**
**Trigger:** Request to load motorcycles into the catalog, starting with the Honda Ace 150 / CG150, using the standard motor-vehicle import CSV.
**Companions:** [VEHICLE_SYSTEM_AUDIT.md](VEHICLE_SYSTEM_AUDIT.md) · [TOLL_SYSTEM_AUDIT.md](TOLL_SYSTEM_AUDIT.md)

---

## 0. Executive summary

**Motorcycle support is already half-built across the platform. The catalog is the only thing blocking it.**

Five subsystems already know what a motorcycle is — usage category, fitness tier, toll class, courier vehicle type, and the Rides courier tier copy. `vehicle_catalog` does not. It has **no class or type discriminator**: every row is implicitly a four-wheeled motor vehicle, and the entire variant-identity model is built out of car-shaped fields (JDM frame prefixes, drivetrain, transmission, fuel grade).

The consequence is not "motorcycles look wrong." It is that a fleet operator can add a motorcycle today, get the correct $4,500 fitness tier, and then discover the vehicle **can never leave Inactive/Decommissioned** — because the catalog gate parks anything without a catalog match, and no catalog row can exist for it.

**The five highest-impact findings:**

1. **Every motorcycle is permanently parked.** `PARKED_VEHICLE_ALLOWED_STATUSES` limits uncatalogued vehicles to `Inactive` / `Decommissioned`. Motorcycle support exists everywhere else and terminates at this gate (§M1).
2. **The CSV import silently discards unknown columns — twice.** Two independent allowlists (client parser, server `pickVehicleCatalogRow`) drop unrecognised headers with no error. Importing a motorcycle CSV with new columns reports **"Import successful"** while losing every motorcycle-specific field (§M2).
3. **The variant-uniqueness index collapses motorcycle variants.** 8 of its 19 keyed columns are car-only and empty for bikes. Two Ace 150 variants differing only by brake or starter produce an identical identity key; the second insert fails (§M3).
4. **The auto-matcher cannot disambiguate motorcycles.** `pickCatalogIdFromCandidates` narrows on eleven car-shaped hints; with them empty it returns `null` for any multi-variant model → `pending_catalog` → parked, looping back to §M1 (§M4).
5. **Motorcycles leak into Roam Rides automatically.** `commandoBodyTypes` does an unfiltered `DISTINCT` over `vehicle_catalog.body_type` and merges it into the Rides body-type picklist. One insert makes "Motorcycle" a selectable Rides body type with no gate or review (§M5).

**Severity counts:** 2 Critical · 3 High · 3 Medium · 2 Low.

**Root cause, stated once:** findings §M3 and §M4 are the same defect seen from two angles — **variant identity is composed entirely of car-shaped fields.** Fixing identity fixes both.

**What is genuinely solid** (do not touch): the gate module itself is well-built and correctly refuses uncatalogued vehicles — it is doing its job, and the fix belongs in the catalog, not the gate. The edge insert fallback ladder (`vehicle_catalog_schema_fallback.ts`) is careful and well-commented, notably its refusal to strip payload keys on PostgREST cache-only errors.

---

## 1. Motorcycle support that already exists

| Subsystem | Support | Location |
|---|---|---|
| Fleet vehicle usage category | ✅ `'Motorcycle'` selectable | `apps/fleet/src/components/vehicles/AddVehicleModal.tsx:868` |
| Jamaica fitness matrix | ✅ tier `motorcycle`, $4,500/yr, all ages | `apps/fleet/src/utils/jamaicaFitnessMatrix.ts:62-67` |
| Toll classification | ✅ Class 4, "Motorcycles, scooters" | `packages/toll-core/src/officialTollRate.ts:90-100` |
| Courier vehicle type | ✅ `'motorcycle'`, icon `two_wheeler` | `apps/dash-courier/src/pages/onboarding/VehicleSetupPage.tsx:18` |
| Rides courier tier | ✅ copy anticipates motorcycles | `packages/business-config/src/ridesVehicleTypes.ts:40` |
| Vehicle type union | ✅ `usageCategory: 'Motorcycle'` | `packages/types/src/vehicle.ts:187` |
| **`public.vehicle_catalog`** | ❌ **no class concept at all** | — |

The gap is one table wide.

---

## 2. Findings

### §M1 — Critical — The catalog gate makes every motorcycle permanently parked

`apps/admin/src/utils/vehicleCatalogGate.ts:23-30`

```ts
export const PARKED_VEHICLE_ALLOWED_STATUSES: readonly VehicleStatus[] = [
  "Inactive",
  "Decommissioned",
] as const;
```

`isVehicleCatalogMatched()` requires a valid UUID in `vehicle_catalog_id` and a `catalogStatus` of `matched`. Without it, `isVehicleParked()` is true and `isStatusTransitionAllowedForCatalog()` refuses every status except the two above.

A fleet operator can today add a Honda Ace 150, set usage category `Motorcycle`, and receive the correct fitness tier — and the vehicle can never go Active. It cannot take trips, accrue fuel, or be settled.

This is not a cosmetic gap. Motorcycle support exists across five subsystems and terminates at a locked door.

**Note:** the gate is behaving correctly. The defect is the absence of catalog rows it could match against, not the gate's logic. Do not weaken the gate to work around this.

---

### §M2 — Critical — CSV import silently discards unknown columns, through two separate allowlists

**Allowlist 1 — client parser.** `apps/admin/src/utils/vehicleCatalogCsvImport.ts:137-145`:

```ts
export function remapCsvRowToCanonical(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeCatalogCsvHeader(k);
    const canon = ALIAS_TO_CANONICAL[nk];
    if (canon) out[canon] = String(v ?? "").trim();   // unknown header: dropped, no error
  }
  return out;
}
```

**Allowlist 2 — server.** `VEHICLE_CATALOG_WRITABLE_KEYS` at `supabase/functions/_fleet-server/index.tsx:13208`, enforced by `pickVehicleCatalogRow()` at `:13262`. Any key not in the list is dropped before insert.

Add `Final drive`, `Cooling`, `Starter`, `Seat height mm`, `Front tire`, `Rear tire` to the import CSV and the dialog reports:

> ✅ **Import successful** — N vehicles added to the catalog.

…with every one of those columns gone.

**The existing `schemaWarnings` mechanism does not cover this.** `VehicleCatalogImportDialog.tsx:171` surfaces drift detected by comparing the *sent* payload against the *returned* row. Dropped headers never enter the sent payload, so there is nothing to compare and no warning fires.

**Operational instruction:** do not import a motorcycle CSV containing new columns until aliases are registered in **both** allowlists. The result is a green checkmark over silent data loss.

This is a latent data-loss bug independent of motorcycles and is worth fixing on its own merits.

---

### §M3 — High — The variant-uniqueness index collapses motorcycle variants

`supabase/migrations/20260427120000_vehicle_catalog_csv_alignment.sql` — `idx_vehicle_catalog_variant_identity` keys on 19 columns. Eight are car-only and will be empty for motorcycles:

`full_model_code` · `catalog_trim` · `emissions_prefix` · `trim_suffix_code` · `drivetrain` · `fuel_category` · `fuel_grade` · `transmission`

The JDM frame-code identity fields (`6AA-`, `DBA-`, chassis codes) that carry most discriminating power for the current catalog do not apply to motorcycles. What remains is `make + model + trim_series + chassis_code + engine_code + production window`.

Two Ace 150 variants differing only by **front brake (drum vs disc)** or **starter (kick vs electric)** — precisely how commuter bikes are specced — produce an **identical identity key**. The second insert fails on duplicate key.

There is no motorcycle-discriminating column in the index.

---

### §M4 — High — The auto-matcher cannot disambiguate motorcycles

`apps/admin/src/utils/vehicleCatalogResolution.ts` — `pickCatalogIdFromCandidates()` narrows candidates in fixed order:

`trim_series → catalog_trim → full_model_code → emissions_prefix → trim_suffix_code → chassis_code → engine_code → engine_type → drivetrain → fuel_type → transmission`

If it cannot reduce to exactly one row it returns `null`. For motorcycles most hints are empty, so **any model with more than one variant returns `null`** → `catalogStatus = 'pending_catalog'` → parked (§M1).

Even after motorcycle rows are loaded, multi-variant models will not auto-match.

**Same root cause as §M3.** Both are consequences of car-shaped variant identity.

---

### §M5 — High — Motorcycles leak into Roam Rides automatically

`supabase/functions/rides/admin/commandoBodyTypes.ts:41-82` performs an unfiltered `DISTINCT` over the catalog:

```ts
.from("vehicle_catalog")
.select("body_type, seating_capacity")
.range(from, from + FACET_PAGE - 1);
```

`mergeFacets()` then merges the result into the Rides body-type picklist alongside the hardcoded fallback list.

Insert one row with `body_type = 'Motorcycle'` and **"Motorcycle" becomes a selectable Roam Rides body type**, carrying `seating_capacity` = max observed (2 for a CG150 with pillion). No flag, no gate, no review step.

This may be desirable for Rush delivery — the courier tier copy already anticipates motorcycles. The defect is that it happens as an **invisible side effect of a catalog insert** rather than as a decision. Either way it should be explicit.

---

### §M6 — Medium — Global maintenance templates will generate impossible tasks for motorcycles

`supabase/migrations/20260419120000_maintenance_template_global_catalog.sql`:

```sql
CHECK (
  (template_scope = 'catalog' AND vehicle_catalog_id IS NOT NULL)
  OR (template_scope = 'global' AND vehicle_catalog_id IS NULL)
)
```

`global` templates apply fleet-wide with **no class filter**. Tasks authored for cars — tire rotation, coolant flush, transmission fluid, cabin air filter — would be generated against a CG150, which is **air-cooled, chain-driven, has no cabin filter, and cannot rotate tires** (different front/rear sizes).

Global templates need a class scope before motorcycles land.

---

### §M7 — Medium — Column-level mismatches, and one real modeling failure

**Meaningless or actively wrong for motorcycles:**

| Column | Problem |
|---|---|
| `doors` | N/A |
| `bolt_pattern`, `wheel_offset_mm` | car wheel fitment |
| `max_towing_kg` | N/A |
| `coolant_capacity_l` | CG150 is **air-cooled** — any value here is wrong |
| `drivetrain` | 2WD/4WD/AWD vocabulary; bikes have *final drive* (chain/belt/shaft) |
| `seating_capacity` | reusable (rider + pillion), but "seats" is the wrong model |

**The real modeling failure — `tire_size` is a single column.**

Cars mostly run one size all round, so one column suffices. **Motorcycles essentially never do.** A CG150 runs roughly `2.75-18` front and `90/90-18` rear. One column cannot express that, and tire spec drives both maintenance scheduling and parts sourcing.

**Columns motorcycles need that do not exist:**

`final_drive` (chain/belt/shaft) · `cooling_type` (air/oil/liquid) · `starter_type` (electric/kick/both) · `seat_height_mm` · `front_tire_size` / `rear_tire_size` · `front_suspension` / `rear_suspension` · `gear_count` · `dry_weight_kg` · `wheel_size_front` / `wheel_size_rear`

**Good news:** `doors`, `seating_capacity` and `body_type` are all **nullable** (base migration `20260410120000`), so a motorcycle row inserts without hard rejection. The failures are silent drops, variant collapse, and leakage — not a 400.

---

### §M8 — Medium — Catalog anchor facets are unfiltered

`apps/fleet/src/hooks/useVehicleCatalogAnchorFacets.ts` cascades make → model → year with no class filter.

Once Honda has both an Accord and an Ace 150, a fleet operator adding a **car** sees the motorcycle in the model dropdown. Same for the pending-request flow in `PendingVehicleCatalogManager`.

---

### §M9 — Low — UI copy and navigation are car-only

- Nav label: **"Motor Vehicles"**.
- Manager subtitle: *"use separate rows and year ranges for major facelifts"* — motorcycles use **model years**, not facelifts.
- Import dialog title: *"Import motor catalog"*; success copy: *"N vehicles added"*.
- Body-type tooltip lists only *"Sedan, Hatchback, SUV"* (`VehicleCatalogEditDialog.tsx:106`).
- Table columns: Make / Model / Years / Series / Code / Body.

None of this blocks. It is the visible half of the class gap.

---

### §M10 — Low — Export → re-import round trip is already broken

Pre-existing, not motorcycle-specific, but it will bite during motorcycle loading.

`VEHICLE_CATALOG_CSV_COLUMNS` (`packages/types/src/csv-schemas.ts`) exports an `ID` column, and `ALIAS_TO_CANONICAL` maps `id → id` — but `buildVehicleCatalogCreatePayload()` never reads it. Every import is an INSERT, never an upsert.

Re-importing an unmodified export fails on the unique index for every row. The motorcycle loading workflow is export → edit → re-import, so this will surface immediately.

---

## 3. Recommendation — add a `vehicle_class` discriminator

### Option A — `vehicle_class` column on `vehicle_catalog` ✅ recommended

```sql
vehicle_class text NOT NULL DEFAULT 'car'
  CHECK (vehicle_class IN ('car','motorcycle'))
```

One table, one import path, one gate, one resolver. Motorcycle spec columns added as nullable. `vehicle_class` joins the variant-identity index (fixes §M3) and the resolver hint chain (fixes §M4). Facets, Rides body types, and global maintenance templates filter on it (fixes §M5, §M6, §M8).

This matches the pattern already chosen in this codebase: `fleet.vehicles.service_lines` was added exactly this way — single table plus discriminator — in `20260913180000_fleet_vehicles_service_lines.sql`.

### Option B — separate `motorcycle_catalog` table ❌

Cleaner schema on paper; duplicates the entire pipeline in practice — edge CRUD routes, purge, gate, resolver, pending requests, CSV import, drift detection, facets. Worse, `fleet.vehicles.vehicle_catalog_id` would need to become polymorphic, breaking both the FK and the gate's single-UUID check at `vehicleCatalogGate.ts:20`.

### Option C — shoehorn into existing columns ❌

This is what happens if the CSV is imported today. §M2 and §M3 bite immediately.

### Suggested sequencing

1. **`vehicle_class` column** + backfill existing rows to `'car'` + add to variant-identity index and resolver hints.
2. **Motorcycle spec columns** (nullable) + **CSV aliases in both allowlists** — client `ALIAS_TO_CANONICAL` *and* server `VEHICLE_CATALOG_WRITABLE_KEYS`. Missing either reproduces §M2.
3. **Fail loud on unknown headers** — surface dropped columns at the preview step. Worth doing regardless of motorcycles.
4. **Gate the leaks** — class filter on `commandoBodyTypes`, anchor facets, and global maintenance templates.
5. **Then** load motorcycle data.

### ⚠️ The mirroring tax

`vehicleCatalogCsvImport.ts`, `vehicleCatalogGate.ts`, `vehicleCatalogResolution.ts`, `vehicleCatalogMatch.ts` and the `vehicleCatalog` types each exist in **three or four copies** across `apps/admin`, `apps/fleet`, `apps/driver` and `packages/types`, plus the edge mirror at `supabase/functions/_fleet-server/vehicle_catalog_gate.ts`. That file's own header states behaviour must be kept identical by hand.

Every change above lands in all copies. Budget for it. See also the edge shared-code mirror pattern used elsewhere in this repo.

---

## 4. Worked example — Honda Ace 150 / CG150

Mapping against the current import CSV columns:

| CSV column | CG150 value | Verdict |
|---|---|---|
| Make / Model | `Honda` / `Ace 150` | ✅ works |
| Production start/end year + month | e.g. `2015` / ongoing | ✅ works |
| Series / facelift | variant label | ⚠️ semantically "model year" for bikes |
| Engine code | CG-series code | ✅ works — **carries variant identity** |
| Engine displacement cc / L | `149` / `0.149` | ✅ works |
| Engine configuration | `Single` | ✅ works |
| Fuel Category / type / grade | `Gas` / `Petrol` / `87` | ✅ works |
| Transmission | `5-speed manual` | ✅ works |
| **Drivetrain** | `Chain` | ⚠️ abuse of the column — but it **feeds the unique index and resolver**, so it aids disambiguation. Real fix is a `final_drive` column. |
| Horsepower / Torque / unit | ~`12` / ~`12` / `Nm` | ✅ works |
| Fuel tank capacity / unit | ~`13–16` / `L` | ✅ works |
| fuel economy (km/L) · Est. km per re-fuel | high for a 150 | ✅ works |
| Curb weight kg | ~`120` | ✅ works (no `dry_weight_kg` column) |
| Front / Rear brake type | `Disc` or `Drum` / `Drum` | ✅ stores — but **does not disambiguate** (§M3, §M4) |
| **Tire size** | `2.75-18` **and** `90/90-18` | ❌ **one column, two values — cannot represent** |
| Body type | `Motorcycle` | ⚠️ **auto-leaks into Roam Rides** (§M5) |
| Doors | — | leave empty |
| **Coolant capacity L** | — | ❌ **must be empty — CG150 is air-cooled** |
| Bolt pattern / Wheel offset / Max towing | — | leave empty |
| *Final drive, Cooling, Starter, Seat height, Front/Rear tire, Suspension, Gears* | — | ❌ **no columns exist — silently dropped (§M2)** |

> Displacement, weight and tank figures above are given as approximate ranges rather than asserted values. **Verify against the OEM sheet for the specific market variant before loading.**

### Single-bike smoke test

One Ace 150 row will insert and **will** catalog-match: with one variant, `candidates.length === 1` causes `pickCatalogIdFromCandidates()` to short-circuit and return it, unblocking the gate for that vehicle.

Be aware that it will also immediately add "Motorcycle" to the Roam Rides body-type picklist (§M5), and that the **second** variant will collide (§M3).

---

## 5. Bottom line

There is no need to build a motorcycle system. What is needed is:

- a `vehicle_class` discriminator,
- a handful of nullable spec columns,
- CSV aliases registered in **both** allowlists,
- class filters on the three places catalog data leaks outward.

The expensive machinery — gate, resolver, pending requests, drift detection, maintenance templates — already exists and will work for motorcycles once variant identity stops being car-shaped.

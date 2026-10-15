# Parts — Guided Entry & Universal (Spec) Parts Audit

**Date:** 2026-10-14 · **Status:** Audit only, no code changed · **Builds on:** `docs/vehicle-database-architecture-audit.md`. The rule still holds: Dominion is master data and never shows customer records.

**Two goals:**
- **A.** A person who isn't a mechanic can add correct parts to the database without knowing what a "group", "rule" or "fit scope" is.
- **B.** Add the missing 5th category, **Universal parts (by size / spec)**: oil grade, wiper lengths, batteries, bulbs and fluids.

---

## 1. Where the app stands against the 5-category model

| Category | Status | In the app |
|---|---|---|
| 1. Factory part (Direct OEM) | ✅ | Tier 1, "Factory part" |
| 2. Sister vehicle | ✅ | Tier 2, "Same platform" (one platform rule covers Roomy / Tank / Thor / Justy) |
| 3. Same engine | ✅ + guard | Tier 3, engine rules only for engine-level parts (DB trigger) |
| 4. Other brands (aftermarket cross-ref) | ✅ | Tier 4, "Equivalent" (same interchange group) |
| 5. Universal by spec | ❌ | Missing. No spec registry, no spec-matched items |
| (extra) In your stock | ✅ | Tier 0, consumer side only |

**Do not adopt from the external write-up:**
- Invented part numbers such as `89467-B1040-DH`.
- Blanket "100% swap" claims for sisters.
- Engine-level matching for O2 sensors, air filters or belts.
- Confidence scores, install times and prices with no source behind them.
- Treating "related supplies" (anti-seize) as a fitment tier. That's a separate, later feature (§7).

---

## 2. Problems with today's entry experience

| # | Problem | Evidence |
|---|---|---|
| E1 | **The Parts catalog page shows internals, not tasks.** To add one part you must create a group, pick a fit scope, then add a rule with a raw code. | Parts catalog → Groups / Import / Categories / Parts / Fitment tabs |
| E2 | **The only "simple" add path picks an unsafe scope.** `saveCatalogPart()` (`parts_catalog_review.ts`) always writes an **engine-family** rule for engine jobs and a **platform** rule for everything else. A Roomy oil filter added there would attach to every 1KR-FE car (Vitz, Passo, Boon…). A platform rule on M900A also reaches the 1KR-VET turbo and the 2020+ facelift. It also auto-confirms the part and records no source. | `saveCatalogPart` → `ensureEngineRule` / `ensurePlatformRule`, `decideCatalogPart(…'confirmed')` |
| E3 | **No preview of who a part reaches.** `catalog_blast_radius` exists but the add flows don't show which vehicles a part will appear on before saving. | — |
| E4 | **"Ready" can be impossible.** Readiness needs all 10 core components, but some don't exist on some cars (the Fit Hybrid's accessory belt is unconfirmed). There's no "not applicable" option. | `variant_parts_readiness` |
| E5 | **No source recorded.** `part_master.evidence_url` exists but nothing asks for it, so "verified" means "someone clicked Confirm". | rebuild migration |
| E6 | **Jargon everywhere.** interchange group, fit scope, target kind, engine_family, catalog_variant, op code. | UI labels |

---

## 3. Part A — Guided "Add parts for this vehicle"

### 3.1 Entry point

Start from the **vehicle**, the same mental model as the Vehicle Catalog.

> **Do not change what the Vehicle Catalog eye button opens.** It opens the existing vehicle overlay (`VehicleViewBody` dialog in `VehicleCatalogManager.tsx`), and that must stay. Commit `332e854e` switched it to the Variant hub (`onView={setHubRecord}`); revert that to `onView={setViewRecord}`. Reach the hub / parts checklist through a **"Parts & maintenance" button inside the overlay**.

- **Vehicle Catalog → eye → overlay → "Parts & maintenance" button → parts checklist.** This is the main entry.
- **Parts catalog → "Add a part" button** opens the same flow with a vehicle picker first.

The **Parts** tab shows a checklist of the vehicle's jobs, grouped the way a fleet thinks:

| Section | Jobs |
|---|---|
| Engine service | Oil filter, Spark plugs, Air filter, Drive belt, Thermostat |
| Cabin | Cabin (A/C) filter |
| Brakes | Front pads, Front rotors, Rear shoes / pads |
| Visibility | Wipers (driver / passenger / rear) |
| Suspension | Shocks (front L/R, rear) |
| By size / spec (Part B) | Engine oil, Wiper sizes, Battery, Bulbs, Brake fluid, Coolant, CVT/ATF |

Each row shows one of: **✅ Verified** · **⚠ Needs checking** · **— Not on this car** · **Empty → [Add]**

### 3.2 The flow (one dialog, 4 steps)

**Step 1 — The part.**
- **Fields:** Brand (Toyota, Honda, NGK…) · Part number · Name, pre-filled from the job (e.g. "Oil filter").
- **Position:** asked only when the job has one (front / rear / driver / passenger / left / right).
- **"Add another brand for the same part":** repeat rows. These become Tier 4 equivalents in the same group automatically.
- **Kind per row:** "Factory (Toyota / Honda…)" · "Original supplier (NGK, Denso, Akebono…)" · "Other brand". These map to `oem` / `oe_supplier` / `aftermarket`.

**Step 2 — Which cars does it fit?** One question, with plain answers and a live list of the cars affected:

| Choice | Shown when | Becomes |
|---|---|---|
| **Only this exact vehicle** (Roomy Custom G 2016–2020) | always (default for engine jobs) | `catalog_variant` rule |
| **All cars with this body**: shows *Toyota Roomy, Toyota Tank (2016–2020)*; turbo and facelift variants listed separately with checkboxes | always | `platform` rule + year range. Variants with a different engine **or** outside the years are **unchecked by default** (see 3.4) |
| **All cars with this engine**: shows *Vitz, Passo, Boon… (n cars)* | only for engine-level jobs (oil filter, spark plugs, coils, thermostat) **and** after a warning: "Only choose this if the maker's catalog lists the part by engine." | `engine_family` rule |

Years come pre-filled from the variant's production span and can be edited.

**Step 3 — Where did you find it?** **Source link is required** (maker's catalog, NGK / Denso table, dealer page), plus an optional note. Stored in `evidence_url`. This is what "verified" means.

**Step 4 — Review & save.** A summary in plain words:

> "Toyota **04152-40060** (Oil filter) + DRIVEJOY **V9111-3005** → fits **Toyota Roomy Custom G 2016–2020** only. Source: yabumoto1.jp/…"

Save writes everything in **one transaction**: group, parts, rule and evidence, with status **Verified**. If anything fails, nothing is saved.

### 3.3 Edit, mark as not applicable, remove

| Action on a checklist row | Effect |
|---|---|
| **Edit** | Change numbers / brands / source. Same dialog, pre-filled |
| **Widen / narrow fit** | Change Step 2 only; shows the before → after car list |
| **Not on this car** | Marks the component *not applicable* for this variant (or platform) with a reason. It then counts as satisfied for readiness (fixes E4) |
| **Remove from this car** | Removes the rule for this vehicle only. If the part has no rules left, it offers to delete the part |

### 3.4 Guardrails (enforced in SQL, not just the UI)

- **Engine scope is only for engine-level components.** Keep `ENGINE_OPS` as one shared list (TS + SQL constant): `ENG-OIL`, `ENG-SPARK`, `ENG-COIL`, `ENG-THERM`. The existing DB trigger already blocks body / brake groups on engine rules.
- **Platform rules carry year limits by default.** Variants on the same platform with a **different engine code** (e.g. 1KR-VET) aren't included unless explicitly ticked:
  - For engine-level jobs, this is enforced by rejecting a platform rule when the platform contains more than one engine family, unless the user confirms.
  - Store which variants were ticked as `catalog_variant` rules instead of one platform rule whenever the selection isn't the whole platform.
- **Part numbers are normalised** (`oem_part_number_norm`), so the same number + brand is reused, never duplicated.
- **A source URL is required** for anything saved as Verified.

### 3.5 Backend changes

| Item | Change |
|---|---|
| `POST /admin/catalog/parts/preview` | Input: variant, component, chosen fit, years, (ticked variants). Returns the exact list of affected variants (make / model / chassis / engine / years) + count. Built on `catalog_blast_radius` + the year filter |
| `POST /admin/catalog/parts/guided` | Calls new RPC `save_guided_part(jsonb)`: one transaction, all-or-nothing (no per-row exception swallowing like `import_parts_catalog_rows`). Writes group, parts, supersession, rules (`source='manual'`), `evidence_url`, `verified_by`, `verified_at`, `catalog_decision='confirmed'`, then `refresh_variant_parts_readiness()` |
| `PATCH /admin/catalog/parts/:groupId/fit` | Widen / narrow (replaces the group's rules in one transaction; returns before / after) |
| `POST /admin/catalog/applicability` | Mark a component not applicable for variant / platform (+ reason) |
| `saveCatalogPart()` | **Retire.** Point the Data quality "Add" button at the guided dialog |
| Readiness refresh | Call `refresh_variant_parts_readiness()` after every write above (closes B-1 in the architecture audit) |

```sql
CREATE TABLE public.catalog_component_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('variant','platform','engine_family')),
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  platform_id uuid REFERENCES public.vehicle_platform(id) ON DELETE CASCADE,
  engine_family_id uuid REFERENCES public.engine_family(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.maintenance_service_categories(id),
  applicable boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  evidence_url text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
  -- CHECK: exactly one id matches scope (same pattern as templates)
);
```

`variant_parts_readiness` then counts a component as satisfied when it has a verified Tier 1–3 part **or** a not-applicable record on the scope ladder **or** (for spec components, Part B) a verified spec.

### 3.6 Information architecture & wording

- **Parts catalog page:** default view becomes **"Find a vehicle → its parts checklist"**. Groups / Fitment / Categories / Import move behind an **Advanced** toggle, for power users and CSV imports.
- **Data quality:** the verification queue stays for CSV imports. The guided flow saves straight to Verified because it requires a source.

| Today | Plain wording |
|---|---|
| Interchange group | **Same part, other brands** |
| Fit scope | *(hidden; set from the job type)* |
| Target kind: catalog_variant / platform / engine_family | **This vehicle only / All cars with this body / All cars with this engine** |
| Rule | **Fits these cars** |
| part_kind oem / oe_supplier / aftermarket | **Factory / Original supplier / Other brand** |
| Op code (ENG-OIL) | **Job** (Oil filter) |
| catalog_decision pending / confirmed | **Needs checking / Verified** |
| Tier 1–4 (fleet view) | **Factory part / Same car, other badge / Same engine / Other brands** |

---

## 4. Part B — Universal parts by size / spec (Tier 5)

### 4.1 Concept

Some items are bought by **spec**, not part number. If Dominion stores each vehicle's specs, any stocked item with the matching spec is a valid fit, and fleets can pull it from bulk stock.

| Spec key | Unit / format | Example (to be verified per car) |
|---|---|---|
| `engine_oil_grade` | SAE viscosity | 0W-20 |
| `engine_oil_capacity_with_filter_l` | litres | 3.1 |
| `wiper_driver_mm` / `wiper_passenger_mm` / `wiper_rear_mm` | mm | 525 / 475 / — |
| `wiper_connector` | enum (U-hook, special, …) | U-hook |
| `battery_jis` | JIS code | (e.g. idle-stop size) |
| `headlight_low_bulb` / `headlight_high_bulb` / `fog_bulb` | bulb code | H4, LED (non-replaceable) |
| `brake_fluid` | DOT spec | DOT 3 |
| `coolant_type` | type | Toyota SLLC (pink) |
| `transmission_fluid` | fluid name | CVTF (maker spec) |
| `tire_size`, `bolt_pattern` | existing columns | 165/65R14, 4x100 |

The examples are placeholders showing the format, **not data to load**. Every value must be entered with a source, like parts.

### 4.2 Data model (Dominion = master data)

```sql
-- What specs exist and what kind of item they match.
CREATE TABLE public.spec_key (
  key text PRIMARY KEY,                -- 'wiper_driver_mm'
  label text NOT NULL,                 -- 'Wiper, driver side'
  value_type text NOT NULL CHECK (value_type IN ('number','text','enum')),
  unit text,                           -- 'mm', 'L'
  allowed_values text[],               -- for enums
  component_id uuid REFERENCES public.maintenance_service_categories(id)  -- LGT-WIPER, ENG-OIL…
);

-- A vehicle's spec values, on the same scope ladder as parts and schedules.
CREATE TABLE public.catalog_spec_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_key text NOT NULL REFERENCES public.spec_key(key),
  scope text NOT NULL CHECK (scope IN ('variant','platform','engine_family')),
  vehicle_catalog_id uuid REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  platform_id uuid REFERENCES public.vehicle_platform(id) ON DELETE CASCADE,
  engine_family_id uuid REFERENCES public.engine_family(id) ON DELETE CASCADE,
  value text NOT NULL,
  year_from int, year_to int,
  evidence_url text NOT NULL,
  verified_by uuid, verified_at timestamptz NOT NULL DEFAULT now()
);

-- Reference universal items (brand products that satisfy a spec).
CREATE TABLE public.universal_part (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_key text NOT NULL REFERENCES public.spec_key(key),
  spec_value text NOT NULL,            -- '525', '0W-20', 'H4'
  manufacturer text NOT NULL,
  part_number text NOT NULL,
  name text NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}',   -- e.g. {"connector":"U-hook"}
  evidence_url text,
  UNIQUE (manufacturer, part_number)
);

-- Resolved specs + matching universal items for a variant (most specific scope wins).
CREATE FUNCTION public.specs_for_variant(p_catalog_id uuid, p_vehicle_year int DEFAULT NULL) RETURNS TABLE (...);
CREATE FUNCTION public.universal_parts_for_variant(p_catalog_id uuid, p_vehicle_year int DEFAULT NULL) RETURNS TABLE (...);
```

**Existing spec columns:**
- `engine_oil_capacity_l`, `coolant_capacity_l`, `tire_size`, `bolt_pattern` and `brake_size_mm` stay on `vehicle_catalog`. They're filled for only **166 / 356** variants.
- Expose them through `specs_for_variant` as read-only spec keys. Don't duplicate them.
- **Check before relying on them:** the Roomy row says `engine_oil_capacity_l = 3.2`, while published Roomy figures are 2.9 L (oil only) / 3.1 L (with filter). Decide which the column means, and add `engine_oil_capacity_with_filter_l` as its own key.

**Customer side stays out of Dominion:**
- Fleet bulk stock of universal items goes in the RoamFleet app. Extend `org_part_stock` with a nullable `universal_part_id`, plus a CHECK that exactly one of `part_id` / `universal_part_id` is set.
- The catalog API returns Tier 5 matches. The **consumer** adds "In your stock" on top, exactly as Tier 0 works today.

### 4.3 Catalog API & tiers

- **New tier `5` — "By size / spec".** `GET /catalog/v1/variants/:id/parts` adds a `universal` section: `{ specKey, label, value, unit, items: [universal parts…] }`.
- **Spec-only results:** when there are no stocked items, the spec itself is still returned (e.g. "Driver wiper: 525 mm, U-hook"). That alone helps a fleet buy correctly.
- **Wipers keep their OEM rows too** (Tier 1). Tier 5 adds "any 525 mm U-hook blade".
- **Readiness:** for spec-type components (wipers, engine oil), a verified spec counts as satisfied.

### 4.4 Dominion UI

- **Variant hub → new "Specs" tab:** a checklist of spec keys with value, scope (this vehicle / body / engine) and source.
  - The same "Which cars does it fit?" step and preview as Part A.
  - **Required source link.**
- **Parts catalog → "Universal items" page:** add brand items by spec (e.g. "Bosch Aerotwin 525 mm U-hook"), plus a source.
- **Data quality:** the matrix gains spec columns (wiper sizes, oil grade, battery).

---

## 5. Phased plan

| Phase | Scope | Done when |
|---|---|---|
| **P1 — Safe entry backend** | `save_guided_part` RPC (atomic), preview endpoint, fit edit, applicability table + readiness change, retire `saveCatalogPart`, readiness refresh after writes | Saving a part for the Roomy variant attaches it to that variant only; preview lists exactly the cars a choice reaches; a failed save leaves nothing behind |
| **P2 — Guided UI** | Variant hub Parts checklist + 4-step dialog + edit / widen / not-applicable / remove; Parts catalog default = vehicle-first, internals behind Advanced; plain wording (table 3.6) | A non-mechanic adds the Roomy oil filter + DRIVEJOY equivalent with a source in under a minute, without seeing "group" or "rule" |
| **P3 — Spec model** | `spec_key`, `catalog_spec_value`, `universal_part`, `specs_for_variant`, `universal_parts_for_variant`; expose the existing spec columns; seed **spec_key definitions only** (no values) | Spec keys listed; zero values until entered with sources |
| **P4 — Spec UI** | Variant hub Specs tab, Universal items page, matrix spec columns | Driver / passenger wiper sizes for the Roomy entered with a source; the matrix shows them |
| **P5 — Tier 5 in the API + fleet** | Catalog API universal section; RoamFleet stock of universal items; fleet results show "By size / spec" with stock overlay | The fleet Roomy page shows "Wiper 525 mm (U-hook)" and any stocked matching blade |
| **P6 — Related supplies (optional)** | `component_related_supply` (e.g. O2 sensor → anti-seize) shown as "You may also need" | — |

---

## 6. Tests

| Layer | Test |
|---|---|
| SQL | `save_guided_part` is atomic (forced failure → 0 rows); a variant-only fit doesn't reach the sister / turbo / facelift; an engine fit is rejected for non-engine jobs; a platform fit on a mixed-engine platform needs explicit ticks; applicability makes readiness true; `specs_for_variant` scope precedence + year filter; `universal_parts_for_variant` matches by spec value (+ connector for wipers) |
| API | Preview list equals what is saved; the catalog API returns the `universal` section with no customer fields (extend `catalog_privacy.test.ts`) |
| UI | Guided add happy path; widen / narrow shows before → after; "Not on this car" turns the matrix cell grey |
| Data rule | Any write without `evidence_url` is rejected for Verified status |

---

## 7. Out of scope / later

- **Related supplies** (anti-seize, gaskets, crush washers) as "You may also need" (P6).
- **Prices / stock / install time** in Dominion: only from real supplier offers, never estimated.
- **Confidence scores:** tiers + verified status replace them. Don't invent numbers.

---

## 8. Decisions to confirm before P1

1. **Default fit for engine jobs** = "Only this exact vehicle" (recommended until you've verified a part by engine in a maker catalog). OK?
2. **Guided saves are Verified immediately** because a source is required; CSV imports stay "Needs checking". OK?
3. **"Not on this car"** at the variant level only, or also for a whole body / engine?
4. **Spec values:** this vehicle by default, with body / engine scope offered with a preview (same as parts)?
5. **Engine oil capacity:** what does the existing `engine_oil_capacity_l` column mean, oil only or with filter?

# Parts Sourcing — Enterprise Upgrade Audit

**Date:** 2026-10-13 · **Status:** Audit only — no code changed · **Scope:** Dominion Parts Sourcing (admin), fleet compatible-parts, maintenance parts usage

This document does three things:

1. Describes what the parts sourcing section actually is today (code + live production data).
2. Weighs the "enterprise auto parts engine" advice you received against that reality — what to take, what to adapt, what to skip.
3. Lays out a phased build plan with schema sketches, so you can implement it later in order.

---

## TL;DR

- **The plumbing exists, the data doesn't.** Production has **0 parts, 0 suppliers, 0 offers, 0 fitments, 0 usage rows**. Only the 8 seeded categories exist. Every compatible-parts lookup today returns empty.
- **The hierarchy the advice describes is already latent in your vehicle catalog.** All 356 catalog variants have a `chassis_code` and `engine_code`. In that data there are already **25 sister-chassis groups** (e.g. `ZRR80G` = Noah / Voxy / Esquire; `VY12` = Nissan AD Van / NV150 AD / Mazda Familia Van; `XZU605` = Hino Dutro / Toyota Dyna / Toyoace) and **58 engines shared across chassis** (`1NZ-FE` spans 18 chassis, `2ZR-FXE` 13, `2AZ-FE` 11, `HR15DE` 9, `1KR-FE` 8).
- **The single biggest design problem:** `part_fitment` is keyed per `vehicle_catalog_id` (`UNIQUE (part_id, vehicle_catalog_id)`). To say "this oil filter fits every 1NZ-FE" you need 18+ rows, by hand. That is the exact "hardcode every combination" trap the advice warns about. Fix this with **fitment rules keyed on chassis/engine + interchange groups**, and the catalog becomes seedable.
- **There is a live bug:** the maintenance log dialog filters compatible parts by a *maintenance* category id, but the server compares it to a *part* category id. Two different taxonomies — that picker can never show anything, even after you add parts.
- **Skip Neo4j, Redis and microservices.** At 356 variants and a few thousand parts, Postgres joins answer every tier query in milliseconds. Those three recommendations add operating cost and solve no problem you have.
- **Take, in this order:** fix the plumbing → re-key fitment → seed by engine → tiered search → chassis-number decoder → core returns + repeat-failure alerts + warranty → supplier freshness and landed cost → supplier APIs last.

---

## Part 1 — What exists today

### 1.1 Architecture map

```
                    ┌──────────────────────────────────────────────┐
  Roam Dominion     │ apps/admin  PartsSourcingManager.tsx (1059 L) │
  (roamdominion.co) │ Vehicle Database → Parts sourcing             │
                    │ tabs: categories · parts · suppliers ·        │
                    │       fitment · offers                        │
                    │ + "Fleet parts requests" panel above the tabs │
                    │   (only renders when open requests exist)     │
                    └───────────────────────┬──────────────────────┘
                                            │ partSourcingService.ts → fleet-core
  Fleet manager     ┌───────────────────────┴──────────────────────┐
  apps/fleet        │ FleetMaintenanceHub.tsx  "compatible parts"   │
                    │   + "request missing part" (free text)        │
                    │ LogMaintenanceServiceDialog.tsx  part picker  │
                    └───────────────────────┬──────────────────────┘
                                            ▼
                    supabase/functions/_fleet-server/part_sourcing_routes.ts
                    (registered in fleet-core; service role, RLS deny-all for clients)
                                            │
     KV vehicle:{id} ──► vehicle_catalog_resolve.ts ──► vehicle_catalog (356 rows)
                                            │
       part_category ─► part_master ─► part_fitment ─► vehicle_catalog
                              │
                              ├─► supplier_part_offer ─► supplier
                              │
                              └─► maintenance_work_order_lines.part_id
                                    └─► maintenance_parts_usage
       parts_sourcing_requests (fleet → Dominion queue, free text)
```

### 1.2 Tables

| Table | Migration | What it holds | Prod rows |
|---|---|---|---|
| `part_category` | `20260501140000_part_sourcing.sql` | Hierarchical tree (`parent_id`), 8 seeded roots | 8 |
| `part_master` | same | name, `oem_part_number` (nullable, not unique), description, `metadata` jsonb | 0 |
| `supplier` | same | name, contact, `default_lead_time_days` | 0 |
| `supplier_part_offer` | same | sku, `unit_price`, currency (default **USD**), moq, lead time, url, active | 0 |
| `part_fitment` | same | part ↔ `vehicle_catalog_id` + optional `chassis_code` / `engine_code` / year gates | 0 |
| `parts_sourcing_requests` | `20260826140000_…parts_requests.sql` | org, vehicle, free-text need, status | 0 |
| `maintenance_work_order_lines` | `20260807130000_garage_grade_maintenance.sql` | has `part_id`, `part_number` text, `brand`, `warranty` bool, qty, unit_price | 2 (none linked) |
| `maintenance_parts_usage` | same | part consumed per WO line, vehicle, cost (currency default **JMD**) | 0 |
| `vehicle_catalog` | `20260410…` + ~20 follow-ups | 356 variants, 10 makes, all with chassis + engine code | 356 |

### 1.3 Endpoints ([part_sourcing_routes.ts](../supabase/functions/_fleet-server/part_sourcing_routes.ts))

- `GET /vehicles/:vehicleId/compatible-parts` — fleet read. Resolves KV vehicle → catalog id, loads fitment rows for **that catalog id only**, filters by year / chassis / engine gates, attaches active offers.
- `GET /admin/part-catalog/:vehicleCatalogId/parts-preview` — same logic for admins.
- Full CRUD for categories, parts, suppliers, offers, fitment (platform staff only).
- `POST /parts-sourcing-requests` (fleet), `GET` / `PATCH /admin/parts-sourcing-requests` (staff).

### 1.4 How a match works today

```
vehicle → resolveCatalogIdForKvVehicle() → ONE catalog_id
        → part_fitment WHERE vehicle_catalog_id = that id
        → drop rows whose chassis/engine/year gate disagrees
        → attach offers
```

So a part only appears if someone created a fitment row for that exact catalog variant. There is no notion of sister vehicles, shared engines, aftermarket equivalents, or interchange.

---

## Part 2 — Defects in what exists (fix before building more)

These are real issues found in the current code. Severity is about impact once the catalog has data.

| # | Severity | Issue | Where | Fix |
|---|---|---|---|---|
| D1 | **High** | **Category taxonomy mismatch.** The log dialog passes `activeCategory.id` (a `maintenance_service_categories` id) as `category_id`; the server compares it to `part_master.category_id` (a `part_category` id). Never equal → the in-dialog part picker is always empty. | [LogMaintenanceServiceDialog.tsx:493](../apps/fleet/src/components/vehicles/LogMaintenanceServiceDialog.tsx#L493) → [part_sourcing_routes.ts:149](../supabase/functions/_fleet-server/part_sourcing_routes.ts#L149) | Bridge the taxonomies (see §4.4): add `maintenance_component_id` / `op_code` on `part_category` or on `part_master`, and filter by that. |
| D2 | **High** | **Fitment can't generalise.** `UNIQUE (part_id, vehicle_catalog_id)` forces one row per variant. The chassis/engine columns are *narrowing gates*, not *broadening rules*. | `20260501140000_part_sourcing.sql:70` | Fitment rules keyed on chassis / engine / platform (see §4.2). |
| D3 | Medium | **Parts usage is best-effort.** Both writers to `maintenance_parts_usage` swallow errors with `console.warn`. Usage silently lost = repeat-failure alerts and cost history silently wrong. | [maintenance_routes.ts:1498](../supabase/functions/_fleet-server/maintenance_routes.ts#L1498), [:2832](../supabase/functions/_fleet-server/maintenance_routes.ts#L2832) | Write in the same transaction as the lines (RPC), or fail the request. |
| D4 | Medium | **Free-text part numbers never link.** WO lines store `part_number` / `brand` as text when no `part_id` is chosen. Nothing back-fills `part_id` later. | `maintenance_work_order_lines` | On save, look up `part_number` against OEM + interchange numbers; set `part_id` when unambiguous; otherwise queue for review. |
| D5 | Medium | **Currency mismatch.** Offers default `USD`; work orders and usage default `JMD`. No FX field or conversion. | migrations | Store `currency` on everything (already done) and add landed-cost in the fleet's currency (see §6.6). |
| D6 | Medium | **Fleet can't see its own requests.** Only `POST` exists for fleets; fleet managers never learn a request was resolved or rejected, or which part answered it. | `parts_sourcing_requests` | `GET /parts-sourcing-requests` org-scoped + `resolved_part_id` column + notification. |
| D7 | Low | `oem_part_number` not unique, not normalised (`89467-B1040` vs `89467B1040`), no brand/manufacturer column, no supersession. | `part_master` | §4.3. |
| D8 | Low | Prices have no observation date. A price entered in May looks as current as one entered today. | `supplier_part_offer` | `price_observed_at`, `source` (manual / quote / api). |
| D9 | Low | Supplier pricing is platform-wide. If a fleet negotiates its own price with a supplier, there is nowhere to put it. | `supplier_part_offer` | Optional `organization_id` (null = platform price). |
| D10 | Low | Part search is a btree on `name`. "O2 sensor" / "lambda sensor" / "oxygen sensor" won't find each other. | `idx_part_master_name` | Synonym table + `pg_trgm` (already enabled — used on `vehicle_catalog`). |

---

## Part 3 — The advice, evaluated

| Recommendation | Verdict | Why |
|---|---|---|
| Vehicle → Platform → Engine → Part hierarchy | **Take** | Your catalog already has `chassis_code` + `engine_code` on 100% of rows. You need *group tables* on top, not new data. |
| VIN / chassis decoder | **Take, adapted** | Your fleet is JDM imports. Japanese domestic vehicles mostly carry a **frame number**, not a 17-char VIN — and its prefix *is* the chassis code (`ZRR80-0123456` → `ZRR80`). The "decoder" is a prefix match against `vehicle_catalog.chassis_code`. Cheap and highly accurate. Add a 17-char VIN path later for non-JDM units. |
| Quick-select component tree | **Take — you mostly have it** | `maintenance_service_categories` already has system → component with op codes (`BRK-PADS`, `ENG-SPARK`). Reuse it; don't build a third taxonomy. |
| 4-tier results (OEM / Sister / Engine / Aftermarket) | **Take, with one correction** | See §5. "100% fit assurance" for sister vehicles is not safe to claim blanket — sisters often differ in trim, bumpers, lighting, market-specific electronics. Fit scope must come from the **part type**, not just the vehicle relationship. |
| Interchange grouping (Hollander-style) | **Take — this is the most important item** | It's what turns 1 entry into 18 fitments. See §4.2. |
| Core deposit / return tracker | **Take** | Small, self-contained, real money. Keep it out of settlement/driver finance (see §6.2). |
| Part-to-vehicle logging + repeated-failure alert | **Take** | Tables exist (`maintenance_parts_usage`). Key alerts on the **component** (op code), not on `part_id`, so they work even before the catalog is populated. |
| Supplier API integrations | **Take last** | Highest cost, depends on suppliers that actually serve Jamaica. Do quote freshness + RFQ first. See §6.6. |
| Neo4j / graph DB | **Skip** | Your relationships are 3 levels deep with a few thousand nodes. A Postgres join or a recursive CTE answers it instantly. A second database means a second backup, auth model, and sync job for zero gain. |
| Redis caching | **Skip** | Supabase has no Redis; edge functions are stateless. The query is cheap. If you ever need it, a materialised view `vehicle_part_candidates` refreshed on catalog change does the job inside Postgres. |
| Microservices | **Skip** | You already have edge function boundaries (`fleet-core`). Splitting "VIN decoder" into its own service adds deploys and latency. Keep it a module in `_fleet-server`. |

### What the advice misses

- **The catalog is empty.** No feature matters until there's data. You need a seeding strategy (§7), not just a schema.
- **Fit confidence from real installs.** The best compatibility signal you can own is "a mechanic installed this part on this chassis and it fit." Capture it (§5.3).
- **Supersession.** OEM numbers get replaced (`…-B1040` → `…-B1041`). Without a supersession chain, Tier 1 shows dead numbers.
- **Warranty recovery.** WO lines already have a `warranty` boolean. A part that fails inside its warranty period should trigger a claim, not a re-buy.
- **Landed cost.** For imported JDM parts, duty + freight can exceed the part price. Comparing supplier unit prices alone picks the wrong supplier.
- **Downtime cost.** "Cheapest" and "fastest" pull opposite ways. Show cost-of-downtime so managers can choose (§6.5).
- **Structured requests.** Today's request is free text. Make it carry the component, the vehicle's chassis/engine, and urgency, so Dominion can answer with a `part_id`.

---

## Part 4 — Target data model

All proposals are additive. Nothing existing needs to be dropped; old `part_fitment` rows keep working as exact-variant fitment.

### 4.1 Vehicle grouping (derived from data you already have)

```sql
-- One row per body/platform. Sister vehicles share a platform.
create table public.vehicle_platform (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- e.g. 'ZRR80', 'M900A', 'VY12' (normalised, no trailing market letter)
  label text,                          -- 'Toyota Noah/Voxy/Esquire (R80)'
  notes text
);

-- One row per powertrain.
create table public.engine_family (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- '1NZ-FE', '1KR-FE'
  displacement_cc integer,
  fuel_type text,
  notes text
);

alter table public.vehicle_catalog
  add column platform_id uuid references public.vehicle_platform(id),
  add column engine_family_id uuid references public.engine_family(id);
```

Back-fill both from `chassis_code` / `engine_code` with one SQL pass. **Watch normalisation:** `ZRR80G` vs `ZRR80W` vs `ZRR80` may be the same platform with a market/grade suffix — decide a rule and review the 299 distinct chassis codes once by hand.

Optional: `transmission_family` the same way — transmissions are swapped across bodies just like engines, and a CVT part on a 1NZ-FE car does not fit a 4-speed auto 1NZ-FE car.

### 4.2 Interchange + fitment rules (the core fix)

```sql
-- A set of part numbers that are physically interchangeable.
create table public.part_interchange_group (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- your own stable code, e.g. 'IC-OILFLT-0012'
  label text,
  fit_scope text not null check (fit_scope in ('powertrain','chassis','body','electrical','universal'))
);

alter table public.part_master
  add column interchange_group_id uuid references public.part_interchange_group(id),
  add column part_kind text not null default 'oem' check (part_kind in ('oem','oe_supplier','aftermarket','used','reman')),
  add column manufacturer text,                    -- Toyota, Denso, NGK, Bosch
  add column oem_part_number_norm text generated always as (upper(regexp_replace(coalesce(oem_part_number,''),'[^A-Za-z0-9]','','g'))) stored;

create unique index on public.part_master (manufacturer, oem_part_number_norm) where oem_part_number_norm <> '';

-- Fitment is attached to the GROUP, at the broadest level that's true.
create table public.interchange_fitment_rule (
  id uuid primary key default gen_random_uuid(),
  interchange_group_id uuid not null references public.part_interchange_group(id) on delete cascade,
  target_kind text not null check (target_kind in ('engine_family','platform','catalog_variant')),
  engine_family_id uuid references public.engine_family(id),
  platform_id uuid references public.vehicle_platform(id),
  vehicle_catalog_id uuid references public.vehicle_catalog(id),
  year_from integer, year_to integer,
  position text,                       -- 'front','rear','upstream','downstream','LH','RH'
  source text not null default 'manual' check (source in ('manual','oem_catalog','supplier','install_confirmed','import')),
  verified_by uuid, verified_at timestamptz,
  notes text,
  check ( (target_kind='engine_family' and engine_family_id is not null)
       or (target_kind='platform'      and platform_id      is not null)
       or (target_kind='catalog_variant' and vehicle_catalog_id is not null) )
);
```

**One oil filter rule for `1NZ-FE` now covers 18 chassis.** All OEM, OE-supplier (Denso/Aisin) and aftermarket numbers in the group come along automatically.

**Guardrail — enforce in the DB, not the UI:** a rule with `target_kind='engine_family'` is only allowed when the group's `fit_scope` is `powertrain` or `universal`. A trigger rejecting an engine-family rule on a `body` or `chassis` group makes the advice's "Engine Block Compatibility Only — Do Not Use for Suspension/Body" warning impossible to violate, rather than a label someone can ignore.

### 4.3 Supersession

```sql
create table public.part_supersession (
  old_part_id uuid not null references public.part_master(id),
  new_part_id uuid not null references public.part_master(id),
  effective_at date,
  fully_interchangeable boolean not null default true,  -- false = new fits old car, not vice-versa
  primary key (old_part_id, new_part_id)
);
```

Tier 1 always shows the latest number in the chain and lists older numbers as "also known as" (mechanics search by the number printed on the old part).

### 4.4 Bridge the two category trees (fixes D1)

You have `part_category` (8 parts groups) and `maintenance_service_categories` (system → component with op codes). Keep both, link them:

```sql
alter table public.part_master
  add column maintenance_component_id uuid references public.maintenance_service_categories(id);
```

Then the log dialog filters by `maintenance_component_id`, and repeat-failure alerts can group by component. Also add finer leaf components to the maintenance tree as needed (e.g. `ENG-O2-UP`, `ENG-O2-DN`) — that tree *is* the "Quick-Select Component Tree" from the advice.

### 4.5 Synonyms (fixes D10)

```sql
create table public.part_term_synonym (
  term text primary key,                -- 'lambda sensor', 'o2 sensor', 'a/f sensor'
  maintenance_component_id uuid references public.maintenance_service_categories(id),
  canonical text not null               -- 'Oxygen sensor'
);
```

Search box: normalise input → synonym → component → parts. Add a `pg_trgm` index on `part_master.name` and on `oem_part_number_norm` for typo-tolerant number search.

---

## Part 5 — Search & tiered results

### 5.1 The resolution query (single SQL function)

Given a vehicle → its `vehicle_catalog` row → `platform_id`, `engine_family_id`, year:

| Tier | Rule | Label shown |
|---|---|---|
| **1 — Direct OEM** | `part_kind='oem'` and a rule matches by `catalog_variant`, or by `platform` where the vehicle's own make is the manufacturer | "Factory part for your vehicle" |
| **2 — Same platform (sister)** | rule matches by `platform`, part originates from a different nameplate on that platform | "Same platform as {Daihatsu Thor}. {scope message}" |
| **3 — Same engine** | rule matches by `engine_family`, group `fit_scope='powertrain'` | "Engine/powertrain compatible only — from {Vitz}." |
| **4 — Aftermarket equivalent** | `part_kind in ('oe_supplier','aftermarket','reman')` in the same interchange group as any Tier 1–3 part | "Equivalent to OEM {89467-B1040} — {Denso}" |

Implement as one Postgres function (`parts_for_vehicle(catalog_id, component_id)`) returning `tier`, `part`, `match_reason`, `rule_source`, `confidence`. The edge route stays a thin wrapper — same pattern as your other RPC-backed routes. This replaces the in-JS filtering loop in `part_sourcing_routes.ts`.

### 5.2 Correct the "100% fit assurance" claim

Don't hard-code that label on all of Tier 2. Instead, derive the message from `fit_scope`:

- `powertrain` / `electrical` on a sister platform → "Same platform — expected direct fit."
- `body` / `chassis` on a sister platform → "Same platform — check trim, year and photos before ordering." (Sisters routinely differ in grilles, bumpers, lamps, interior trim.)
- Only show a ✅ "Confirmed fit" badge when §5.3 has evidence.

### 5.3 Fit confidence from real installs

When a WO line with a `part_id` is completed, ask the mechanic one question: **Did it fit? Yes / No / Modified.** Store it:

```sql
create table public.part_fit_feedback (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.part_master(id),
  vehicle_catalog_id uuid references public.vehicle_catalog(id),
  work_order_line_id uuid references public.maintenance_work_order_lines(id),
  organization_id text not null,
  outcome text not null check (outcome in ('fit','no_fit','modified')),
  notes text, created_at timestamptz not null default now()
);
```

- Show "Confirmed on 7 installs" in results.
- A `no_fit` on a Tier 2/3 match opens an admin review on the rule.
- Enough `fit` confirmations on an unruled combo can propose a new rule (`source='install_confirmed'`) for admin approval.

This is the data competitors can't buy, and it accumulates for free.

### 5.4 Result card contents

Per part: tier badge · part name + number (+ superseded numbers) · manufacturer · fit message · position · confirmed-install count · best offer (landed cost, lead time, price age) · "N more suppliers" · core charge if any · warranty term · **Add to work order** · **Request quote**.

---

## Part 6 — Operational modules

### 6.1 Chassis / VIN decoder (intake)

- **JDM frame number** (`ZRR80-0123456`, `M900A-001234`): split on `-`, prefix-match against `vehicle_platform.code` / `vehicle_catalog.chassis_code`. If multiple variants share the chassis, narrow with year/month (your resolver already does month narrowing via `filterCatalogRowsByFleetMonth`), then grade/trim, then ask the user.
- **17-char VIN**: validate check digit; decode WMI (make) + year; for North-American-market units, NHTSA's free vPIC API can decode. Expect it to be weak for JDM.
- Store the decoded result on the vehicle as hints — the KV vehicle already carries `vehicle_catalog_chassis_hint`, `vehicle_catalog_engine_code_hint`, etc., and the `Vehicle` type has `vin` and document `metadata.chassisNumber` / `engineNumber`. **Engine number prefix** (e.g. `1NZ-1234567`) is also a decode source for `engine_family`.
- Bulk mode: paste/upload 50 frame numbers → table of decoded matches with confidence → confirm all. This is what makes onboarding 50 vehicles painless.

### 6.2 Core deposit & return tracker

```sql
alter table public.supplier_part_offer add column core_charge numeric(12,2);

create table public.part_core_return (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  work_order_line_id uuid references public.maintenance_work_order_lines(id),
  part_id uuid not null references public.part_master(id),
  supplier_id uuid references public.supplier(id),
  vehicle_id text not null,
  core_charge numeric(12,2) not null,
  currency text not null,
  status text not null default 'pending'
    check (status in ('pending','shipped','credited','rejected','written_off')),
  due_by date,                         -- supplier's return window
  shipped_at timestamptz, credited_at timestamptz, credit_amount numeric(12,2),
  notes text, created_at timestamptz not null default now()
);
```

Dashboard: **"$X in pending core returns · N overdue"**, sorted by `due_by`. Created automatically when a WO line uses a part whose offer has a core charge.

**Keep this out of driver settlement and fleet finance engines.** Your memory notes the finance side already has 7 money engines with no shared accounting layer; a core deposit is a supplier receivable, not a driver charge. Report it, don't post it, until you deliberately decide where it belongs.

### 6.3 Repeated-failure alert

- Group `maintenance_work_order_lines` by `vehicle_id` + component (`component_id` / op code) with `action='replace'`.
- Alert when the same component is replaced **≥ 2 times within X days or Y km** (use `maintenance_work_orders.odometer`; km matters more than days for a high-mileage rideshare fleet).
- Keying on component (not `part_id`) means this works today, even with an empty catalog.
- Second signal: same **part number** failing across **many vehicles** → bad batch or bad supplier. Flag the supplier/brand.
- Requires D3 fixed first, or alerts will silently under-count.

### 6.4 Warranty recovery

- Add `warranty_months`, `warranty_km` to `supplier_part_offer` (or `part_master` for manufacturer warranty).
- When a component is replaced again inside the previous part's warranty window → prompt "Claim warranty from {supplier}?" instead of logging a plain re-buy. Same table shape as core returns (`part_warranty_claim`).

### 6.5 Downtime-aware sourcing

Every vehicle off the road costs a day's earnings. Let each org set **downtime cost per day** (or derive it from average weekly revenue per vehicle). Then for each offer show:

`total impact = landed cost + (lead_time_days × downtime cost/day)`

The cheapest part with a 14-day lead time often loses to a Tier 2/3 or used part available tomorrow. Surfacing that trade-off is the actual enterprise value of the tier system.

### 6.6 Suppliers: freshness → landed cost → RFQ → APIs

Do these in order.

1. **Freshness:** `price_observed_at`, `source` (`manual`/`quote`/`api`), and grey out prices older than N days.
2. **Landed cost:** per supplier `freight_estimate`, `duty_rate`, `fx_currency`; compute landed cost in the fleet's currency. Fixes the USD/JMD mismatch (D5).
3. **Org-specific pricing:** nullable `organization_id` on offers (D9).
4. **RFQ:** "Request quote" sends the structured request (part, number, vehicle, qty, needed-by) to 1–3 suppliers by email/WhatsApp; replies are entered as offers with `source='quote'`. This gets you live pricing with no integrations.
5. **APIs:** only for suppliers that actually serve your market. Verify before building: which local Jamaican distributors expose stock/price feeds, and whether any JDM export parts sites offer an API or only a web catalogue. Build one adapter interface (`searchByPartNumber`, `getPriceAndStock`) so each supplier is a plug-in. Cache responses in a table with a TTL — not Redis.

### 6.7 Structured parts requests (fixes D6)

Extend `parts_sourcing_requests`: `maintenance_component_id`, `platform_id`, `engine_family_id` (filled from the vehicle), `urgency`, `qty`, `photo_url`, `resolved_part_id`. Fleet gets a "My requests" list with status. When Dominion resolves by creating a part + rule, **every other fleet with the same platform/engine benefits** — requests become your catalog-growth engine.

### 6.8 Later: stock on the shelf

There's no inventory today. Many fleets keep consumables (filters, pads, plugs) on hand. A simple `org_part_stock (org, part, qty, location, reorder_point)` decremented by `maintenance_parts_usage` makes Tier 0 "**In your stock — 4 on shelf**" possible. Defer until the catalog is real.

---

## Part 7 — Seeding the catalog (the real bottleneck)

With interchange rules keyed on engine family, coverage grows fast:

1. **Pick the top engines by fleet count**, not by catalog count. Start with `1NZ-FE`, `2ZR-FXE`, `1KR-FE`, `HR15DE`, `2AZ-FE`, `L15B`, `1NZ-FXE`, `R06A` — these alone cover dozens of chassis.
2. **Per engine, seed the routine consumables** that dominate maintenance spend: oil filter, air filter, spark plugs, drive belt, thermostat, water pump, O2 sensors (upstream/downstream), ignition coils. All `fit_scope='powertrain'` → one rule per engine.
3. **Per platform, seed wear parts**: front/rear pads, rotors, shocks, wiper blades, cabin filter, bulbs. `fit_scope='chassis'` or `'body'` → one rule per platform; sisters inherit.
4. **Then aftermarket cross-references** into the same interchange groups (NGK/Denso plugs, Denso/Bosch sensors, Akebono pads).
5. **Back-fill from history:** the free-text `part_number` on past WO lines tells you what your fleets actually buy.
6. **Import tool:** a CSV importer (`interchange_code, manufacturer, part_number, part_kind, fit_scope, target_kind, target_code, year_from, year_to, position`) — the vehicle catalog already has a CSV import path you can copy.

Measure progress with one number: **% of active fleet vehicles with ≥ 1 Tier 1–3 match per top-10 component.**

---

## Part 8 — Phased plan

| Phase | Goal | Contents | Done when |
|---|---|---|---|
| **0 — Plumbing** | Make what exists correct | D1 taxonomy bridge, D3 transactional usage write, D6 fleet request list, D8 price date | Log dialog shows parts for a seeded test part; usage row always written or request fails |
| **1 — Model** | Fitment that generalises | §4.1 platform/engine groups + back-fill, §4.2 interchange + rules + scope trigger, §4.3 supersession, §4.5 synonyms | One rule on `1NZ-FE` returns the part for all 18 chassis; engine rule on a body group is rejected by the DB |
| **2 — Seed** | Real data | §7 steps 1–4, CSV importer | Coverage metric ≥ 60% for top-10 components |
| **3 — Search** | Tiered results | §5.1 SQL function, §5.2 scope messages, §5.4 cards, synonym search | Fleet sees Tier 1–4 sections; admins see `match_reason` |
| **4 — Intake** | Fast onboarding | §6.1 frame-number decoder, bulk decode | 50 frame numbers decoded in one paste with confidence |
| **5 — Operations** | Save money | §5.3 fit feedback, §6.2 cores, §6.3 repeat failures, §6.4 warranty | Pending-cores dashboard; repeat-failure alert fires on a test vehicle |
| **6 — Commerce** | Better buying | §6.5 downtime cost, §6.6 steps 1–4, §6.7 structured requests | Offers ranked by total impact; RFQ round-trip works |
| **7 — Integrations** | Live stock | §6.6 step 5, §6.8 stock | One supplier adapter live behind a feature flag |

Feature-flag phases 3+ the way you've done toll/fuel work, so the old compatible-parts response keeps working while the tiered one is built beside it.

---

## Part 9 — Tests to write alongside each phase

- **Fitment resolution matrix:** for a fixture set (one sister group, one shared engine, one superseded number, one aftermarket equivalent) assert exactly which tier each part lands in.
- **Scope guard:** inserting an engine-family rule for a `body` group must fail.
- **Category bridge:** log dialog's component id returns parts (regression test for D1).
- **Usage atomicity:** a forced usage-insert failure must fail the WO save (regression for D3).
- **Decoder:** table of real frame numbers from your fleet → expected catalog id (or "ambiguous").
- **Repeat-failure:** two replacements of the same component within the window → one alert, not two.
- Remember from previous audits: gate on `tsc`, not only vitest (vitest strips types).

---

## Appendix — Evidence

- Prod counts (2026-10-13, read-only query): `part_category` 8 · `part_master` 0 · `supplier` 0 · `supplier_part_offer` 0 · `part_fitment` 0 · `parts_sourcing_requests` 0 · `maintenance_parts_usage` 0 · `maintenance_work_order_lines` 2 (0 with `part_id`, 0 with `part_number`) · `vehicle_catalog` 356 (356 with chassis, 356 with engine; 299 distinct chassis, 136 distinct engines; all `vehicle_class='car'`; 10 makes).
- Sister-chassis groups (same chassis, > 1 nameplate): 25. Examples: `ZRR80G`, `ZWR80G` (Noah/Voxy/Esquire), `VY12` (AD Van/NV150 AD/Familia Van), `XZU605` (Dutro/Dyna/Toyoace), `AZR60G` (Noah/Voxy).
- Engines spanning > 1 chassis: 58. Top: `1NZ-FE` 18, `2ZR-FXE` 13, `2AZ-FE` 11, `HR15DE` 9, `1KR-FE` 8, `L15B` 7, `1NZ-FXE` 7, `R06A` 7.
- Key files: [part_sourcing_routes.ts](../supabase/functions/_fleet-server/part_sourcing_routes.ts), [vehicle_catalog_resolve.ts](../supabase/functions/_fleet-server/vehicle_catalog_resolve.ts), [packages/types/src/partSourcing.ts](../packages/types/src/partSourcing.ts), [PartsSourcingManager.tsx](../apps/admin/src/components/admin/parts-sourcing/PartsSourcingManager.tsx), [FleetMaintenanceHub.tsx](../apps/fleet/src/components/vehicles/FleetMaintenanceHub.tsx), [LogMaintenanceServiceDialog.tsx](../apps/fleet/src/components/vehicles/LogMaintenanceServiceDialog.tsx), [maintenance_routes.ts](../supabase/functions/_fleet-server/maintenance_routes.ts), migrations `20260501140000_part_sourcing.sql`, `20260807130000_garage_grade_maintenance.sql`, `20260826140000_vehicle_remediation_templates_parts_requests.sql`.

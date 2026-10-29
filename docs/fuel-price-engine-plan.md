# Fuel Price Engine: implementation plan

**Rev 1 · 2026-10-28** · Plan only, no code changed · Project `csfllzzastacofsvcdsc`

Written for: the owner, and Cursor implementing it. This replaces items 1–2 of [dominion-places-super-node-audit.md](dominion-places-super-node-audit.md). Screens are in [stitch/fuel-price-engine-prompts.txt](stitch/fuel-price-engine-prompts.txt).

## Rules this plan keeps

- **Capture everything.** No report is ever deleted. A report that looks wrong goes to the **Review** queue, and the owner decides.
- **Plug never shows a raw report.** It only shows the engine's published price.
- **Fleet's capture flow is unchanged.** The driver photographs the pump, and Fleet calculates amount ÷ litres. The engine only reads the fill after it is saved.
- **The matcher is unchanged.** It decides *which place* a fill belongs to. The engine decides *what the price is*.
- **Everything lives in `places`**, with text place ids, RLS on and no anon grants, like the rest of the register.

## What exists today, and what changes

| Today | Problem | Becomes |
|---|---|---|
| Fleet: `noteFleetPrice` writes `places.price_observation` and, if "in band", `price_current` | Grade hard-coded 87; the band needs a markup that doesn't exist, so nothing ever publishes | `places.fleet_price_report` (intake) → engine |
| Plug: `explorer /fuel-logs` writes `price_observation` + `price_current` directly | One driver's number goes straight to the public map | `places.plug_price_report` (intake) → engine |
| `price_current` → `public_place.prices` | No confidence, no sample size, no staleness | `price_current` is written **only by the engine**, with confidence, report count and valid-until |
| `price_observation`, `in_band`, `plugPriceDecision`, `latest_retail_estimate` | Gate instead of review | Retired (added to the 12 Nov retirement list once the engine is live) |

Production facts this plan is sized to:
- **Volume:** 75 Fleet fills with a price since 1 Sep, about 1 a day across 56 verified stations. Plug fuel logs: 0, since Plug isn't launched.
- **Petrojam:** weekly wholesale rows (latest 2026-10-22).
- **Postgres:** 17. TimescaleDB is **not available** in this project, so the design uses plain tables and no continuous aggregates. At this volume they aren't needed.
- **Disk IO:** this database is IO-sensitive. The engine runs per report plus one daily job, never every 15 minutes.

## Why Fleet and Plug are separate intakes

| | Fleet | Plug |
|---|---|---|
| Who | Your company's drivers | Anonymous public users (`user_hash`) |
| Data owner | Fleet business record (private to the company) | The public user, who can delete their data |
| Evidence | Pump photo, odometer, gas card statement, verified station | GPS, odometer, user-entered grade |
| Default trust | 2.0 | 1.0 |
| Grade source | Vehicle catalog → fill `fuelType` → card statement `jaaFuelType` | Locked from the user's vehicle (catalog `fuel_grade`) |
| On "delete my data" | Kept (company record) | Deleted with the user; published prices are recomputed |

Two intake tables keep company data from ever mixing with public data. They also let a Plug user's delete remove only their own rows. Both feed **one engine** through a read-only view.

## Tables (all in `places`)

```sql
-- Fleet intake: one row per saved Fleet fuel fill that has a price
create table places.fleet_price_report (
  id uuid primary key default gen_random_uuid(),
  fuel_entry_id text unique not null,           -- fleet.fuel_entries.id
  organization_id text not null,
  driver_id text, vehicle_id text,
  place_id text references places.place(id),   -- null until the matcher resolves a place
  grade text not null check (grade in ('e10_87','e10_90','diesel','ulsd','unknown')),
  grade_source text not null check (grade_source in ('vehicle','fill','statement','unknown')),
  litres numeric not null check (litres > 0),
  amount numeric not null check (amount > 0),
  price_per_litre numeric generated always as (round(amount / litres, 4)) stored,
  pump_photo_path text,
  station_state text,                           -- matcher's stationResolution.state
  gps_accuracy_m numeric,
  reported_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Plug intake: one row per Plug fuel log that has a price
create table places.plug_price_report (
  id uuid primary key default gen_random_uuid(),
  fuel_log_id uuid unique not null,             -- explorer.fuel_log.id
  reporter_hash text not null,                  -- same user_hash Plug already uses
  catalog_variant_id uuid,
  place_id text references places.place(id),
  grade text not null check (grade in ('e10_87','e10_90','diesel','ulsd','unknown')),
  grade_source text not null check (grade_source in ('vehicle_locked','user_changed','unknown')),
  litres numeric not null check (litres > 0),
  amount numeric not null check (amount > 0),
  price_per_litre numeric generated always as (round(amount / litres, 4)) stored,
  gps_accuracy_m numeric, mock_location boolean not null default false,
  station_match text not null check (station_match in ('auto','manual','new_place')),
  reported_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- One engine view over both
create view places.price_report as
  select 'fleet' as source, id, place_id, grade, price_per_litre, reported_at,
         'fleet:' || coalesce(driver_id, organization_id) as reporter_key
  from places.fleet_price_report
  union all
  select 'plug', id, place_id, grade, price_per_litre, reported_at,
         'plug:' || reporter_hash
  from places.plug_price_report;

-- The engine's verdict on each report (one row per report)
create table places.price_report_check (
  source text not null, report_id uuid not null,
  status text not null check (status in ('accepted','review','waiting_place','approved','rejected')),
  reasons text[] not null default '{}',          -- see "Checks"
  detail jsonb not null default '{}',            -- wholesale, expected, last price, median, mad...
  weight numeric not null,
  checked_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz, review_note text,
  primary key (source, report_id)
);

-- Reporter trust (Fleet drivers and Plug users)
create table places.price_reporter (
  reporter_key text primary key,                 -- 'fleet:<driver>' | 'plug:<hash>'
  source text not null,
  trust_weight numeric not null check (trust_weight between 0.1 and 3.0),
  reports int not null default 0, accepted int not null default 0,
  owner_rejected int not null default 0,
  last_report_at timestamptz, updated_at timestamptz not null default now()
);

-- Every price the engine ever published (history); price_current stays the "current" pointer
create table places.published_fuel_price (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references places.place(id),
  grade text not null,
  price_per_litre numeric not null,
  report_count int not null, fleet_count int not null, plug_count int not null,
  spread_pct numeric,
  confidence text not null check (confidence in ('high','medium','low')),
  petrojam_week date not null,                    -- the Petrojam price date this price belongs to
  window_start timestamptz not null, window_end timestamptz not null,
  published_at timestamptz not null default now(),
  valid_until timestamptz not null
);

-- Settings the owner can change in Dominion (one row)
create table places.price_engine_settings (
  id int primary key default 1 check (id = 1),
  bounds_low numeric not null default 0.80,      -- × Petrojam wholesale
  bounds_high numeric not null default 1.50,
  change_pct numeric not null default 0.12,      -- vs last published, Petrojam-adjusted
  mad_k numeric not null default 3.5,
  mad_min_reports int not null default 4,
  window_days int not null default 7,
  fleet_weight numeric not null default 2.0,
  plug_weight numeric not null default 1.0,
  updated_at timestamptz not null default now(), updated_by uuid
);

-- Add to price_current: confidence, report_count, petrojam_week, valid_until, published_id
```

Indexes: `(place_id, grade, reported_at desc)` on both intake tables, and `(status)` on `price_report_check`. Add both intake tables and `published_fuel_price` to the `fleet.log_master_change` audit trail.

## Checks (Stage 2): flag, never delete

Each report gets every reason that applies. **Any reason → `review`**, except `PLACE_NOT_VERIFIED`, which → `waiting_place` and is re-checked when the place is verified.

| Reason | Rule |
|---|---|
| `GRADE_UNKNOWN` | No grade from the vehicle, the fill, the statement (Fleet) or the vehicle lock (Plug) |
| `GRADE_CHANGED` | Plug user changed the grade the vehicle locked |
| `OUT_OF_BOUNDS` | Price outside `bounds_low`–`bounds_high` × Petrojam wholesale for that grade and the week of `reported_at` (no Petrojam row → this reason) |
| `BIG_CHANGE` | More than `change_pct` away from the place's current published price, after adding Petrojam's change since that price's week |
| `UNUSUAL_FOR_STATION` | Place has ≥ `mad_min_reports` accepted reports in `window_days` and the price is more than `mad_k` × MAD from their median |
| `MOCK_LOCATION` | Plug report with `mock_location = true` |
| `DUPLICATE` | Same reporter, same place and grade, within 10 minutes. Kept, but not counted twice. |
| `PLACE_NOT_VERIFIED` | Place is pending, learnt or new → `waiting_place` |

Owner **Approve** → `approved` (counts like accepted). Owner **Reject** → `rejected` (kept for the record, never counted). Every decision feeds the reporter's trust.

## Trust (Stage 3)

- New reporter: `fleet_weight` (2.0) or `plug_weight` (1.0).
- After each publish:
  - within 3% of the published price → +0.05
  - more than 10% away → −0.10
  - owner Reject → −0.20
  - capped 0.1–3.0
- No reports for 30 days: drift 5% back toward the default, once a week.

## Aggregation and publishing (Stages 4–5), Jamaica-specific

Pump prices in Jamaica move with Petrojam's weekly price. So the window is "**this Petrojam week**", not a clock window. Hourly tiers wouldn't work at about 1 report a day.

- **Window:** accepted + approved reports for the place and grade since the latest Petrojam price date, capped at `window_days`.
- **Price:** weighted median by trust.
- **Confidence:**
  - **high:** 3 or more reports and spread ≤ 2%
  - **medium:** 2 reports, or 1 Fleet report (it has a pump photo)
  - **low:** 1 Plug report
- **valid_until:** latest Petrojam date + 8 days.
- **When Petrojam publishes a new week:** every current price from an older week is marked **may be outdated**. It is **still shown** with that label (never hidden), until a new report for the new week replaces it.
- **No reports in the window:** keep showing the last price with its age and "may be outdated".

## When it runs (no 15-minute jobs)

1. **On every new report** (trigger on both intake tables): run the checks, then recompute that one place and grade. Prices update within seconds, with almost no IO.
2. **On owner Approve/Reject:** recompute that place and grade.
3. **When `petrojam-prices` syncs a new week:** mark older prices "may be outdated".
4. **Daily 05:00 UTC (`places-price-engine-daily`):** trust drift, expire `valid_until`, refresh the health view.
5. **On place verified:** re-check its `waiting_place` reports.

## Code changes

| Where | Change |
|---|---|
| [plug_public_price.ts](../supabase/functions/_fleet-server/plug_public_price.ts) | Replace `noteFleetPrice` with `submitFleetPriceReport`: insert `fleet_price_report`. Grade order: vehicle catalog `fuel_grade` → fill `fuelType` → `metadata.jaaFuelType` → `unknown`. No decision logic here. |
| [explorer/index.ts](../supabase/functions/explorer/index.ts) `POST /fuel-logs` | Replace the `price_observation` / `price_current` block with an insert into `plug_price_report`. The grade comes from the vehicle's catalog `fuel_grade` (`grade_source = 'vehicle_locked'`). If the body's grade differs, `user_changed`. Response: `priceStatus: 'checking' \| 'published' \| 'review'`. |
| `explorer` delete-my-data (`DELETE /me`) | Also delete that user's `plug_price_report` rows, then recompute the affected places. |
| New SQL functions | `places.price_engine_check(source, id)`, `places.price_engine_publish(place_id, grade)`, `places.price_engine_daily()`, `places.price_engine_review(source, id, decision, note)` |
| [petrojam-prices](../supabase/functions/petrojam-prices/index.ts) | After a new week is saved, call `places.price_engine_mark_stale(new_date)` |
| `refresh_public_place` | `prices` becomes `{grade: {price, confidence, reports, petrojam_week, observed_at, outdated}}` |
| `platform-catalog` / Plug | Show confidence, report count, age and "May be outdated" (screens in the Stitch file) |
| `explorer` admin | New routes for the Dominion screens: `/admin/prices/overview`, `/review`, `/published`, `/reporters`, `/settings`, `POST /admin/prices/review/:source/:id` |
| Remove | `plugPriceDecision`, `places.latest_retail_estimate`, `price_observation` writes, `in_band` |

## Backfill (gives real prices on day one)

Insert every Fleet fill since 2026-09-01 with a verified station and `amount`/`liters` > 0 into `fleet_price_report`, then run the engine once. On today's data that's about 75 reports. Item 2's grade fix applies, and the J$39.07 fill lands in **Review** (`OUT_OF_BOUNDS`) instead of being thrown away. Move the 1 legacy `price_observation` row across too.

## Health (add to the nightly checks)

`places.price_engine_health` returns one row with:
- review queue size and age of the oldest item
- the share of current prices that are outdated
- the median report count per published price
- reasons as a share of reports (alert if `UNUSUAL_FOR_STATION` > 5%)
- the share of published prices that come from the top 10 reporters

## Build order

1. Schema + settings + RLS (migration).
2. Engine functions + triggers + daily cron (migration), with SQL tests in `supabase/tests/price_engine_checks.sql`. These must run on `push` to `main` (audit item 5).
3. Fleet intake + backfill, then confirm prices appear for stations with recent fills.
4. Plug intake + grade lock + delete-my-data.
5. Petrojam stale hook.
6. Dominion **Fuel → Price Engine** screens and the Plug price states (Stitch file).
7. Add `price_observation`, `in_band`, `plugPriceDecision` and `latest_retail_estimate` to the retirement script.

Tests:
- Deno unit tests for the weighted median, each reason and confidence
- one replay test that pushes the 75 backfill reports through and asserts the published prices
- a Plug journey: log fuel → "checking" → price shows with its confidence

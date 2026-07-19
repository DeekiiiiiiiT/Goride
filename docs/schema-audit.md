# Schema Audit — Roam / Fleet / Dash

Database schema production-readiness audit — primary keys, foreign keys, data types, nullability, indexes, check constraints, and timestamp discipline across every table's **effective final schema**, reconstructed from 240 Supabase migration files.

**Totals:** 17 critical findings · 38 high priority · 30 cleanup items · 35 things done right.

> **Production verification note** (from a prior pass using Supabase's built-in advisor tool plus targeted SQL against the live project `csfllzzastacofsvcdsc`, dated 2026-07-18): confirms `public.kv_store_37f42386_toll_date_backup` was exposed with no RLS and has since been fixed, and confirms the `security_invoker` fix landed on the `matching_policies`/`matching_product_profiles`/`fuel_product_profiles` views (both match this audit's cross-referenced findings from the earlier RLS audit). That pass also characterized missing FK constraints as "cosmetic... deferred" — this audit disagrees with that severity call for a specific subset: the missing/CASCADE foreign keys detailed in pattern 01 below are not cosmetic, they're a live data-loss path on financial records. General "missing FK, no data-loss implication" cases are lower-severity cleanup items, correctly deferrable; the CASCADE-from-`auth.users`-into-money-tables cases are not.

---

## Executive summary

Nine reviewers reconstructed nine slices of the schema independently. The same shape of bug turned up, unprompted, in money tables belonging to three completely different product areas — that's a habit, not a coincidence. The genuinely good news is just as consistent: wherever this team built something and clearly thought hard about it (the unified ledger, the RBAC table, fare rules, evidence-file retention), it's some of the most careful schema design in the whole codebase. The gaps cluster in the tables that got bolted on fast.

### 1. Deleting a user account can silently erase money records — found independently three times

Three different reviewers, auditing three unrelated parts of the schema, each found the same bug shape without knowing the others had too: a table holding real financial data has a foreign key straight to `auth.users(id)` set to `ON DELETE CASCADE`. `rides.ride_requests.rider_user_id` cascades into `driver_offers` and then into `ledger_lines` — meaning deleting one user row deletes the ride *and* the accounting entry for it. `rides.payment_obligations.driver_user_id` cascades a driver's entire open-debt record away the moment their account is removed, with no trace that money was ever owed. And the driver financial-ledger tables have the same shape one layer down (child rows cascading off their own parent ledger rows, which is somewhat more defensible, but still breaks the "audit trail" promise those tables document about themselves). None of this requires an attacker — a completely routine account-deletion request, a GDPR erasure job, or an admin cleaning up test data will trigger it.

> rides_schema.sql (ride_requests) · rides_ledger_lines.sql · cash_settlement_v2_wallets.sql (payment_obligations) · driver_financial_ledger_rebuild.sql

### 2. Money columns are rarely told they can't go negative

Almost every one of the nine reviewers found the same gap independently: a `BIGINT`/`NUMERIC` money column with no `CHECK (amount >= 0)`. Order totals, tips, platform fees, payout amounts, toll charges, commission rates, settlement disputes — none of them are stopped from going negative or absurd by the database itself. The one bright spot proves the team knows how to do this right: `fare_rules` and the core `ledger.entries`/`financial_allocations` tables *do* have these checks, from their very first migration. The gap is entirely in tables that got added later without copying that discipline forward.

### 3. Status columns keep drifting out of sync with the CHECK constraint meant to guard them — and it's already caused a real bug

Two separate, concrete incidents turned up: a vehicle-catalog "needs more info" status was shipped in application code and admin UI, but the migration meant to add it to the underlying CHECK constraint has a bug that makes it a silent no-op — so setting that status will fail at runtime, today. And a trip-booking "audience" field had a real production bug (rows where a specific person was targeted but the visibility flag still said "anyone can see this") that got a one-time data backfill migration — but no constraint was ever added to stop the same bug from happening again on the very next write. Both are the same underlying habit: fixing the data without fixing the rule that let the data go bad.

### 4. The worst single case of "JSONB as a junk drawer": the toll settlement ledger has no real tables at all

Money that gets credited or charged to a driver over a toll dispute references a `toll_id` and a `trip_id` — and both point into an untyped JSONB blob sitting in a generic key-value table, not a real relational row. There's no foreign key here because there's nothing typed to reference. A typo in a toll ID doesn't get caught by the database — it just creates a permanently orphaned money adjustment. Every other domain in this schema (enterprise inventory, the ledger core, RBAC) is properly normalized; this one pocket never made the jump.

### 5. A live-tracking table writes a row every 2-4 seconds per active ride, with a random UUID key and no retention policy

`ride_location_updates` — GPS pings during an active trip — has no cleanup job anywhere, and its primary key is a random UUID rather than a sequential one. Both of these get more expensive the longer the platform runs: the table grows forever, and a random-UUID primary key on a high-write table causes steadily worsening index write amplification as it grows, which a sequential key wouldn't. This is a "fine at 10 dummy rows, buckles under real traffic" issue in the most literal sense possible.

The counterweight is real: the unified `ledger` schema (immutable entries, deterministic lock ordering to avoid deadlocks, idempotency keys with hash-mismatch detection, excellent FK index coverage) and `platform.user_roles` (the root of the entire RBAC system, already confirmed well-secured in an earlier audit — now also confirmed well-designed) are genuinely some of the best-built tables in this report. This isn't a team that doesn't know how to do it right. It's a team that did it right under pressure on the tables that mattered most, and didn't always have time to bring everything else up to the same bar.

---

## G1 — Vehicle catalog / maintenance / part sourcing

26 migrations, all `public` schema. Fleet vehicle data — the calmest domain in the audit.

### 🚨 Critical

**A status value shipped in the app was never actually added to the database's CHECK constraint — the migration meant to add it silently does nothing.** (`vehicle_catalog_pending_needs_info.sql:9-22`.) It's guarded by a check for a native enum type that was never created, so the guard is always false. Any code setting `status = 'needs_info'` will fail at runtime today.
```sql
ALTER TABLE public.vehicle_catalog_pending_requests
  DROP CONSTRAINT IF EXISTS vehicle_catalog_pending_requests_status_check;
ALTER TABLE public.vehicle_catalog_pending_requests
  ADD CONSTRAINT vehicle_catalog_pending_requests_status_check
  CHECK (status IN ('pending','approved','rejected','superseded','needs_info'));
```

**A two-hop CASCADE means deleting one vehicle-catalog row (e.g. retiring a model) wipes every organization's maintenance schedule tied to it, platform-wide, with no confirmation.** (`maintenance_schedule_system.sql:9,32`.) The sibling column three lines down correctly uses SET NULL to preserve history instead.
```sql
ALTER TABLE public.vehicle_maintenance_schedule
  DROP CONSTRAINT vehicle_maintenance_schedule_template_id_fkey;
ALTER TABLE public.vehicle_maintenance_schedule
  ADD CONSTRAINT vehicle_maintenance_schedule_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.maintenance_task_templates(id) ON DELETE RESTRICT;
```

### ⚠️ High priority

Two missing FK indexes (`maintenance_records.template_id`, `vehicle_catalog_pending_requests.resolved_vehicle_catalog_id`), plus `supplier_part_offer.unit_price`/`moq` and `part_fitment.year_from`/`year_to` have no sanity-range checks despite sibling columns in the same migration getting them.

### 🧹 Cleanup

No `updated_at` trigger anywhere in this domain — every table relies on application code to bump the timestamp. Several files also appear to be saved as UTF-16 rather than UTF-8 (harmless to Postgres, will break grep/CI tooling).

### ✅ What's actually solid

- Consistent "RLS enabled + deny-all-to-authenticated + service-role-only edge access" pattern across every table — a clean, deliberate boundary rather than an afterthought.
- The production-span CHECK constraints on `vehicle_catalog` (start ≤ end, valid month bounds, correct null handling for "ongoing") are thorough and correctly mirrored onto the pending-requests table in the same migration.
- Good use of partial unique indexes for conditional uniqueness instead of awkward workarounds.

---

## G2 — Delivery / payments / merchant core

~40 migrations. The Dash marketplace — orders, payouts, bank accounts, team members.

### 🚨 Critical

**Merchant payouts and merchant bank accounts have no foreign key to the merchant they belong to.** (`payments_schema.sql:64,115`.) A deleted or mistyped merchant leaves payout money records and bank routing data pointing at nothing — the worst-case orphaning shape in this batch.
```sql
ALTER TABLE payments.merchant_payouts
  ADD CONSTRAINT merchant_payouts_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES delivery.merchants(id) ON DELETE RESTRICT;
ALTER TABLE payments.merchant_bank_accounts
  ADD CONSTRAINT merchant_bank_accounts_merchant_id_fkey
  FOREIGN KEY (merchant_id) REFERENCES delivery.merchants(id) ON DELETE RESTRICT;
```

**No order/payment status column has a CHECK constraint, and no money column anywhere in this batch is prevented from going negative** — order totals, tips, fees, tax, transaction amounts, refund amounts, payout amounts. (`delivery_schema.sql:87-97`, `payments_schema.sql:12,30-32,50,65-67,84`.)
```sql
ALTER TABLE delivery.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('placed','accepted','preparing','ready','picked_up','delivered','cancelled'));
ALTER TABLE delivery.orders ADD CONSTRAINT orders_amounts_nonneg
  CHECK (subtotal >= 0 AND delivery_fee >= 0 AND platform_fee >= 0 AND tax >= 0 AND tip >= 0 AND discount >= 0 AND total >= 0);
ALTER TABLE payments.transactions ADD CONSTRAINT transactions_amount_nonneg CHECK (amount >= 0 AND net_amount >= 0);
ALTER TABLE payments.merchant_payouts ADD CONSTRAINT merchant_payouts_amount_nonneg CHECK (amount >= 0 AND net_amount >= 0);
```

**The commission rate that drives every payout split has no bound at all.** (`delivery_schema.sql:29`.) A bad write of `1.5` or a negative rate would silently mis-split revenue platform-wide.
```sql
ALTER TABLE delivery.merchants ADD CONSTRAINT merchants_commission_rate_range
  CHECK (commission_rate >= 0 AND commission_rate <= 1);
```

Two taxonomy tables (`merchant_business_types.sql:3-20`) never got RLS enabled at all — combined with a schema-wide default-privilege grant, any client can currently insert/update/delete rows in them. (Cross-references the earlier RLS audit's identical finding on this same table.)

### ⚠️ High priority

`courier_availability.driver_id` and `orders.courier_id` have no FK to any driver identity table. `merchants.business_type` is free text, never wired to the real taxonomy table that exists for exactly this purpose. Several missing FK indexes on `merchant_team_members.user_id`, `refunds.transaction_id`/`order_id`, `transactions.intent_id`.

### 🧹 Cleanup

Two different `updated_at` trigger functions are used inconsistently across sibling tables. Redundant `cuisine_type`/`cuisine_types` columns coexist with no clear authoritative one.

### ✅ What's actually solid

- Every table uses `uuid PRIMARY KEY DEFAULT gen_random_uuid()` consistently — no composite-PK or bigserial/uuid mixing anywhere.
- The onboarding-draft design is genuinely well done: a CHECK constraint only requires the real submission fields once `onboarding_status` leaves draft — a correctly enforced two-phase nullability pattern, not just permissive nulls everywhere.

---

## G3 — Merchant venue ops, business-type taxonomy, evidence files

~20 migrations. Kitchen stations, POS devices, business-vertical config, and the evidence-retention system.

### 🚨 Critical

**`merchant_prep_stations` has no RLS at all** (`prep_stations.sql:3-10`), unlike every sibling table added three days earlier in the same feature (ingredients, stock, print jobs), which all correctly scope reads to the owning merchant/team.

**Business-vertical taxonomy is hand-duplicated as two independent CHECK lists on two different tables.** (`vertical_metadata.sql:5-8,17-18,31-38`.) Proof they've already drifted: later migrations added new verticals to one table and never revisited the other's CHECK constraint.
```sql
CREATE TYPE delivery.merchant_vertical_type AS ENUM
  ('restaurant','grocery','pharmacy','alcohol','convenience','retail');
-- convert both tables' columns to this one type instead of two separate CHECK lists
```

`orders.fulfillment_type` has zero domain constraint (`restaurant_management.sql:18-20`), despite every other pseudo-enum column added in the same migration being properly CHECK-constrained.

### ⚠️ High priority

Five tables (`order_fulfillment`, `ingredients`, `ingredient_stock`, `print_jobs`, `merchant_prep_stations`) declare `updated_at` with no maintenance trigger, unlike a sibling table in the same batch of work that gets it right. `merchant_station_devices.prep_station_id` and `menu_item_recipes.ingredient_id` are unindexed FKs. `merchants.pos_tax_rate_percent` has no range check — a bad entry silently corrupts receipt totals.

### ✅ What's actually solid

- `evidence_files` is exactly what this audit was hoping to find: properly CHECK-constrained pseudo-enums, partial indexes scoped to live rows, and a composite index for its polymorphic lookup pattern.
- `merchant_settings` is the reference pattern the rest of this batch should have followed — surrogate-free 1:1 PK, trigger-maintained timestamp, owner-scoped RLS.
- FK `ON DELETE` behavior is thoughtful throughout the restaurant-management tables: cascade from merchant-owned rows, but `SET NULL` for optional staff references, so removing a team member doesn't nuke historical stock/print records.

---

## G4 — Driver + courier profiles, driver financial ledger

~19 migrations. Identity, compliance, and the driver-facing settlement projection.

### 🚨 Critical

**Settlement/payout/toll status on the driver financial-periods table are unconstrained free text** (`driver_financial_ledger_rebuild.sql:152-154`) — the exact same "already caused real breakage once" pattern as the G1 vehicle-catalog bug, this time on a table that drives real payouts.
```sql
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_settlement_status_check
  CHECK (settlement_status IN ('pending','processing','settled','failed','on_hold'));
```

**No non-negativity checks on any of the ~14 money columns on this table, and `ON DELETE CASCADE` sits on child rows of tables explicitly documented in their own comments as an immutable audit trail** (`driver_financial_ledger_rebuild.sql:130-151,67,172`) — deleting one parent event or period row silently wipes the line-item detail that makes up the audit trail.
```sql
ALTER TABLE ledger.financial_allocations
  DROP CONSTRAINT financial_allocations_financial_event_id_fkey,
  ADD CONSTRAINT financial_allocations_financial_event_id_fkey
    FOREIGN KEY (financial_event_id) REFERENCES ledger.financial_events(id) ON DELETE RESTRICT;
```

**`driver_id` on every ledger table is bare text with no FK to anything at all** (`driver_financial_ledger_rebuild.sql:33,83,123`) — combined with the driver-profile table's cascade-on-user-delete, a deleted account leaves financial history pointing at an id that resolves to nothing, silently.

### ⚠️ High priority

Courier/driver document and vehicle tables cascade-delete on profile removal — compliance/background-check history disappears the moment a profile is removed, undercutting the audit table that exists specifically to preserve it. `driver_share_percent` has no upper bound (could store 9999%). Missing FK index on `driver_financial_period_lines.financial_event_id` and on both ledger tables' `organization_id`.

### ✅ What's actually solid

- `financial_allocations.amount_minor CHECK (amount_minor > 0)` is exactly the right money guard, and idempotency keys plus a partial unique index prevent duplicate postings — strong protection for a money table.
- Compliance data stays columnar and queryable (real `DATE` columns for license/insurance expiry, not buried in JSONB) — "expiring soon" reports are a plain `WHERE` clause away.
- Migrations are defensively idempotent throughout, with conditional constraint checks before adding CHECKs — good hygiene for a table altered across many files.

---

## G5 — Rides core: booking, fare, matching, driver offers, ledger lines

~26 migrations. The highest-traffic table set in the entire database.

### 🚨 Critical

**Deleting a user account cascades through the ride and into the accounting ledger.** (`rides_schema.sql:29`, `rides_ledger_lines.sql:6`.) `ride_requests.rider_user_id` is `ON DELETE CASCADE` from `auth.users`, and that cascades further into `driver_offers` and then `ledger_lines` — a single account deletion (a routine GDPR erasure or account-closure request) permanently destroys trip history *and* the accounting record of what was paid.
```sql
ALTER TABLE rides.ride_requests
  DROP CONSTRAINT ride_requests_rider_user_id_fkey;
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_rider_user_id_fkey
  FOREIGN KEY (rider_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
-- pair with a soft-delete path (account_status = 'banned') for riders with ride history
```

**The accounting ledger itself has no foreign key at all on either the driver or rider column** (`rides_ledger_lines.sql:20-21`) — it can accumulate rows pointing at user ids that never existed, with no way to detect it.

**Nothing enforces that fare/payment/completion fields are actually set once a ride reaches `completed` status** (`rides_schema.sql:30-38`) — and two separate migrations had to backfill rows that reached completion without them, proof this has already broken in production.
```sql
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_completed_fields_chk
  CHECK (status <> 'completed' OR (fare_final_minor IS NOT NULL AND payment_method IS NOT NULL AND completed_at IS NOT NULL));
```

### ⚠️ High priority

No composite index supports "my current active ride" — the single most common query shape for both riders and drivers. Pickup/dropoff lat-lng have no range check, unlike the sibling driver-location columns on the same table. `vehicle_option` is free text that's already drifted from the real vehicle-types catalog introduced later. `surge_multiplier` has no positivity check — a zero or negative value would zero-out or invert every fare it touches.

### ✅ What's actually solid

- Money is consistently `BIGINT` minor units everywhere in this batch — no float-for-currency bug found.
- `fare_rules` had non-negative CHECKs on every money column from its very first migration — the standard the newer tables above should have copied.
- `ledger_lines` has well-targeted composite indexes for both real access patterns, plus a real idempotency key for safe retries.
- RLS is enabled on every table and scoped sensibly to the rider/assigned-driver pair.

---

## G6 — Rides: pin verification, live tracking, scheduled rides, matching/dispatch

~30 migrations.

### 🚨 Critical

**The rider verification PIN has no format constraint at all** (`pin_verification.sql:6`) — any 4-byte string satisfies the column, despite the code comment describing it as a 4-digit numeric code.
```sql
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_verification_pin_format_check
  CHECK (verification_pin IS NULL OR verification_pin ~ '^[0-9]{4}$');
```

**A non-negative check on the wait-time-fee rate was dropped when the table was copied into the newer matching-policy schema.** (`matching_platform_schema.sql:72`.) A negative rate here would silently *pay riders* for waiting instead of charging them.

**The live GPS-tracking table has no retention mechanism and will grow unbounded forever** (`ride_live_tracking.sql:17-30`) — a row is written every 2-4 seconds per active ride, and nothing ever purges old ones.
```sql
CREATE OR REPLACE FUNCTION public.rides_purge_old_location_updates(p_keep_days INT DEFAULT 30)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = rides, public AS $$
  WITH deleted AS (
    DELETE FROM rides.ride_location_updates
    WHERE received_at < NOW() - (p_keep_days || ' days')::INTERVAL
    RETURNING 1
  ) SELECT COUNT(*)::INTEGER FROM deleted;
$$;
-- then: cron.schedule('rides-location-purge', '0 3 * * *', $$SELECT public.rides_purge_old_location_updates();$$);
```

### ⚠️ High priority

The same live-tracking table uses a random UUID primary key at an insert rate where that causes real, worsening index write-amplification as the table grows — a sequential key would be far cheaper here. H3 geospatial cell keys are stored as text hex strings instead of the native 64-bit integer form, roughly doubling storage/index size. `wait_time_fee_minor`/`actual_tolls_minor` allow NULL to slip past their own CHECK due to three-valued NULL logic.

### ✅ What's actually solid

- Ride-status transitions use a real compare-and-swap pattern to close a check-then-act race, and driver-offer acceptance uses row locks plus a re-checked WHERE clause — textbook concurrency handling.
- A cross-column CHECK correctly enforces that a scheduled pickup time is set if and only if the booking is actually a scheduled ride.
- H3 spatial indexing itself (not the column type) is well-targeted with correctly scoped partial/unique indexes.

---

## G7 — Passenger social: contacts, connections, trip intents, saved places

~20 migrations.

### 🚨 Critical

**A trip's fare estimate — the number a payer sees before booking a delegated/Open-Roam trip — is stored as plain text, not a number** (`trip_intents.sql:20-21`), unlike identical fare columns everywhere else in the schema.
```sql
ALTER TABLE rides.booking_requests
  ALTER COLUMN fare_estimate_minor TYPE BIGINT USING NULLIF(fare_estimate_minor, '')::BIGINT;
```

**This exact bug already happened once** — a one-time backfill migration exists to fix trip-intent rows where a specific person was targeted but the visibility flag still said "anyone." No constraint was ever added afterward to stop it recurring. (`trip_intents.sql:8-15`, `fix_targeted_trip_intent_audience.sql:1-7`.)
```sql
ALTER TABLE rides.booking_requests
  ADD CONSTRAINT booking_requests_targeted_audience_chk
  CHECK (audience <> 'targeted' OR target_booker_user_id IS NOT NULL OR target_booker_phone_e164 IS NOT NULL);
```

Every other self-referential relationship table in this batch (connections, blocks, abuse reports) has a CHECK preventing a user from targeting themselves (`roam_connections.sql:3-19`) — the connection-*request* table, which feeds into all of them, is the one that's missing it.

### ⚠️ High priority

Phone number columns named for the E.164 format are never actually validated against it — some have no format check at all. Several FK columns central to "who can see this" lookups (`rider_contacts.linked_user_id`, group-membership join columns, `passenger_authorizations.passenger_user_id`) are unindexed.

### ✅ What's actually solid

- `roam_connections` is a textbook way to model an undirected relationship — canonical ordering plus a distinct-users check plus a uniqueness constraint, with no duplicate/reversed pairs possible.
- FK delete semantics are applied consistently across the whole domain: the owning side cascades, the "other party" reference is set to null, correctly preserving a point-in-time snapshot instead of orphaning or destroying history.
- Real business rules are pushed into partial unique indexes rather than left to application code — one active trip-intent per requester, one home/one work saved place per owner, one pending connection request per pair.

---

## G8 — Cash settlement, wallets, unified ledger core

~25 migrations, heavy history-stub duplication. The highest financial-risk domain — and the best-built one.

### 🚨 Critical

**A driver's open cash-debt record cascades away the instant their account is deleted** (`cash_settlement_v2_wallets.sql:8`) — the platform loses the record that money was ever owed, with no trace of the write-off. The third independent instance of pattern 1 above.
```sql
ALTER TABLE rides.payment_obligations
  DROP CONSTRAINT payment_obligations_driver_user_id_fkey,
  ADD CONSTRAINT payment_obligations_driver_user_id_fkey
    FOREIGN KEY (driver_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
```

### ⚠️ High priority

The core ledger's own `entry_type` column has no CHECK at all, despite every sibling column being tightly enumerated. Nothing stops a `DELETE` from being run directly against the immutable ledger tables — the FK cascade behavior is correct, but there's no trigger actually blocking a raw delete. Settlement-dispute and admin-override tables — the ones recording who authorized a manual write-off — have no foreign key on their driver/rider/authorizing-admin id columns at all.

### 🧹 Cleanup

This is the messiest migration-history batch in the audit — a "split" of one migration into six files never actually shipped separate content; all six are empty tracking stubs. Three money columns on the dispute/override tables are `INTEGER` where every other money column in the schema is `BIGINT`.

### ✅ What's actually solid

- No float-for-money bug anywhere — every balance/amount column is consistently BIGINT minor units.
- Account references from the ledger correctly default to RESTRICT, not CASCADE — an account referenced by any ledger line cannot be hard-deleted. Entries and receipts correctly have no `updated_at` at all, reflecting genuinely immutable, append-only design.
- FK index coverage on the hot paths is excellent — debit/credit account lookups, org+date composite indexes for statement queries, all present.
- Double-entry posting takes row locks in deterministic id-sorted order specifically to avoid deadlocks, and idempotency keys with hash-mismatch conflict detection prevent duplicate postings — this is the most carefully engineered part of the entire schema.

---

## G9 — Toll/fuel brain, platform RBAC, enterprise inventory, haulage

~30 migrations, including this session's RLS-remediation "wave" files.

### 🚨 Critical

**The toll settlement ledger — real money credited or charged to drivers over toll disputes — has no real tables behind it at all.** (`toll_settlement_allocations.sql:15-21`, `toll_match_on_ingest_indexes.sql:1-16`.) `toll_id`/`trip_id` are bare text pointing into an untyped JSONB blob inside a generic key-value store, because there's nothing typed to reference. This is the single worst "structured data hiding in JSONB" finding in the whole audit. Not a one-line fix — needs a real `toll.tolls`/`toll.trips` migration plus a backfill — but the highest-value schema investment in this report.

### ⚠️ High priority

Several enterprise-inventory child tables (purchase order lines, receiving variances, cost layers, transfer lines) are `NOT NULL ... ON DELETE CASCADE` foreign keys with no covering index — exactly the columns this session's RLS-remediation policies now join through on every read. `fuel.product_profiles.organization_id` is bare text with no FK, silently no-oping a real feature-flag gate on a typo instead of erroring.

### 🧹 Cleanup

Nine of the roughly forty files in this batch are pure migration-history-tracking stubs with no real content — worth squashing once things stabilize, purely so future reviewers don't have to open nine files to find the one with real DDL.

### ✅ What's actually solid

- **`platform.user_roles` — the root of the entire role system, already confirmed well-secured in a previous audit — is also genuinely well-designed:** real FKs with sensible delete behavior on every reference, a uniqueness constraint preventing duplicate role grants, both hot foreign-key columns indexed with no redundancy, and a trigger-enforced business rule a plain CHECK couldn't express.
- Toll and fuel policy config tables range-check every numeric tunable and use a clean partial-unique-index pattern for singleton "default" config rows — no negative radii or zero timeouts possible.
- Enterprise inventory is properly normalized: unit-of-measure conversions, vendor price history, an append-only ledger with a trigger that actively blocks mutation, and consistent high-precision numeric types for every quantity/money column — no JSON standing in for real structure anywhere.
- Schema separation (dedicated `platform`/`toll`/`fuel` schemas rather than dumping into `public`) is applied consistently — the toll-settlement table living in `public` instead of `toll` is the one break in that pattern.

---

*Compiled from nine independent passes, each tracking every migration to its effective final schema rather than just the first CREATE TABLE. Every finding cites a specific file and line. Fix pattern 1 (the CASCADE-from-auth.users bug) first — it's not hypothetical, it's a foreign key setting that will fire the next time anyone runs a normal account-deletion flow.*

---

## Remediation status (2026-07-18)

Applied live on project `csfllzzastacofsvcdsc` and filed under `supabase/migrations/20260718220000`–`20260718220700` (+ wave7 dual-write follow-up).

### CASCADE → RESTRICT (Wave 0)

| Constraint | New behavior |
|---|---|
| `rides.ride_requests.rider_user_id` → `auth.users` | `ON DELETE RESTRICT` |
| `rides.payment_obligations.driver_user_id` → `auth.users` | `ON DELETE RESTRICT` |
| `rides.driver_offers.driver_user_id` → `auth.users` | `ON DELETE RESTRICT` |
| `rides.ledger_lines.ride_request_id` → `ride_requests` | `ON DELETE RESTRICT` |
| `ledger.financial_allocations.financial_event_id` | `ON DELETE RESTRICT` |
| `ledger.driver_financial_period_lines.period_id` | `ON DELETE RESTRICT` |
| `vehicle_maintenance_schedule.template_id` | `ON DELETE RESTRICT` |

**Ops rule:** riders/drivers with trip or debt history must be soft-banned/suspended — do **not** hard-delete via `auth.admin.deleteUser` until an anonymization job exists.

### Other waves shipped

| Wave | What landed |
|---|---|
| 1 | `needs_info` on pending catalog status CHECK; maintenance template RESTRICT; FK indexes |
| 2 | Merchant payout/bank → `delivery.merchants` RESTRICT; non-neg order/tx/payout amounts; commission 0–1; order status CHECK; taxonomy DML revoked from clients |
| 3 | Driver period settlement/payout/toll status CHECKs; cash non-neg CHECKs; allocation/line RESTRICT |
| 4 | Completed-ride field guard; PIN `^[0-9]{4}$`; surge/wait-fee positivity; targeted-audience CHECK (11 orphan targeted rows demoted to `any_booker`); active-ride partial indexes |
| 5 | `rides.purge_old_location_updates(30)` + `pg_cron` job `purge_ride_location_updates_30d` |
| 6 | Fulfillment-type + `pos_tax_rate_percent` 0–100 CHECKs; prep-station team manage policy (RLS was already on from RLS Wave 0) |
| 7 | `toll.settlement_allocations` (typed `amount_minor` BIGINT) backfilled 176/176 from `public.toll_settlement_allocations`; apply/reverse RPCs dual-write |

### NOT VALID / pending validate

None left pending from this campaign — all new CHECKs/FKs validated on apply (orphan cleanup done first where needed).

### Still legacy / follow-up

- `public.toll_settlement_allocations` + KV `toll_alloc:*` remain readable; Fleet still loads public table first. Full cutover to `toll.settlement_allocations` (and typed `toll.tolls`/`trips`) is a separate campaign.
- UUID PK rewrite on `ride_location_updates` deferred (purge addresses retention risk).

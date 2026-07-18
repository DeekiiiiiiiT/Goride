# RLS Audit — Roam / Fleet / Dash

PostgreSQL Row Level Security audit of every Supabase migration in the repo — 175 files across 9 Postgres schemas (`public`, `rides`, `delivery`, `payments`, `ledger`, `platform`, `fuel`, `toll`, `matching`). Every `CREATE POLICY`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, view, and `SECURITY DEFINER` function was tracked to its **effective final state** — later migrations that `DROP POLICY`/`CREATE POLICY` or add columns to an existing table were read in chronological order, not just first-seen.

**Totals:** 21 critical findings · 24 high priority · ~20 cleanup items · ~20 things done right.

---

## Executive summary

Eight reviewers read eight slices of the 175 migration files independently. Two bug shapes turned up, unprompted, in four and two different feature areas respectively — that's not coincidence, that's a misunderstood Postgres pattern baked into how this team builds features. One finding below is a live, working privilege-escalation exploit today.

### 1. The single worst finding: any logged-in user can promote themselves to platform owner, right now

`public.organizations`' admin policies check `auth.users.raw_user_meta_data ->> 'role'` — and `raw_user_meta_data` is the one auth field a user can write to themselves, via a single client-side call to `supabase.auth.updateUser({ data: { role: 'platform_owner' } })`. No exploit tooling needed, no SQL injection, just the normal auth SDK used the "wrong" way. The moment that runs, the account has full read/write on every organization row, including Stripe customer IDs and billing emails. This is a today problem, not a someday problem.

> `supabase/migrations/20260614120000_organizations.sql:90-116`

### 2. The repeated bug: a "public.*" view sits in front of a well-protected table and silently throws the protection away

Four different features, built at different times, independently hit the exact same Postgres footgun: a `CREATE VIEW public.foo AS SELECT * FROM schema.foo` with no `security_invoker = true` runs as the **view's owner** — which bypasses RLS entirely — not as whoever is actually querying it. Pair that with the very natural-looking `GRANT SELECT ON public.foo TO authenticated` that always follows, and the underlying table's carefully-scoped policy becomes decoration. This one shape currently exposes: every ride ever booked platform-wide (rider PINs, guest phone numbers, fares, addresses — `public.rides_ride_requests`), every driver's live GPS location updated in real time (`public.rides_driver_locations`), and the entire consumer/driver ledger — every wallet balance, every payout (`public.ledger_entries`, `public.ledger_accounts`). The fix is one line per view (`WITH (security_invoker = true)`), but it needs to be audited across *every* `public.*` wrapper view in the codebase, not just the ones flagged below.

> `rides_ride_requests`: rider_admin.sql, scheduled_rides.sql, cash_settlement_wallet.sql · `rides_driver_locations`: haul_dispatch_mode.sql, h3_supply_index.sql · `ledger_entries`/`ledger_accounts`: ledger_schema_core.sql

### 3. "Users can edit their own row" policies were never narrowed after admin-only columns got added later

The other repeated shape: a table starts life with a simple, correct-looking `USING (auth.uid() = owner_id)` policy for `UPDATE`. Weeks later, a different migration adds columns that are supposed to be admin-controlled — `verification_status`, `suspended_at`, `commission_rate`, `background_check_status`. Nobody goes back to add a `WITH CHECK` that freezes those specific columns for the row's owner. The result, confirmed live today: a driver can UPDATE their own profile to set `status='active'` and clear their own suspension; a courier can do the same; a merchant can approve their own KYC documents, zero out their own commission rate, and flip their own suspension off; a customer can un-suspend their own account; merchant staff can edit an order's `total`/`tax`/`payment_status` directly. Every one of these is the same missing clause, five different tables.

> driver_profiles_insert_policy_fix.sql · driver_profiles.sql · courier_profiles.sql · delivery_schema.sql · merchant_application.sql · merchant_team_access_rls.sql · customer_account_status.sql

### 4. "organization_id IS NULL" was meant to mean "no fleet," but the policy reads it as "everyone"

Independent drivers and individual riders don't belong to an organization, so their ledger/wallet rows correctly have `organization_id = NULL`. Two different financial-table policies — written independently, weeks apart — used `organization_id IS NULL OR ...` as their access check, apparently intending "this row has no owning org, fall through to some other check." Instead it's the *first* clause in an OR chain, so it unconditionally grants read access to every row with a NULL org — which is nearly all personal driver/rider financial data on the platform.

> driver_financial_ledger_rebuild.sql:538-567 · ledger_schema_core.sql:379-416

### 5. Two tables are open to the literally-public anon key, right now, with no login required

A blanket `GRANT ALL ON ALL TABLES IN SCHEMA delivery TO anon` ran early in this project's history (with `ALTER DEFAULT PRIVILEGES`, so it silently applies to every future table too). Most tables created since have RLS enabled and are protected despite the blanket grant. Two aren't: `delivery.merchant_business_types` and `delivery.merchant_prep_stations` never got `ENABLE ROW LEVEL SECURITY` at all — meaning right now, with zero authentication, anyone can read, insert, update, or delete rows in either table.

> merchant_business_types.sql · prep_stations.sql

### 6. Dozens more tables never got RLS enabled, and are only safe today by accident

Across every group in this audit, reviewers independently found tables created with no `ENABLE ROW LEVEL SECURITY` statement anywhere: cash-settlement disputes and admin overrides, driver payment obligations, ride location history, toll-crossing logs, contact/connection/trip-share tables, toll-brain policy config, and toll settlement allocations. None of these are exploitable *today* only because nobody has yet run a `GRANT SELECT ... TO authenticated` on them — and pattern 2 above proves that's exactly the kind of statement that gets added later without anyone re-checking RLS. Full list is in each group's section below.

The counterweight: the actual root of the role system — `platform.user_roles`, the table every admin check in the app ultimately traces back to — is correctly locked down. No user can grant themselves a role through it. If that one had the same bug as pattern 1, this would be a very different report.

---

## G1 — Vehicle catalog / maintenance / part sourcing

21 migrations, April–May. Fleet vehicle catalog, maintenance schedules, parts/supplier tables — all `public` schema.

### Clean batch — no critical or high findings

- **Every table in this batch enables RLS and installs a deny-all policy in the same migration it's created in.** `vehicle_catalog`, all three maintenance tables, `vehicle_catalog_pending_requests`, and all five part-sourcing tables use a uniform `FOR ALL ... USING (false) WITH CHECK (false)` pattern for `authenticated` — all real access goes through edge functions running as `service_role`. There's never a window where a table exists unprotected.
- **`public.edge_insert_vehicle_catalog_row`** is a textbook-safe `SECURITY DEFINER` function: pinned `search_path` (blocks search-path hijacking), `REVOKE ALL FROM PUBLIC` then `GRANT EXECUTE TO service_role` only.

### Minor note

Tenant scoping (`organization_id text NOT NULL` on maintenance tables) is enforced only by the edge function, not by any RLS policy (both tables are deny-all). Not exploitable via PostgREST today, but zero defense-in-depth if an edge function ever mishandles org filtering.

---

## G2 — Delivery / payments / merchant core

36 migrations. The Dash marketplace — merchants, orders, customers, payouts, KYC. Every table here inherited a blanket `GRANT ALL TO anon` at the schema level, so RLS is the *only* defense.

### 🚨 Critical

**`delivery.merchant_business_types(_sections)` and `delivery.merchant_prep_stations` never got RLS enabled.** Combined with the schema-wide `anon` grant, both are open to the public internet right now — no login required to read, insert, update, or delete.
```sql
ALTER TABLE delivery.merchant_business_type_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.merchant_business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.merchant_prep_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business types readable by all" ON delivery.merchant_business_types
  FOR SELECT USING (is_active = true);
CREATE POLICY "Merchant team read prep stations" ON delivery.merchant_prep_stations
  FOR SELECT USING (merchant_id IN (
    SELECT id FROM delivery.merchants WHERE owner_id = auth.uid()
    UNION SELECT merchant_id FROM delivery.merchant_team_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "Merchant owner manages prep stations" ON delivery.merchant_prep_stations
  FOR ALL USING (EXISTS (SELECT 1 FROM delivery.merchants m
    WHERE m.id = merchant_prep_stations.merchant_id AND m.owner_id = auth.uid()));
```

**Merchants can self-approve their own verification, zero their own commission, and un-suspend themselves.** (`delivery_schema.sql:201-202`, plus every migration since that added admin columns to `delivery.merchants`.) The original owner-editable policy is `FOR ALL USING (auth.uid() = owner_id)` with no `WITH CHECK`. Every later migration added admin-only columns (`verification_status`, `commission_rate`, `operational_status`, `suspended_at`) without ever narrowing this policy.
```sql
DROP POLICY IF EXISTS "Merchants editable by owner" ON delivery.merchants;
CREATE POLICY "Merchants update own editable fields" ON delivery.merchants
  FOR UPDATE USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND verification_status IS NOT DISTINCT FROM (SELECT m2.verification_status FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND operational_status  IS NOT DISTINCT FROM (SELECT m2.operational_status  FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND commission_rate     IS NOT DISTINCT FROM (SELECT m2.commission_rate     FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT m2.suspended_at FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    -- ...repeat for every other admin-only column
  );
CREATE POLICY "Merchants insert own row" ON delivery.merchants FOR INSERT WITH CHECK (auth.uid() = owner_id);
-- FOR ALL also let owners self-DELETE their storefront — the split above removes that too
```

**Suspended customers can un-suspend themselves.** (`customer_account_status.sql`, extending `delivery_schema.sql:217-218`.) Same missing-`WITH CHECK` shape as above, on `delivery.customers`.
```sql
DROP POLICY IF EXISTS "Customers own data" ON delivery.customers;
CREATE POLICY "Customers update own editable fields" ON delivery.customers
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND account_status IS NOT DISTINCT FROM (SELECT c2.account_status FROM delivery.customers c2 WHERE c2.id = customers.id)
    AND suspended_at    IS NOT DISTINCT FROM (SELECT c2.suspended_at    FROM delivery.customers c2 WHERE c2.id = customers.id)
  );
```

**Merchants can approve their own KYC documents.** (`merchant_application.sql:49-65`.) The insert/update policies check document ownership but never restrict `status`/`verified_by`/`verified_at`.
```sql
CREATE POLICY "Merchants can insert own documents" ON delivery.merchant_documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM delivery.merchants m WHERE m.id = merchant_documents.merchant_id AND m.owner_id = auth.uid())
    AND status = 'pending' AND verified_by IS NULL AND verified_at IS NULL
  );
CREATE POLICY "Merchants can resubmit own documents" ON delivery.merchant_documents
  FOR UPDATE USING (EXISTS (SELECT 1 FROM delivery.merchants m WHERE m.id = merchant_documents.merchant_id AND m.owner_id = auth.uid()))
  WITH CHECK (status = 'pending' AND verified_by IS NULL AND verified_at IS NULL);
```

**Merchant staff can rewrite an order's financials, not just its status.** (`merchant_team_access_rls.sql:35-49`.) The team "update orders" policy has no `WITH CHECK` restricting which columns change — any staffer with the `orders` permission can set `total`, `tax`, `platform_fee`, or flip `payment_status` to `'paid'` directly, no payment required.
```sql
DROP POLICY IF EXISTS "Team members update orders" ON delivery.orders;
CREATE POLICY "Team members update order status" ON delivery.orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM delivery.merchants m WHERE m.id = orders.merchant_id AND m.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM delivery.merchant_team_members tm WHERE tm.merchant_id = orders.merchant_id
               AND tm.user_id = auth.uid() AND 'orders' = ANY(tm.permissions))
  ) WITH CHECK (
    total IS NOT DISTINCT FROM (SELECT o2.total FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND payment_status IS NOT DISTINCT FROM (SELECT o2.payment_status FROM delivery.orders o2 WHERE o2.id = orders.id)
    -- ...repeat for subtotal, tax, tip, discount, platform_fee, merchant_id, customer_id
  );
```

### ⚠️ High priority

- `public.evidence_files_authenticated_read` is `FOR SELECT TO authenticated USING (true)` with no org scoping — any logged-in user can read every organization's fuel/toll receipts, odometer proofs, and maintenance invoices platform-wide.
- `delivery.order_disputes` and `payments.merchant_adjustments` have RLS enabled but zero policies were ever added — currently safe (default-deny) but neither customers nor merchants have any way to see their own disputes/adjustments, matching a bug already hit and fixed twice elsewhere in this same batch (`merchant_hours`, `menu_categories`).
- `merchant_station_devices` and `merchant_shift_sessions` — same "RLS on, no policies" gap; confirm device pairing and PIN-shift auth are fully service-role-mediated.

### 🧹 Cleanup & performance

No index on `merchant_team_members.user_id`, which is subquery-filtered on nearly every merchant-portal request:
```sql
CREATE INDEX idx_merchant_team_members_user_id ON delivery.merchant_team_members (user_id) WHERE user_id IS NOT NULL;
```
Two "service role full access" policies check `auth.jwt() ->> 'role' = 'service_role'`, but the real `service_role` Postgres role already has `BYPASSRLS` and never evaluates policies — dead code, drop for clarity.

### ✅ What's actually solid

- The team-roster infinite-recursion bug (a policy on `merchant_team_members` that subqueried itself) was caught in production and correctly fixed with a flat check instead of a workaround that reopened the hole.
- Restaurant-management tables (ingredients, stock movements, print jobs, order fulfillment) are SELECT-only for staff with all writes routed through service-role edge functions.
- The merchant-documents storage bucket is private with an explicit MIME/size allowlist — appropriate for KYC material.

---

## G3 — Driver + courier profiles, driver financials

12 migrations. Driver/courier identity, compliance, and the financial-ledger rebuild.

### 🚨 Critical

**A driver can INSERT their own profile pre-approved and active.** (`driver_profiles_insert_policy_fix.sql:6-9`.) The insert policy only checks `auth.uid() = user_id` — nothing constrains `status`, `fleet_id`, or `background_check_status`. (This migration's own filename says "fix" — it traded a functional bug for a security hole by deleting an earlier guard instead of generalizing it.)
```sql
DROP POLICY IF EXISTS "Drivers can insert own profile" ON public.driver_profiles;
CREATE POLICY "Drivers can insert own profile" ON public.driver_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending'
    AND onboarding_complete = FALSE AND background_check_status IS NULL
    AND suspended_at IS NULL AND deactivated_at IS NULL);
```

**UPDATE has no `WITH CHECK` — a driver can self-approve and self-unsuspend after the fact.** (`driver_profiles.sql:131-133`.) `status`, `background_check_status`, `suspended_at`, and `fleet_id` were all added by later migrations onto this same UPDATE-able row.
```sql
DROP POLICY IF EXISTS "Drivers can update own profile" ON public.driver_profiles;
CREATE POLICY "Drivers can update own profile" ON public.driver_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IS NOT DISTINCT FROM (SELECT p.status FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
    AND fleet_id IS NOT DISTINCT FROM (SELECT p.fleet_id FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
    AND background_check_status IS NOT DISTINCT FROM (SELECT p.background_check_status FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT p.suspended_at FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
  );
```

**Identical bug on `delivery.courier_profiles`** (`courier_profiles.sql:88-94`) — both INSERT and UPDATE. Same fix shape, applied to `status`, `background_check_status`, `approved_at`, `suspended_at`.

**`organization_id IS NULL` grants every authenticated user full read of every independent driver's earnings.** (`driver_financial_ledger_rebuild.sql:538-567`.) All four ledger SELECT policies lead with `organization_id IS NULL OR ...`.
```sql
DROP POLICY IF EXISTS fin_events_select ON ledger.financial_events;
CREATE POLICY fin_events_select ON ledger.financial_events
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR driver_id = auth.uid()::text
    OR (organization_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid()))
  );
-- apply the same shape to financial_allocations, driver_financial_periods, and ..._lines
```

### ⚠️ High priority

- `driver_admin_directory` views expose raw driver/ride/location joins with no RLS re-check — safe today only because the grant is `service_role`-only. Add `security_invoker = true` anyway.
- Inconsistent admin-bypass pattern: some policies check `auth.jwt() ->> 'role' = 'service_role'` while the ledger correctly uses `TO service_role` role-based scoping. Standardize on the latter.

### 🧹 Cleanup & performance

```sql
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_fin_events_org ON ledger.financial_events(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_alloc_org ON ledger.financial_allocations(organization_id) WHERE organization_id IS NOT NULL;
```

### ✅ What's actually solid

- The ledger's mutation surface is properly locked down — only SELECT policies exist for `authenticated`; every write goes through `SECURITY DEFINER` functions with pinned `search_path` and `service_role`-only execute grants.
- `driver_play_store_launch` tables enable RLS with zero policies for any client role — correct default-deny for internal admin tooling.
- No `auth.uid()` NULL-trap anywhere in this batch.

---

## G4 — Rides core: booking, fare, matching, driver offers, ledger lines

25 migrations, mid-May. Where the "view bypasses RLS" pattern first shows up.

### 🚨 Critical

**`public.rides_ride_requests` bypasses RLS and is granted to every authenticated user — full-platform ride data leak.** (`rider_admin.sql:52-53`, `ride_payment_and_completion.sql:92-97`, `rides_ledger_lines.sql:36-41`.) The base table `rides.ride_requests` has a correct participant-only policy, but this view (owned by the migration role, not the querying session) ignores it entirely.
```sql
ALTER VIEW public.rides_ride_requests SET (security_invoker = true);
-- apply the same hardening to every public.rides_* view, even service_role-only ones today:
ALTER VIEW public.rides_fare_rules SET (security_invoker = true);
ALTER VIEW public.rides_surge_cells SET (security_invoker = true);
ALTER VIEW public.rides_vehicle_types SET (security_invoker = true);
ALTER VIEW public.rides_rider_profiles SET (security_invoker = true);
```

**`rides.ledger_lines` never got RLS enabled at all.** (`rides_ledger_lines.sql:4-24`.) Holds per-transaction `earnings_gross_minor`, `cash_collected_minor`, `driver_user_id`, `rider_user_id`. Accidentally safe today only because no `GRANT` to `authenticated` exists yet.
```sql
ALTER TABLE rides.ledger_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY rides_ledger_lines_participant_select ON rides.ledger_lines
  FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid() OR rider_user_id = auth.uid());
-- no INSERT/UPDATE/DELETE policy — ledger is system-written only
```

**A suspended rider can un-suspend themselves.** (`rides_schema.sql:137-139`, `rider_admin.sql:3-9`.) The original owner-UPDATE policy on `rider_profiles` predates `account_status`/`suspended_at`/`suspended_by`.
```sql
REVOKE UPDATE ON rides.rider_profiles FROM authenticated;
GRANT UPDATE (display_name, phone, updated_at) ON rides.rider_profiles TO authenticated;
DROP POLICY IF EXISTS rides_rider_profiles_own_update ON rides.rider_profiles;
CREATE POLICY rides_rider_profiles_own_update ON rides.rider_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### ⚠️ High priority

- `rides.service_body_types` never got RLS enabled — same latent shape as `ledger_lines`.
- A dozen `SECURITY DEFINER` RPCs (`rides_create_ride_request`, `rides_patch_ride_request`, `rides_cancel_ride_request`, driver-offer functions) have zero internal ownership checks — safety is 100% dependent on `GRANT EXECUTE` scoping, and that scoping already slipped once. Recommend a CI check asserting these grants never include `authenticated`/`anon`.
- `surge_cells` RLS reads `user_metadata` (client-writable) instead of `app_metadata` for a role check. Low blast radius today, but the wrong claim source.

### ✅ What's actually solid

- `ride_requests`/`driver_offers` writes are never granted directly to `authenticated` — only SELECT; all mutation goes through service-role-gated RPCs.
- `rider_admin_notes` enables RLS with deliberately zero authenticated policies, with an explicit code comment stating the intent.
- `fare_rules`/`vehicle_types` reference data correctly uses `USING (true)` for read while never granting write to non-admins.

---

## G5 — Rides: pin verification, live tracking, geofence, scheduled rides, dispatch

30 migrations. Same "unfiltered view" bug as G4, this time on live driver location and the ride PIN.

### 🚨 Critical

**`public.rides_driver_locations` bypasses RLS — every driver's live GPS exposed to every signed-in user.** (`haul_dispatch_mode.sql:68-72`, `h3_supply_index.sql:79-92`.) The underlying table's policy is correctly scoped to `user_id = auth.uid()`, but the view ignores it. The first version of this view even granted `SELECT` to `anon` — fully public — before a later migration quietly dropped that grant without ever fixing the actual bypass.
```sql
DROP POLICY IF EXISTS rides_driver_locations_own_select ON rides.driver_locations;
CREATE POLICY rides_driver_locations_own_select ON rides.driver_locations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM rides.ride_requests r
      WHERE r.assigned_driver_user_id = rides.driver_locations.user_id
        AND (r.rider_user_id = auth.uid() OR r.passenger_user_id = auth.uid())
        AND r.status IN ('driver_assigned','driver_en_route_pickup','driver_arrived_pickup','on_trip'))
  );

DROP VIEW IF EXISTS public.rides_driver_locations;
CREATE VIEW public.rides_driver_locations WITH (security_invoker = true) AS
  SELECT user_id, lat, lng, heading_degrees, available_for_rides, body_type_slug, h3_cell, updated_at
  FROM rides.driver_locations;
REVOKE ALL ON public.rides_driver_locations FROM anon;
GRANT SELECT ON public.rides_driver_locations TO authenticated, service_role;
```

**The same view bug leaks every rider's 4-digit verification PIN, guest phone number, and full trip detail.** (`rides_public_view_pin_columns.sql:4-8`, `scheduled_rides.sql:65-69`, `rides_guest_passenger.sql:88-92`.) A stranger can pull a rider's PIN from this view and impersonate the driver at pickup.
```sql
DROP POLICY IF EXISTS rides_requests_passenger_select ON rides.ride_requests;
CREATE POLICY rides_requests_passenger_select ON rides.ride_requests
  FOR SELECT TO authenticated
  USING (rider_user_id = auth.uid() OR assigned_driver_user_id = auth.uid() OR passenger_user_id = auth.uid());

DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests WITH (security_invoker = true) AS SELECT * FROM rides.ride_requests;
GRANT SELECT ON public.rides_ride_requests TO authenticated, service_role;
```

### ⚠️ High priority

- `rides.ride_location_updates`, `rides.ride_live_state`, and `rides.ride_toll_crossings` never got RLS enabled — same latent per-second-GPS-trail exposure risk.
- The omnibus `rides_patch_ride_request`/`..._cas` RPC has no column allow-list — it can set fare, PIN, and driver assignment via one JSONB blob. Safe only because it's `service_role`-only today.

### 🧹 Cleanup & performance

`rides_ride_requests` and `rides_dispatch_settings` are dropped and recreated fresh in nearly every migration in this batch, hand-copying the grant list from memory each time — that's exactly how `anon` got added to `rides_driver_locations` and had to be walked back five days later.

### ✅ What's actually solid

- `ride_messages` is the one table in this batch that gets it right end-to-end: policy applied directly on the queried table, participant-scoped, writes service-role only.
- The base-table RLS on `driver_locations` and `ride_requests` is itself well-designed — the security failure is entirely in the unfiltered views layered on top.

---

## G6 — Passenger social: contacts, connections, trip intents, saved places

20 migrations. The most privacy-sensitive batch: home/work addresses, live-location sharing, phone numbers, social graph. Contains the single worst finding in the audit.

### 🚨 Critical

**Any authenticated user can self-promote to platform owner.** (`organizations.sql:90-116`.) The admin policies on `public.organizations` OR together a safe check (`raw_app_meta_data`, admin-only-writable) with an unsafe one (`raw_user_meta_data`, writable by the user themselves via the normal auth SDK).
```sql
DROP POLICY IF EXISTS "Platform staff can view all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Platform owners can manage all organizations" ON public.organizations;
CREATE POLICY "Platform staff can view all organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid()
      AND auth.users.raw_app_meta_data->>'role' IN ('superadmin','platform_owner','platform_support','platform_analyst'))
  );
CREATE POLICY "Platform owners can manage all organizations" ON public.organizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid()
      AND auth.users.raw_app_meta_data->>'role' IN ('superadmin','platform_owner'))
  );
```

**Nine tables holding contacts, live-location-share tokens, delegated-booking data, and the social graph never got RLS enabled — ever.** Highest-stakes: `ride_trip_shares` (the token that gates who can see a rider's live location) and `booking_requests` (delegated/Roam-Tag booking, including a phone number field).
```sql
ALTER TABLE rides.ride_trip_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY ride_trip_shares_owner ON rides.ride_trip_shares
  FOR ALL TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE rides.booking_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_requests_requester ON rides.booking_requests
  FOR ALL TO authenticated USING (requester_user_id = auth.uid()) WITH CHECK (requester_user_id = auth.uid());
CREATE POLICY booking_requests_target_booker_select ON rides.booking_requests
  FOR SELECT TO authenticated USING (target_booker_user_id = auth.uid() OR claimed_by_user_id = auth.uid());

-- plus: ride_passenger_invites, ride_trip_share_events, passenger_authorizations,
-- pickup_location_requests, roam_connection_requests, roam_connections, user_blocks, abuse_reports
```

### ⚠️ High priority

- `fix_targeted_trip_intent_audience.sql` is a data backfill, not a policy fix — "targeted" vs. "open" audience has zero database-level enforcement today, because the table it governs has no RLS at all.
- The `rides_create_ride_request` RPC trusts caller-supplied `rider_contact_id`/`rider_user_id` with no ownership check — safe today only because it's `service_role`-only.

### ✅ What's actually solid

- `passenger_saved_places` (home/work addresses) gets RLS exactly right: matching `USING`/`WITH CHECK` on the owner, plus partial unique indexes preventing duplicate Home/Work rows.
- `rider_contacts`/`rider_contact_groups`/`rider_contact_places` form a clean, non-recursive ownership chain.
- The final state of `ride_messages` correctly folds in delegated bookers and grants no client-side `INSERT` at all.

---

## G7 — Cash settlement, wallets, ledger core

16 migrations. Real money: driver cash-collection wallets, settlement disputes, admin overrides, the unified ledger.

### 🚨 Critical

**`public.ledger_accounts`/`ledger_entries`/`ledger_source_receipts` are the same unfiltered-view bug, on the entire unified ledger.** (`ledger_schema_core.sql:418-424`.) Any authenticated rider, driver, or merchant can read every driver's earnings and every org's fleet ledger, platform-wide.
```sql
REVOKE SELECT ON public.ledger_accounts FROM authenticated;
REVOKE SELECT ON public.ledger_entries FROM authenticated;
REVOKE SELECT ON public.ledger_source_receipts FROM authenticated;
-- clients must use the properly-scoped ledger_scoped_* views instead
```

**Independent of the view bug, the policy itself leaks personal wallets.** (`ledger_schema_core.sql:379-416`.) `organization_id IS NULL` is the first clause in an OR chain on all three SELECT policies — functionally `USING (true)` for the entire consumer ledger.
```sql
DROP POLICY IF EXISTS ledger_accounts_select ON ledger.accounts;
CREATE POLICY ledger_accounts_select ON ledger.accounts
  FOR SELECT TO authenticated
  USING (
    public.rbac_is_platform_user(auth.uid())
    OR (owner_user_id IS NOT NULL AND owner_user_id = auth.uid())
    OR (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organizations o WHERE o.id = ledger.accounts.organization_id AND o.owner_id = auth.uid()))
  );
-- apply the same corrected shape to ledger_entries_select and ledger_source_receipts_select
```

**A third recreation of `public.rides_ride_requests`** (`cash_settlement_wallet.sql:87-91`) repeats the same unfiltered-view bug in the migration that adds cash/tip fields — leaking the exact data it introduces.

### ⚠️ High priority

`rides.cash_settlement_disputes`, `rides.admin_settlement_overrides`, and `rides.payment_obligations` never got RLS enabled.

### ✅ What's actually solid

- Every money-moving function in this batch is `SECURITY DEFINER` with a correct `REVOKE ALL FROM PUBLIC` + `service_role`-only execute grant. No client can invoke any of them directly.
- As a consequence, there is no client-writable path into settlement state at all.
- `ledger_scoped_views.sql` is the correct pattern the broken views above should have used — every one of its four views explicitly declares `security_invoker = true`.

---

## G8 — Toll/fuel brain, platform RBAC, enterprise inventory, haulage

18 migrations. Includes `platform_rbac_schema.sql` — the single highest-leverage file in the whole audit, since every other table's admin check ultimately traces back to it.

### 🚨 Critical

**Two inventory-ledger RPCs are callable by a fully unauthenticated caller.** (`enterprise_inventory_rpcs.sql:3-157`.) `inventory_append_entry_tx` and `receive_purchase_order_tx` have no explicit `GRANT`/`REVOKE`, so they auto-inherit `EXECUTE` from an early blanket `ALTER DEFAULT PRIVILEGES ... TO anon, authenticated` on the whole `delivery` schema. Neither function checks the caller. Only stopped today because the tables they write to have RLS enabled with zero policies — an accident, not a designed control.
```sql
REVOKE EXECUTE ON FUNCTION delivery.inventory_append_entry_tx(uuid,uuid,numeric,uuid,numeric,text,text,uuid,numeric,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION delivery.receive_purchase_order_tx(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.inventory_append_entry_tx(uuid,uuid,numeric,uuid,numeric,text,text,uuid,numeric,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.receive_purchase_order_tx(uuid,uuid,jsonb) TO service_role;
```

### ⚠️ High priority

- `toll.brain_policies` never got RLS enabled, exposed via a `public.toll_brain_policies` view granted to `authenticated` — every row visible platform-wide. The sibling `fuel.brain_policies` table got this exactly right.
```sql
ALTER TABLE toll.brain_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY toll_brain_policies_service ON toll.brain_policies
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
- `public.toll_settlement_allocations` — a financial table — never got RLS enabled either, safe today only because no client-facing grant exists yet.
- Enterprise inventory has RLS enabled on all 22 tables but a policy defined for only one (`inventory_nodes`) — tenant isolation is effectively unimplemented at the database layer for this feature.

### 🧹 Cleanup & performance

```sql
DROP INDEX IF EXISTS platform.idx_user_roles_user_id;
-- redundant: platform.user_roles' own UNIQUE (user_id, role_id) constraint already covers this
```

### ✅ What's actually solid

- **`platform.user_roles` — the root of the entire role system — is correctly locked down.** INSERT/UPDATE/DELETE all gate on a platform-owner check, and UPDATE has both `USING` and `WITH CHECK`. No user can grant themselves a role through this table.
- Recursion is correctly broken via `SECURITY DEFINER` helper functions that derive identity from `auth.uid()` internally rather than taking a caller-supplied user id.
- The `fuel` schema's RLS is done consistently right across all four of its tables — the template `toll.brain_policies` should have copied.

---

*Compiled from eight independent file-by-file passes tracking every migration to its effective final state, not first-seen. Every finding cites a specific file and line, and every fix is a copy-pasteable `DROP POLICY`/`CREATE POLICY` (or `ALTER TABLE`/`ALTER VIEW`) statement — run them in order, and re-test the specific self-approval / self-escalation scenario described before considering a finding closed.*

---

## Remediation status (Waves 0–4)

*Last updated: 2026-07-18*

| Finding | Severity | Status | Wave | Notes |
|---------|----------|--------|------|-------|
| Organizations trust `raw_user_meta_data` (self-promote) | Critical | **Fixed** | Wave 0 | Policies use `platform.current_user_is_platform_*` only |
| Anon-open `merchant_business_types` / prep stations | Critical | **Fixed** | Wave 0 | RLS + read/manage policies |
| Inventory RPCs executable by anon | Critical | **Fixed** | Wave 0 | EXECUTE revoked; `service_role` only |
| `public.rides_*` / ledger views bypass RLS | Critical | **Fixed** | Wave 1 | `security_invoker=true`; bare ledger SELECT revoked from authenticated |
| Driver GPS / ride PIN via views | Critical | **Fixed** | Wave 1 | Invoker + trip-scoped driver_locations SELECT |
| `organization_id IS NULL OR …` wallet leak | Critical | **Fixed** | Wave 2 | Owner/driver/org-owner checks only |
| Self-approve / un-suspend (driver, courier, merchant, customer, KYC, orders, rider) | Critical | **Fixed** | Wave 3 | WITH CHECK freezes + rider column GRANTs |
| Latent tables without RLS (ledger_lines, social, toll brain, settlement, …) | Critical/High | **Fixed** | Wave 4 | ENABLE RLS + participant/service policies |
| `evidence_files` USING (true) | High | **Skipped on prod** | Wave 4 | Table not present on production; guarded in migration |

**Migrations:** `20260718160000`–`20260718164000` (plus Wave 3a/3b/4a/4b applied via Supabase MCP).  
**Follow-ups:** Wave 6 enterprise inventory tenant policies; Wave 7 migration history repair for `db push`.

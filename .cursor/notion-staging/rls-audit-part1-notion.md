*Synced from docs/rls-audit.md on 2026-07-18.*

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

### CRITICAL

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

### HIGH PRIORITY

- `public.evidence_files_authenticated_read` is `FOR SELECT TO authenticated USING (true)` with no org scoping — any logged-in user can read every organization's fuel/toll receipts, odometer proofs, and maintenance invoices platform-wide.
- `delivery.order_disputes` and `payments.merchant_adjustments` have RLS enabled but zero policies were ever added — currently safe (default-deny) but neither customers nor merchants have any way to see their own disputes/adjustments, matching a bug already hit and fixed twice elsewhere in this same batch (`merchant_hours`, `menu_categories`).
- `merchant_station_devices` and `merchant_shift_sessions` — same "RLS on, no policies" gap; confirm device pairing and PIN-shift auth are fully service-role-mediated.

### CLEANUP & performance

No index on `merchant_team_members.user_id`, which is subquery-filtered on nearly every merchant-portal request:
```sql
CREATE INDEX idx_merchant_team_members_user_id ON delivery.merchant_team_members (user_id) WHERE user_id IS NOT NULL;
```
Two "service role full access" policies check `auth.jwt() ->> 'role' = 'service_role'`, but the real `service_role` Postgres role already has `BYPASSRLS` and never evaluates policies — dead code, drop for clarity.

### SOLID — What's actually solid

- The team-roster infinite-recursion bug (a policy on `merchant_team_members` that subqueried itself) was caught in production and correctly fixed with a flat check instead of a workaround that reopened the hole.
- Restaurant-management tables (ingredients, stock movements, print jobs, order fulfillment) are SELECT-only for staff with all writes routed through service-role edge functions.
- The merchant-documents storage bucket is private with an explicit MIME/size allowlist — appropriate for KYC material.

---

## G3 — Driver + courier profiles, driver financials

12 migrations. Driver/courier identity, compliance, and the financial-ledger rebuild.

### CRITICAL

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

### HIGH PRIORITY

- `driver_admin_directory` views expose raw driver/ride/location joins with no RLS re-check — safe today only because the grant is `service_role`-only. Add `security_invoker = true` anyway.
- Inconsistent admin-bypass pattern: some policies check `auth.jwt() ->> 'role' = 'service_role'` while the ledger correctly uses `TO service_role` role-based scoping. Standardize on the latter.

### CLEANUP & performance

```sql
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_fin_events_org ON ledger.financial_events(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_alloc_org ON ledger.financial_allocations(organization_id) WHERE organization_id IS NOT NULL;
```

### SOLID — What's actually solid

- The ledger's mutation surface is properly locked down — only SELECT policies exist for `authenticated`; every write goes through `SECURITY DEFINER` functions with pinned `search_path` and `service_role`-only execute grants.
- `driver_play_store_launch` tables enable RLS with zero policies for any client role — correct default-deny for internal admin tooling.
- No `auth.uid()` NULL-trap anywhere in this batch.

---

## G4 — Rides core: booking, fare, matching, driver offers, ledger lines

25 migrations, mid-May. Where the "view bypasses RLS" pattern first shows up.

### CRITICAL

**`public.rides_ride_requests` bypasses RLS and is granted to every authenticated user — full-platform ride data leak.** (`rider_admin.sql:52-53`, `ride_payment_and_completion.sql:92-97`, `rides_ledger_lines.sql:36-41`.) The base table `rides.ride_requests` has a correct participant-only policy, but this view (owned by the migration role, not the querying session) ignores it entirely.
```sql
ALTER VIEW public.rides_ride_requests SET (security_invoker = true);
-- apply the same hardening to every public.rides_* view, even service_role-only ones today:
ALTER VIEW public.rides_fare_rules SET (security_invoker = true);

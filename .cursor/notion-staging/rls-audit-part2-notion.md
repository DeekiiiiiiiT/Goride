*Synced from docs/rls-audit.md on 2026-07-18.*

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

### HIGH PRIORITY

- `rides.service_body_types` never got RLS enabled — same latent shape as `ledger_lines`.
- A dozen `SECURITY DEFINER` RPCs (`rides_create_ride_request`, `rides_patch_ride_request`, `rides_cancel_ride_request`, driver-offer functions) have zero internal ownership checks — safety is 100% dependent on `GRANT EXECUTE` scoping, and that scoping already slipped once. Recommend a CI check asserting these grants never include `authenticated`/`anon`.
- `surge_cells` RLS reads `user_metadata` (client-writable) instead of `app_metadata` for a role check. Low blast radius today, but the wrong claim source.

### SOLID — What's actually solid

- `ride_requests`/`driver_offers` writes are never granted directly to `authenticated` — only SELECT; all mutation goes through service-role-gated RPCs.
- `rider_admin_notes` enables RLS with deliberately zero authenticated policies, with an explicit code comment stating the intent.
- `fare_rules`/`vehicle_types` reference data correctly uses `USING (true)` for read while never granting write to non-admins.

---

## G5 — Rides: pin verification, live tracking, geofence, scheduled rides, dispatch

30 migrations. Same "unfiltered view" bug as G4, this time on live driver location and the ride PIN.

### CRITICAL

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

### HIGH PRIORITY

- `rides.ride_location_updates`, `rides.ride_live_state`, and `rides.ride_toll_crossings` never got RLS enabled — same latent per-second-GPS-trail exposure risk.
- The omnibus `rides_patch_ride_request`/`..._cas` RPC has no column allow-list — it can set fare, PIN, and driver assignment via one JSONB blob. Safe only because it's `service_role`-only today.

### CLEANUP & performance

`rides_ride_requests` and `rides_dispatch_settings` are dropped and recreated fresh in nearly every migration in this batch, hand-copying the grant list from memory each time — that's exactly how `anon` got added to `rides_driver_locations` and had to be walked back five days later.

### SOLID — What's actually solid

- `ride_messages` is the one table in this batch that gets it right end-to-end: policy applied directly on the queried table, participant-scoped, writes service-role only.
- The base-table RLS on `driver_locations` and `ride_requests` is itself well-designed — the security failure is entirely in the unfiltered views layered on top.

---

## G6 — Passenger social: contacts, connections, trip intents, saved places

20 migrations. The most privacy-sensitive batch: home/work addresses, live-location sharing, phone numbers, social graph. Contains the single worst finding in the audit.

### CRITICAL

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

### HIGH PRIORITY

- `fix_targeted_trip_intent_audience.sql` is a data backfill, not a policy fix — "targeted" vs. "open" audience has zero database-level enforcement today, because the table it governs has no RLS at all.
- The `rides_create_ride_request` RPC trusts caller-supplied `rider_contact_id`/`rider_user_id` with no ownership check — safe today only because it's `service_role`-only.

### SOLID — What's actually solid

- `passenger_saved_places` (home/work addresses) gets RLS exactly right: matching `USING`/`WITH CHECK` on the owner, plus partial unique indexes preventing duplicate Home/Work rows.
- `rider_contacts`/`rider_contact_groups`/`rider_contact_places` form a clean, non-recursive ownership chain.
- The final state of `ride_messages` correctly folds in delegated bookers and grants no client-side `INSERT` at all.

---

## G7 — Cash settlement, wallets, ledger core

16 migrations. Real money: driver cash-collection wallets, settlement disputes, admin overrides, the unified ledger.

### CRITICAL

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

### HIGH PRIORITY

`rides.cash_settlement_disputes`, `rides.admin_settlement_overrides`, and `rides.payment_obligations` never got RLS enabled.

### SOLID — What's actually solid

- Every money-moving function in this batch is `SECURITY DEFINER` with a correct `REVOKE ALL FROM PUBLIC` + `service_role`-only execute grant. No client can invoke any of them directly.
- As a consequence, there is no client-writable path into settlement state at all.
- `ledger_scoped_views.sql` is the correct pattern the broken views above should have used — every one of its four views explicitly declares `security_invoker = true`.

---

## G8 — Toll/fuel brain, platform RBAC, enterprise inventory, haulage

18 migrations. Includes `platform_rbac_schema.sql` — the single highest-leverage file in the whole audit, since every other table's admin check ultimately traces back to it.

### CRITICAL

**Two inventory-ledger RPCs are callable by a fully unauthenticated caller.** (`enterprise_inventory_rpcs.sql:3-157`.) `inventory_append_entry_tx` and `receive_purchase_order_tx` have no explicit `GRANT`/`REVOKE`, so they auto-inherit `EXECUTE` from an early blanket `ALTER DEFAULT PRIVILEGES ... TO anon, authenticated` on the whole `delivery` schema. Neither function checks the caller. Only stopped today because the tables they write to have RLS enabled with zero policies — an accident, not a designed control.
```sql
REVOKE EXECUTE ON FUNCTION delivery.inventory_append_entry_tx(uuid,uuid,numeric,uuid,numeric,text,text,uuid,numeric,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION delivery.receive_purchase_order_tx(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.inventory_append_entry_tx(uuid,uuid,numeric,uuid,numeric,text,text,uuid,numeric,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.receive_purchase_order_tx(uuid,uuid,jsonb) TO service_role;
```

### HIGH PRIORITY

- `toll.brain_policies` never got RLS enabled, exposed via a `public.toll_brain_policies` view granted to `authenticated` — every row visible platform-wide. The sibling `fuel.brain_policies` table got this exactly right.
```sql
ALTER TABLE toll.brain_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY toll_brain_policies_service ON toll.brain_policies
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
- `public.toll_settlement_allocations` — a financial table — never got RLS enabled either, safe today only because no client-facing grant exists yet.
- Enterprise inventory has RLS enabled on all 22 tables but a policy defined for only one (`inventory_nodes`) — tenant isolation is effectively unimplemented at the database layer for this feature.

### CLEANUP & performance

```sql
DROP INDEX IF EXISTS platform.idx_user_roles_user_id;
-- redundant: platform.user_roles' own UNIQUE (user_id, role_id) constraint already covers this
```

### SOLID — What's actually solid

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

# Supabase Security Advisor Audit — GoRide

**Project:** GoRide (`csfllzzastacofsvcdsc`, us-east-1, Postgres 17.6.1.054)
**Date:** 2026-08-27
**Scope:** Security advisor findings only. **No code or database changes were made.**
**Method:** Pulled the raw advisor lint set via the Supabase API (259 lints), then verified each
class of finding directly against the live database with read-only SQL — including role-switched
(`SET LOCAL ROLE anon`) reads inside a rolled-back transaction to confirm real reachability.

---

## 1. Executive summary

The dashboard shows **52 errors / 165 warnings / 48 info**. That headline is misleading in both
directions: some of the "errors" are already-known cosmetic noise, and some of the *warnings* are
the most serious problems in the project.

Verified exposure, ranked:

| # | Finding | Advisor level | Real severity | Reachable by |
|---|---------|---------------|---------------|--------------|
| 1 | 44 unguarded `SECURITY DEFINER` RPCs in `public` granted to `anon` | WARN | **Critical** | Unauthenticated internet |
| 2 | 46 `public` views owned by `postgres` bypassing RLS | ERROR | **Critical** | Unauthenticated internet |
| 3 | `platform.identities` / `pending_invites` / `identity_communication_log` — RLS off | ERROR | **High** | Any logged-in user |
| 4 | `delivery.order_idempotency_keys` — RLS off, anon SELECT + INSERT | ERROR | **High** | Unauthenticated internet |
| 5 | 13 functions with mutable `search_path` | WARN | Medium | Depends on caller |
| 6 | Leaked-password protection disabled | WARN | Medium | Auth config |
| 7 | `pg_trgm` installed in `public` | WARN | Low | — |
| 8 | 48 tables with RLS enabled but no policies | INFO | **Mostly fine** | — |

**The key structural fact driving items 1–4:** the PostgREST `authenticator` role exposes these
schemas over the REST API:

```
public, graphql_public, delivery, payments, rides, freight, logistics, platform
```

`ledger`, `toll`, `fleet`, `matching`, and `enterprise` are **not** exposed — so raw tables in
those schemas are unreachable. But `public` views and `public` RPCs that *read and write* those
schemas **are** exposed, and that is exactly where the holes are.

Second key fact: in Supabase the `postgres` role has **`BYPASSRLS = true`**. Anything owned by
`postgres` that runs as its owner — a view without `security_invoker`, a `SECURITY DEFINER`
function — sees every row in the database regardless of RLS.

---

## 2. Finding 1 — 44 unguarded `SECURITY DEFINER` RPCs callable by `anon`

**Advisor lints:** `anon_security_definer_function_executable` (72) +
`authenticated_security_definer_function_executable` (72). Shown as *warnings*.

**This is the most serious item in the audit.** 72 `SECURITY DEFINER` functions have an
**explicit** `GRANT EXECUTE ... TO anon` (verified in `pg_proc.proacl` — this was not a default,
someone granted it). Of those, **44 in the `public` schema contain no authorization check at all**
— no `auth.uid()`, no `auth.role()`, no RBAC helper call. Because they run as `postgres`
(BYPASSRLS), the caller inherits full database authority for the duration of the call.

`public` is exposed to PostgREST, so each one is a live endpoint at
`POST /rest/v1/rpc/<name>` reachable with only the publishable anon key.

Unguarded, anon-callable, in `public`:

**Ledger / money (highest risk — these write or destroy financial records):**
```
ledger_post_entry                       ledger_delete_entries
ledger_post_financial_event             ledger_delete_source_receipts
ledger_reverse_entry                    ledger_backfill_kv_ledger_event_batch
ledger_reconcile_amounts                ledger_backfill_rides_payment_journal_batch
ledger_reconcile_islands                ledger_count_entries_by_batch
ledger_soak_status                      rides_post_payment_journal_line
toll_settlement_apply                   toll_settlement_reverse
rides_apply_pending_driver_debt
```

**Rides / dispatch (state mutation on live operational data):**
```
rides_create_ride_request               rides_patch_ride_request
rides_cancel_ride_request               rides_insert_driver_offer
rides_insert_location_update            rides_patch_driver_offer
rides_upsert_driver_presence            rides_supersede_pending_offers
rides_upsert_surge_cell                 rides_expire_pending_offers
rides_read_surge_multiplier             rides_expire_all_pending_offers
rides_rider_has_active_ride             rides_expire_driver_pending_offers
rides_dispatch_due_scheduled_rides      rides_cancel_stale_matching_rides
rides_run_cash_settlement_timeout       rides_run_matching_hygiene
rides_fare_rules_instead_delete         rides_vehicle_types_instead_delete
matching_accept_driver_offer            logistics_accept_job_offer
```

**Other:**
```
edge_insert_vehicle_catalog_row         auto_create_organization_for_fleet_owner
accrue_storage_days                     purge_order_messages_retention
rbac_user_has_product_access            rbac_user_max_role_level
rbac_user_permission_keys
```

Worked example — `public.ledger_delete_entries(text, text[], text, date, text)`:
`prosecdef = true`, `search_path = ledger, public`, explicit anon grant, and the body opens
straight into `SELECT array_agg(e.id) FROM ledger.entries WHERE ...` followed by deletes. There is
no caller check anywhere before the delete. The `ledger` schema is not REST-exposed, but this
function is the bridge that makes it writable from the open internet.

Also in this bucket: 11 unguarded `platform.*` functions including `is_platform_user`,
`user_has_permission`, `user_max_role_level`, `user_permission_keys`, `upsert_identity_for_user`,
and `reconcile_identities`. `platform` is REST-exposed, so an anonymous caller can probe the RBAC
oracle and, via `upsert_identity_for_user`, potentially write into the identity table.

Nine of the granted functions are `trg_*` **trigger** functions. Trigger functions never need an
`EXECUTE` grant — Postgres invokes them as part of the triggering statement. Those grants are pure
attack surface with zero benefit.

### What I recommend

These RPCs read like they were written to be called by edge functions. Edge functions using the
**service role key** do not need any grant to `anon` or `authenticated` — the service role bypasses
grants and RLS on its own. The grants are almost certainly leftover from debugging with the anon
key, or from a blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated`.

1. **Confirm the caller for each function first.** Grep the edge functions and the app clients for
   `rpc('<name>'` before revoking anything. Anything called from `apps/dash-*` or the mobile
   clients with the anon key genuinely needs a grant — but then it needs an internal auth check
   too, not just the grant.
2. **Revoke first, restore narrowly.** The safe shape is
   `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated;` and then re-grant only to
   `authenticated` for the handful the clients genuinely call.
3. **The ledger and toll functions should almost certainly be service-role-only.** No client should
   be able to post, reverse, or delete a ledger entry directly. Same for the `*_backfill_*`,
   `*_reconcile_*`, and `purge_*` maintenance functions.
4. **For any function that must stay client-callable, add a guard at the top of the body** —
   `auth.uid()` non-null plus the relevant `rbac_*` / `platform.user_has_permission` check — rather
   than relying on the grant alone.
5. **Revoke the 9 `trg_*` grants unconditionally.** Zero risk of breaking anything.

> ⚠️ Note in passing, outside advisor scope: because these run as `postgres`, this also means
> the ledger — 1,249 `financial_events` rows — has a write path that bypasses every application-level
> money rule. That is worth cross-referencing against
> [FINANCIAL_INTEGRITY_AUDIT.md](FINANCIAL_INTEGRITY_AUDIT.md).

---

## 3. Finding 2 — 46 `public` views bypass RLS (the 48 red "Security Definer View" errors)

**Advisor lint:** `security_definer_view` — 48 ERRORs. This is the block filling your screenshot.

The name is confusing: it does not mean the views were declared `SECURITY DEFINER`. It means they
were created *without* `security_invoker = true`, so they run as their owner. Every one of these is
owned by `postgres`, which has `BYPASSRLS`. RLS on the underlying `fleet.*`, `ledger.*`, `rides.*`
tables is therefore not applied when data is read through the view.

`anon` and `authenticated` hold `SELECT` on all of them, and `public` is REST-exposed.

**Verified live, as the `anon` role, in a rolled-back transaction:**

| View | Rows readable by `anon` |
|------|------------------------|
| `public.financial_events` | **1,249** |
| `public.fleet_toll_ledger` | 262 |
| `public.driver_financial_periods` | 34 |
| `public.fleet_drivers` | 3 |

This is not theoretical. Anyone holding the publishable anon key — which ships in every web and
mobile client — can `GET /rest/v1/financial_events?select=*` and read the financial event stream.

**Good news:** 60 of the 106 views in `public` **already** have `security_invoker = true`. Someone
has been working through this list. 46 remain.

The remaining 46 (plus `platform.merchant_staff_role_aliases` and `platform.identity_personas`):

```
financial_events                driver_financial_periods        driver_financial_period_lines
rides_dispatch_settings         enterprise_rideshare_orgs_audit
fleet_drivers                   fleet_vehicles                  fleet_driver_metrics
fleet_vehicle_metrics           fleet_trips                     fleet_import_batches
fleet_import_metadata           fleet_import_insights           fleet_payment_ledger_lines
fleet_driver_period_snapshots   fleet_toll_ledger               fleet_toll_tags
fleet_toll_plazas               fleet_fuel_cards                fleet_stations
fleet_fuel_adjustments          fleet_fuel_entries              fleet_fuel_disputes
fleet_expense_documents         fleet_expense_payments          fleet_transactions
fleet_fixed_expenses            fleet_expense_rule_groups       fleet_expense_rule_assignments
fleet_expense_journal           fleet_bank_statements           fleet_bank_confirmations
fleet_platform_vendors          fleet_expense_categories        fleet_claims
fleet_earnings_policies         fleet_equipment                 fleet_inventory
fleet_odometer_readings         fleet_organization_settings     fleet_checkins
fleet_preferences               fleet_integrations              fleet_ledger_config
fleet_maintenance_logs          fleet_dual_write_metrics
platform.merchant_staff_role_aliases                            platform.identity_personas
```

### What I recommend

1. **Set `security_invoker = true` on all 46**, matching what was already done for the other 60:
   `ALTER VIEW public.<name> SET (security_invoker = true);` — this is a metadata-only change, no
   rewrite, no downtime.
2. **This is the step that will break things, so do it in batches and test.** Once the view runs as
   the caller, RLS on the underlying `fleet.*` table applies. If that table has RLS enabled with no
   policy for the calling role, the view starts returning **zero rows** — silently. Flip a small
   batch, exercise the fleet dashboard, then continue.
3. **Check the underlying policies before flipping, not after.** For each view's base tables,
   confirm a policy exists that grants the intended role the intended rows. Where the consumer is
   an edge function on the service role, nothing changes (service role bypasses RLS anyway) — those
   are safe to flip immediately.
4. **Consider whether `anon` needs `SELECT` on any of these at all.** For finance and fleet views,
   almost certainly not: `REVOKE SELECT ON public.<view> FROM anon;` is a second, independent layer
   worth adding regardless of the invoker flag.

---

## 4. Finding 3 — `platform` tables with RLS disabled (PII exposure to any logged-in user)

**Advisor lint:** `rls_disabled_in_public` — ERROR.

Three tables in the REST-exposed `platform` schema have **RLS switched off entirely** and grant
`SELECT` to `authenticated`:

| Table | Columns |
|-------|---------|
| `platform.identities` | `user_id, primary_email, primary_phone, display_name, global_status, status_reason, status_changed_at, status_changed_by, risk_score, mfa_enrolled, created_at, updated_at, last_active_at` |
| `platform.pending_invites` | `id, email, role_id, invited_by, scope_type, scope_id, expires_at, accepted_at, revoked_at, created_at, accepted_user_id, revoked_by` |
| `platform.identity_communication_log` | `id, user_id, channel, template_key, subject, body_preview, sent_at, metadata` |

`anon` does **not** have access — that limits the blast radius. But **any** authenticated user
(a customer who signed up thirty seconds ago, a courier, a merchant staffer) can
`GET /rest/v1/identities?select=*` and pull the entire platform identity directory: every user's
email, phone, MFA enrolment status, and internal risk score. `identity_communication_log` leaks
message subjects and body previews. `pending_invites` leaks who is being invited to which
privileged role and scope, before they accept.

This is the finding most likely to matter under a privacy/GDPR-style lens: it is a bulk PII read by
low-privilege users, not just an internal misconfiguration.

### What I recommend

1. `ALTER TABLE platform.<name> ENABLE ROW LEVEL SECURITY;` on all three.
2. **Add the policies in the same migration as the enable**, not after — enabling RLS with no policy
   denies all reads, which will break anything currently relying on the open read.
3. Suggested policy shape: on `identities`, a self-read policy (`user_id = auth.uid()`) plus a staff
   policy using the existing `platform.current_user_is_platform_staff()` helper. `pending_invites`
   and `identity_communication_log` should be staff-only, or scoped to the invite's own
   `scope_id` for org admins.
4. Audit what currently reads these tables first — the edge functions almost certainly use the
   service role and will be unaffected, but check the admin dashboard client.

---

## 5. Finding 4 — `delivery.order_idempotency_keys` writable by `anon`

**Advisor lint:** `rls_disabled_in_public` — ERROR.

RLS is off, `delivery` is REST-exposed, and `anon` has **both `SELECT` and `INSERT`**. Verified: as
`anon`, `SELECT count(*)` returns 22 rows.

The read side is minor. The **write** side is not: idempotency keys are the mechanism that stops an
order from being processed twice. An anonymous caller who can insert arbitrary keys can potentially
pre-poison the table so that a legitimate order request is treated as a duplicate and silently
dropped — or, depending on how the key is derived and checked, replay one.

### What I recommend

1. Enable RLS on the table. Almost nothing legitimate should touch it from a client — this is
   service-role-only infrastructure. Enabling RLS with **no** policy is the correct end state here.
2. Independently, `REVOKE INSERT, SELECT ON delivery.order_idempotency_keys FROM anon, authenticated;`
3. Confirm the order-creation path in `supabase/functions/delivery/` writes this table with the
   service role (it almost certainly does) before applying.

---

## 6. Finding 5 — 13 functions with mutable `search_path`

**Advisor lint:** `function_search_path_mutable` — WARN.

```
matching.update_updated_at              freight.sync_package_owner_org
delivery.sync_merchant_active_status    public.update_updated_at_column
ledger._infer_account_meta              delivery.inventory_append_entry_tx
delivery.receive_purchase_order_tx      rides.audit_offer_accepted
delivery.refresh_inventory_balance      public.toll_settlement_active_credits
delivery.deny_ledger_mutation           delivery.inventory_variance_report
fleet.set_updated_at
```

A function without a pinned `search_path` resolves unqualified object names using the *caller's*
search path. Combined with `SECURITY DEFINER`, this is the classic Postgres privilege-escalation
vector: an attacker who can create objects in a schema earlier on the path can shadow a table or
function the definer function calls.

Severity here is genuinely medium, not critical — exploiting it requires the ability to create
objects in a reachable schema, which `anon` and `authenticated` should not have. Worth confirming
`CREATE` on `public` is revoked from `PUBLIC`.

Note `delivery.deny_ledger_mutation` on that list — a guard function that can be search-path
shadowed is a guard worth pinning first.

### What I recommend

`ALTER FUNCTION <name>(<args>) SET search_path = <schemas it needs>, pg_temp;` — always ending with
`pg_temp` so temp objects cannot shadow. Low risk, mechanical, and it clears 13 warnings.

---

## 7. Finding 6 — Leaked-password protection disabled

**Advisor lint:** `auth_leaked_password_protection` — WARN.

Supabase can check new passwords against HaveIBeenPwned's breach corpus and reject known-compromised
ones. It is currently off.

**Recommendation:** turn it on in Dashboard → Authentication → Policies. It is a settings toggle, no
migration, no code change, and it does not affect existing sessions. For a platform holding driver
earnings and payment methods, this should be on. While you're there, consider raising the minimum
password length and requiring MFA for the platform-staff roles.

---

## 8. Finding 7 — `pg_trgm` installed in `public`

**Advisor lint:** `extension_in_public` — WARN. Low priority.

**Recommendation:** `CREATE SCHEMA IF NOT EXISTS extensions; ALTER EXTENSION pg_trgm SET SCHEMA extensions;`
— but only alongside a check of everything using `%`, `similarity()`, or `gin_trgm_ops`, since the
operators move with it. Honestly, this one is fine to defer. It is hygiene, not exposure.

---

## 9. Finding 8 — 48 "RLS enabled, no policy" (the INFO block) — mostly *not* a problem

**Advisor lint:** `rls_enabled_no_policy` — INFO.

RLS enabled with zero policies means **deny everything** to non-bypass roles. That is the *safe*
state, and for most of this list it is intentional. Broken into three groups:

**Group A — not REST-exposed at all, so entirely inert (26 tables).** The `ledger.*` and `toll.*`
schemas are absent from the `pgrst.db_schemas` list. Nothing here is reachable over the API. This
includes all the dated backup tables — `ledger.entries_cleanup_backup_20260818`,
`ledger.kv_money_backup_20260811`, `ledger.driver_financial_periods_backup_20260818`, etc.

> Separate housekeeping observation: there are **7 dated backup tables** from the August 2026
> ledger cleanup still sitting in the database. Not a security issue, but they carry real financial
> data and are worth a retention decision. See [LEDGER_RETIREMENT_AUDIT.md](LEDGER_RETIREMENT_AUDIT.md).

**Group B — REST-exposed, locked down, and that's correct.** `delivery.admin_audit_events`,
`delivery.pricing_change_log`, `delivery.courier_cash_balances`, `rides.admin_settlement_overrides`,
`rides.payment_obligations`, `rides.rider_admin_notes`, and similar. These are service-role/admin
surfaces; denying all client access is the intent. **No action needed.**

**Group C — worth a second look.** A handful may have been *meant* to be client-readable and are
silently returning nothing:

- `delivery.service_markets`, `delivery.service_parishes`, `delivery.service_zone_polygons`,
  `delivery.parish_outline_templates`, `delivery.town_outline_templates` — coverage/geo reference
  data. If the customer app is meant to render service areas, it can't read these directly today.
- `delivery.zone_waitlist`, `delivery.support_cases`, `delivery.review_votes` — user-facing features
  where a self-scoped policy (`user_id = auth.uid()`) is likely what was intended.
- `rides.haulage_bookings` / `rides.haulage_booking_lines` — customer-owned records with no policy.
- `public.kv_store_37f42386` — locked, which is right for a KV store.

**Recommendation:** treat Group C as a *functionality* review, not a security one. For each, decide
whether the app reads it via edge function (fine as-is — leave it) or directly with the anon key
(needs a policy). Do not blanket-add policies to clear the INFO count; a table that denies all
access is safer than one with a hastily written permissive policy.

---

## 10. Suggested order of work

Nothing below has been applied. Each step is independently deployable.

| Step | Action | Risk of breaking things | Clears |
|------|--------|------------------------|--------|
| 1 | Enable leaked-password protection (dashboard toggle) | None | 1 WARN |
| 2 | Revoke `EXECUTE` from `anon`/`authenticated` on the 9 `trg_*` functions | None | 18 WARN |
| 3 | Enable RLS on `delivery.order_idempotency_keys`, revoke anon grants | Low — verify service-role write path | 1 ERROR |
| 4 | Pin `search_path` on the 13 functions | Low | 13 WARN |
| 5 | **Audit + revoke the ledger/toll/maintenance RPC grants** | Medium — grep callers first | ~30 WARN |
| 6 | Enable RLS + policies on the 3 `platform` tables | Medium — needs policies in the same migration | 3 ERROR |
| 7 | `security_invoker = true` on the 46 views, in batches | **Highest** — silently empties views lacking base policies | 48 ERROR |
| 8 | Audit remaining RPC grants; add in-body auth guards | Medium | ~100 WARN |
| 9 | Move `pg_trgm` out of `public` | Low | 1 WARN |
| 10 | Review Group C tables for intended-but-missing policies | Functionality review | 0 (INFO) |

**If you only do two things:** step 5 and step 7. Those are the two that are currently readable and
writable from the open internet with a key that ships in your client bundles.

**Deployment note:** apply all of these as versioned migrations under `supabase/migrations/`, not
via the dashboard SQL editor, so local and preview branches stay in sync. Re-run
**Advisors → Rerun linter** after each step to confirm the count drops as expected.

---

## 11. Verification notes

- Advisor data pulled from the live project API on 2026-08-27 — 259 lints total, all read.
- Exposed-schema list read from `pg_db_role_setting` for the `authenticator` role.
- `pg_roles` confirms `postgres` and `service_role` have `BYPASSRLS`; `anon` and `authenticated`
  do not.
- View owner/grant/`reloptions` state read from `pg_class` and `has_table_privilege`.
- Function `SECURITY DEFINER` status, ACLs, `proconfig`, and body guard checks read from `pg_proc`.
- Anon reachability confirmed by `SET LOCAL ROLE anon` inside a transaction that was **rolled
  back**. No data was read outside of row counts, and nothing was written.
- All advisor counts in this document are from the API payload, which reports
  48 INFO + 52 ERROR + 159 WARN across the categories listed. The dashboard's "165 warnings"
  includes a few auth-config lints not present in the database lint set.

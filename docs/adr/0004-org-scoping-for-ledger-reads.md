# ADR 0004: Org-Scoping Mechanism for Ledger Reads

**Status:** Accepted — owner sign-off 2026-07-06 (aligned with Phase 5 schema design)

## Context

Two incompatible org-scoping mechanisms exist in the codebase today:

- **KV-era application-code filtering** (`filterByOrg` / `filterByOrgStrict` /
  `filterByOrgSafe` in `apps/fleet/src/supabase/functions/server/org_scope.ts`), gating
  fleet/driver/Dominion-via-`@fleet`-alias reads, behind three default-OFF flags.
- **Postgres RLS**, gating the newer `rides`/`payments`/`public.organizations` schemas via
  `auth.uid()`/`auth.jwt()` checks.

These do not talk to each other. Separately: `apps/admin/src/services/api.ts` (Roam
Dominion) currently authenticates the *majority* of its financial/ledger/toll calls with
the **anon key**, not a session JWT — which, combined with `rbac_middleware.ts`'s
anon-passthrough fallback (defaults to a synthetic `fleet_owner` with `organizationId:
null`), means Dominion's existing financial reads already effectively bypass org scoping
today unless an org has opted into `strict_auth`/`strict_org_filter`. This is a pre-existing
gap independent of the ledger project, worth tracking as its own follow-up regardless of
which option below is chosen.

`ledger.accounts` (Phase 6) has a new `organization_id` column, making real Postgres RLS
the natural mechanism for the new schema — but querying it the same way Dominion queries
everything else today (anon key, no real JWT) would either see nothing (if RLS requires a
real `auth.uid()`) or require re-adding application-level scoping in the Edge Function
layer anyway.

## Options

- **Option 1 — Real RLS end-to-end.** Fix Dominion's anon-key usage for ledger calls first
  (a valuable, separable fix), then real Postgres RLS on `organization_id` enforces scoping
  consistently for every portal, including Dominion (mapped to a "see all orgs" claim).
- **Option 2 — Service-role + application-level scoping (mirrors today's pattern).** All
  ledger reads via `service_role`; one new, strict scoping function (modeled on
  `filterByOrgStrict`'s semantics — no legacy permissive fallback) applied per non-Dominion
  portal in the Edge Function layer; Dominion explicitly bypasses it by design.

**Recommendation:** Option 1 is architecturally cleaner and matches where the newer parts
of the codebase are already headed. Option 2 is lower-risk/faster given the anon-key issue
may be a larger pre-existing gap outside this project's immediate scope. Either way, log
the Dominion anon-key gap as its own tracked follow-up.

## Decision

**Option 1 — Real RLS end-to-end.** Owner approved 2026-07-06.

Dominion anon-key fix is a tracked prerequisite before Phase 13 portal views go live; Phase 6
ships RLS policies on `ledger.*` tables per [ADR 0005](./0005-unified-ledger-schema.md).

## Consequences

- Phase 6 migration includes `organization_id` + RLS on `ledger.accounts` and `ledger.entries`.
- Phase 13 adds scoped views with `security_invoker` per [ADR 0003](./0003-definer-vs-invoker-views.md).
- Dominion financial API calls must move from anon key to session JWT before RLS-enforced reads.

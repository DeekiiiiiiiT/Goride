# Performance / Indexes Audit — Roam / GoRide

*Audited 2026-07-18 via Supabase performance advisors + RLS audit cleanup list.*

## Summary

Advisors report ~261 WARN items, dominated by unindexed foreign keys. This wave ships the highest-leverage indexes called out by the RLS audit (hot path filters).

## Indexes added

| Index | Table | Why |
|-------|-------|-----|
| `idx_merchant_team_members_user_id` | `delivery.merchant_team_members` | Nearly every merchant-portal RLS subquery |
| `idx_organizations_owner_id` | `public.organizations` | Org-owner financial policies |
| `idx_fin_events_org` | `ledger.financial_events` | Org-scoped financial SELECT |
| `idx_fin_alloc_org` | `ledger.financial_allocations` | Same |

## Deferred

Bulk unindexed-FK advisor list — track as ongoing hygiene; not all FKs need indexes if rarely joined.

## Status

**Done** for priority indexes (`20260806120000`).

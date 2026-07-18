# Database Schema Audit — Roam / GoRide

*Audited 2026-07-18 via Supabase advisors + targeted SQL on `csfllzzastacofsvcdsc`.*

## Summary

Schema is large (multi-product). Critical integrity holes from advisors that are still actionable after RLS Waves 0–6:

## Findings

| Finding | Severity | Status |
|---------|----------|--------|
| `public.kv_store_37f42386_toll_date_backup` exposed without RLS | Critical | **Fixed** — ENABLE RLS |
| Security-definer views: `matching_policies`, `matching_product_profiles`, `fuel_product_profiles` (+ fuel siblings) | Critical | **Fixed** — `security_invoker=true` |
| Many tables with RLS on but zero policies | Medium | Default-deny (safe); add participant policies only when product needs client read |
| Cosmetic missing FKs / NOT NULL | Low | Deferred |

## Remediation status

Applied in `20260806120000_audit_waves_8_10_followups.sql` (via `supabase db push`).

## Verification

- Advisors ERROR count for those views/tables drops after reload.
- Matching/fuel client reads still work for intended roles.

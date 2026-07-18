# Triggers & Realtime Audit — Roam / GoRide

*Audited 2026-07-18 on production `csfllzzastacofsvcdsc`.*

## Realtime publication (`supabase_realtime`)

Currently published:

| Schema | Table | Risk |
|--------|-------|------|
| `delivery` | `orders` | OK if RLS scopes merchant/customer |
| `delivery` | `merchant_notifications` | OK if owner-scoped |
| `public` | `ride_messages` | OK if participant RLS |
| `rides` | `ride_requests` | OK — participant RLS (post Wave 1 invoker on views) |
| `rides` | `driver_offers` | OK if driver-scoped |

No sensitive wallet/ledger tables are published. **No changes required.**

## Triggers

- Widespread `updated_at` triggers on domain tables — expected.
- Prefer `SECURITY DEFINER` helpers with pinned `search_path` (platform RBAC already follows this).
- No trigger found that writes using caller-supplied role from `raw_user_meta_data` after Wave 0 org fix.

## Findings

| Finding | Severity | Status |
|---------|----------|--------|
| Realtime surface limited to ops/messaging tables | OK | Keep |
| Do not add ledger/financial tables to realtime | Policy | Documented |

## Status

**Done** — no DDL required beyond documentation.

# Triggers & Realtime Audit — Roam / GoRide

*Audited 2026-07-18 (PDF deep pass). Production `csfllzzastacofsvcdsc`.*

## Executive summary

Realtime subscriptions and RLS filtering are solid (no town-crier broadcasts). Critical issues were elsewhere:

1. **Org auto-provision trigger** trusted client-writable `raw_user_meta_data` — anon `signUp()` could mint an organization.
2. **`verification_pin` on `rides.ride_requests`** was included in Realtime `REPLICA IDENTITY FULL` payloads to drivers, defeating PIN handoff.

## Realtime publication (`supabase_realtime`)

| Schema | Table | Notes |
|--------|-------|-------|
| `delivery` | `orders` | Participant RLS |
| `delivery` | `merchant_notifications` | Owner-scoped |
| `public` | `ride_messages` | Participant RLS |
| `rides` | `ride_requests` | Participant RLS — **PIN removed from this table** |
| `rides` | `driver_offers` | Driver-scoped |

No ledger/wallet tables published. Do not add them.

### Ops: publication membership (read-only)

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY 1, 2;
```

### Ops: replication slot lag (read-only)

```sql
SELECT
  slot_name,
  plugin,
  active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS restart_lag,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS flush_lag
FROM pg_replication_slots
ORDER BY pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) DESC;
```

---

## Remediation status (2026-07-18)

Migrations: `20260718240000`–`20260718240300`.

| Wave | Fix |
|------|-----|
| 0 | `auto_create_organization_for_fleet_owner()` trusts **app_metadata only**; writes `organizationId` to app_metadata; Fleet `createUser` sites put role/org in `app_metadata` |
| 1 | `rides.ride_pins` table + rider-only RLS; 169 pins backfilled; column dropped from `ride_requests`; Edge + RPCs write/read pins via `ride_pins`; driver `normalizeDriverRide` already strips PIN |
| 2 | `audit_offer_accepted` soft-fails on log insert; `ride_live_state` gets `updated_at` BEFORE UPDATE trigger; comment on `driver_offers` (no updated_at by design) |

### Deferred

Unifying three identical `set_updated_at` clones across schemas (cosmetic).

---

## Status

**Remediated** — critical trigger + Realtime PIN leak closed. Commits gated until requested.

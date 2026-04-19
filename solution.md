# Pending vehicle catalog — solution specification

**Product intent:** Customers always complete "Add vehicle" (fleet asset in KV). The platform motor catalog (`vehicle_catalog`) grows over time. When a customer's make/model/year does not match an existing catalog row, a **pending request** is queued for super-admin review. Admins approve into `vehicle_catalog` and link the fleet vehicle; maintenance schedules can then bootstrap from catalog templates.

**Glossary**

| Term | Meaning |
|------|--------|
| Fleet vehicle | Operational record in KV (`vehicle:{id}`); includes `organizationId`, docs, metrics. |
| Motor catalog row | `public.vehicle_catalog` — platform-wide specs + anchor for maintenance templates. |
| Pending request | `public.vehicle_catalog_pending_requests` — proposed catalog entry until approved/rejected/superseded. |

---

## Phase checklist

| Phase | Description | Status |
|-------|--------------|--------|
| 0 | Specification (`solution.md`) | done |
| 1 | DB migration + indexes | done |
| 2 | Server: enqueue, admin APIs | done |
| 3 | Matching: `vehicle_catalog_id` on KV + resolve helper | done |
| 4 | Customer UI: types, copy | done |
| 5 | Super admin: nav + Pending UI | done |
| 6 | Post-link: maintenance bootstrap | done |
| 7 | Tests | done |
| 8 | Rollout / runbook | done |

---

## Decision log

| Decision | Choice |
|----------|--------|
| Pending table | `vehicle_catalog_pending_requests` |
| Status | `pending`, `approved`, `rejected`, `superseded` |
| Fleet ref | `fleet_vehicle_id` text (KV vehicle id; no FK) |
| Approvers | `platform_owner`, `platform_support`, `superadmin` |

---

## API sketch

- `POST /vehicles` — catalog match + pending upsert/clear.
- `GET /vehicle-catalog-matches` — fleet catalog search.
- `GET/POST /admin/vehicle-catalog-pending-requests` — list, detail, approve, approve-existing, reject.

## Rollback

Forward-fix preferred; drop new table only if empty in dev.

## Rollout (Phase 8)

1. Apply migration `20260420120000_vehicle_catalog_pending_requests.sql` on Supabase.
2. Deploy server bundle with pending routes and vehicle POST changes.
3. Smoke: fleet add unknown model → pending row → admin approve → KV `vehicle_catalog_id` + bootstrap in response.
4. Optional backfill script for legacy fleet vehicles (not shipped here).
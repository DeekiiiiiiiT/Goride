# Warehouse & Courier product model (active)

**Status:** Active — replaces the deferred Phase 2 note in `WAREHOUSE_COURIER_LINKS_DEFERRED.md`.

## Products

Roam Enterprise is one platform with **two product doors** (separate hostnames = separate PWAs). See [`ENTERPRISE_PRODUCT_DOORS.md`](./ENTERPRISE_PRODUCT_DOORS.md).

| Product | Door host | Path | Buyer | Owns |
|---------|-----------|------|-------|------|
| **Courier** | `courier.roamenterprise.co` | `/app/*` | Freight / mailbox (`freight_forwarding`) | Customers, suites, packages (goods), manifests, customs, hub, last mile, domestic |
| **Freight Forwarder** | `freight-forwarder.roamenterprise.co` | `/freight-forwarder/*` | Freight forwarder (`warehouse`) | Buildings, floor staff, physical custody while boxes sit on the floor |

They are **siblings**, not a seat split inside one company. They connect when a courier needs a receive floor.

### Smoke logins (local)

| Door | URL | Test user |
|------|-----|-----------|
| Courier | http://courier.localhost:3003/login | `freight.bootstrap+20260731232909@roamenterprise.test` (your existing password) |
| Freight Forwarder | http://freight-forwarder.localhost:3003/login | `warehouse.smoke@roamenterprise.test` — password in gitignored `docs/products/.local-warehouse-smoke-creds.txt` |

Orgs are pre-linked via `warehouse_courier_links` (active).

## Dual package ownership

Every package has two org fields:

- `owner_org_id` — courier who owns the goods (and who manifests / clears / delivers).
- `operating_warehouse_org_id` — warehouse physically holding the box (null once left floor).

Legacy `organization_id` stays in sync with `owner_org_id` during transition so existing queries keep working.

## Marketplace links (many-to-many)

Table: `freight.warehouse_courier_links`

- `warehouse_org_id` + `courier_org_id` + `status` (`invited` | `active` | `paused` | `revoked`)
- Either side may invite; the other accepts
- One warehouse may serve many couriers; one courier may pull from many warehouses
- `terms` JSONB: `free_days`, `per_day_minor`, `handling_minor`, `currency` (freight forwarder sets prices)

Visibility rule: a row is visible if the caller’s org is **owner** OR **operating warehouse**, and (for cross-org) an **active** link exists.

### Off-platform partners

`public.organizations.is_external = true` is a placeholder company with **no login**. `created_by_org_id` is the Roam customer that added them. The link is auto-`active`. Admin can convert them into a real customer (create login, keep the same org id so packages and links stay attached).

Connect UI (Courier and Freight Forwarder) has three choices: already on Roam, invite by name, not on Roam.

## Custody release

When a box leaves the floor (Receive Station **Release / hand off**, or a sealed manifest):

- `operating_warehouse_org_id` is set to null
- status becomes `handed_off` (or `manifested` if sealed)
- a `handoff` scan event and ledger line are written

## Storage billing

`freight.warehouse_storage_ledger` records `receive` (handling fee from link terms), `storage_day` (nightly `freight.accrue_storage_days()`), and `handoff`. Period close writes `freight.warehouse_storage_invoices` (`issued` / `paid_offline`). No payment gateway.

Enterprise Admin (`roamenterprise.co/admin`) Freight Forwarder tab: Customers, Buildings, Join requests, Connections, Off-platform, Storage billing, Features.

## In-house warehouses

A courier that runs its own floor gets a **self-link** where `warehouse_org_id = courier_org_id` and `status = active`. Same data model as third-party — no special case in scan/custody.

## Physical addresses

`public.intake_warehouse_catalog` is the master building list, managed in Roam Enterprise Admin (`roamenterprise.co/admin`). Freight-forwarder orgs confirm a listing or request a new one; `freight.facilities` rows point at a catalog entry.

## Security spine

Nothing cross-org ships until edge + RLS authorize via **owner OR operating warehouse (via active link)**. Manifests, customs, hub, and fulfillment stay **owner-scoped** (courier-only).

## Sequencing

Shipped: data model, links, dual custody, product shells, connect (including off-platform), handoff, storage invoices (paid offline), Enterprise Admin sync.

Optional demo seed: `supabase/scripts/seed_freight_marketplace_demo.sql`. Isolation probe: `supabase/scripts/test_external_org_isolation.sql`.

Future product depth: `docs/products/WAREHOUSE_FUTURE.md` and `docs/products/COURIER_FUTURE.md`.

# Warehouse & Courier product model (active)

**Status:** Active — replaces the deferred Phase 2 note in `WAREHOUSE_COURIER_LINKS_DEFERRED.md`.

## Products

Roam Enterprise is one platform. Under it:

| Product | Path | Buyer | Owns |
|---------|------|-------|------|
| **Courier** | `/app/*` | Freight / mailbox businesses (`business_type: freight_forwarding`) | Customers, suites, packages (goods), manifests, customs, hub, last mile, domestic |
| **Warehouse** | `/warehouse/*` | Intake warehouse businesses (`business_type: warehouse`) | Buildings, floor staff, physical custody while boxes sit on the floor |

They are **siblings**, not a seat split inside one company. They connect when a courier needs a receive floor.

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

Visibility rule: a row is visible if the caller’s org is **owner** OR **operating warehouse**, and (for cross-org) an **active** link exists.

## In-house warehouses

A courier that runs its own floor gets a **self-link** where `warehouse_org_id = courier_org_id` and `status = active`. Same data model as third-party — no special case in scan/custody.

## Physical addresses

`public.intake_warehouse_catalog` remains the Dominion master list of lease addresses. Warehouse orgs (and in-house courier orgs) create `freight.facilities` rows pointing at a catalog entry.

## Security spine

Nothing cross-org ships until edge + RLS authorize via **owner OR operating warehouse (via active link)**. Manifests, customs, hub, and fulfillment stay **owner-scoped** (courier-only).

## Sequencing

1. Data model + backfill + self-links  
2. Link APIs + scan dual-write + access helpers  
3. Warehouse product shell (standalone)  
4. Courier “Connect a warehouse”  
5. Warehouse multi-courier inbox  
6. Redundancy cleanup  
7. Per-product subscription + storage billing scaffold  
8–9. Future product depth (see `docs/products/WAREHOUSE_FUTURE.md` and `docs/products/COURIER_FUTURE.md`)

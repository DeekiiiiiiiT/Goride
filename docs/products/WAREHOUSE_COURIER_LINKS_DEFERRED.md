# Deferred: multi-org warehouse ↔ courier links

Phase 1 of the Courier/Warehouse split keeps **one `organization_id`** on packages.
Floor staff use `/warehouse`; Courier ops use `/app` on the same Enterprise org.

**When to build Phase 2:** a third-party intake warehouse (different company) must receive for your paying courier customer.

Then add:

1. `freight.warehouse_courier_links` (`warehouse_org_id`, `courier_org_id`, `status`)
2. Accept/reject UI in Warehouse app
3. Scan writes packages owned by `courier_org_id` with `operating_warehouse_org_id`

Until then: do not invent partnership tables.

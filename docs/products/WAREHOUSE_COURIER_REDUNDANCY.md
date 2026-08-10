# Redundancy cleanup notes (Warehouse / Courier split)

Completed as part of the marketplace split:

| Item | Resolution |
|------|------------|
| Duplicate receive | Courier `/app/receive` is **intake into linked warehouses**; Warehouse `/warehouse/receive` is the floor product. Same scan engine; different product chrome + partner context. |
| Facilities CRUD | Courier Setup keeps hub/branch/warehouse tabs. Warehouse product uses `warehouseOnly` buildings list. |
| Legacy aliases | Existing redirects (`miami-scan`, `manifest-builder`, `clearance`, `invoice-audit`) remain for bookmarks; no new aliases. |
| Warehouse packages list | Floor mode — no full courier pipeline dashboard; CTA = Open Receive Station. |

See `WAREHOUSE_COURIER_MODEL.md`.

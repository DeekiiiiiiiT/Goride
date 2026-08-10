# Courier product — future depth

Companion to `WAREHOUSE_COURIER_MODEL.md` and `WAREHOUSE_FUTURE.md`.

## Keep ownership clear
- International pipeline (manifests → customs → hub → last mile) stays **courier-owned**
- Warehouse only feeds packages via receive + partnership links
- Dual ownership fields: `owner_org_id` (this courier) + `operating_warehouse_org_id` (floor)

## Domestic + driver app
- Domestic Jamaica bookings and the upcoming driver app attach to the same package / shipment objects
- Marketplace, org fleet, client fleet, and 3PL assignee types remain courier-side

## Connect-a-warehouse UX polish
- Preferred warehouse per suite / client
- Health of partner link on dashboard (paused / revoked alerts)
- Autosuggest warehouses near cataloged Florida intake addresses

## Sibling verticals (platform)
Modules already reserved in `@roam/platform-settings`:
- `grocery_catalog` / `grocery_orders` / `grocery_fulfillment` — supermarket product
- Wholesale / delivery verticals reuse the same org + dual-ownership backbone where inventory sits at a partner facility

Do not nest grocery under Courier — ship as another sibling product under Roam Enterprise.

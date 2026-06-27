# Enterprise Inventory

Additive enterprise inventory for Roam Dash Partner merchants.

## Architecture

- **SSOT:** `delivery.inventory_ledger` (append-only; triggers maintain `inventory_balances`)
- **Legacy:** `ingredients` + `ingredient_stock` remain until `merchants.inventory_mode = 'enterprise'`
- **Shadow mode:** `merchants.enterprise_inventory_shadow = true` runs ledger depletion after legacy depletion for validation

## Migrations

1. `20260801120000_enterprise_inventory_foundation.sql` — schema, RLS, variance function
2. `20260802120000_enterprise_inventory_rpcs.sql` — `receive_purchase_order_tx`, `inventory_append_entry_tx`

## Operator scripts

| Script | Purpose |
|--------|---------|
| `scripts/sql/enterprise_inventory_bootstrap.sql` | Company + node per merchant; migrate ingredients → item_master |
| `scripts/sql/enterprise_inventory_backfill_ledger.sql` | Replay `stock_movements` into ledger before cutover |

## API prefix

`/delivery/merchant/enterprise-inventory/*` — see `merchantInventoryRoutes.ts`

## UI

- Flag: `enterpriseInventoryV1` in partner feature flags
- Flow: `pages/enterprise-inventory/EnterpriseInventoryFlow.tsx`
- Stitch refs: `design/stitch/enterprise-inventory/`

## Cutover checklist

1. Run bootstrap + backfill on staging
2. Enable `enterprise_inventory_shadow` for pilot merchant
3. Compare shadow ledger vs `ingredient_stock` for 1 week
4. `PATCH /merchant/enterprise-inventory/settings` with `inventoryMode: enterprise`
5. Legacy POS depletion skipped automatically when `inventory_mode = enterprise`

## Deprecated (post-cutover)

- `decrementStockForOrder` direct path (kept for `legacy` mode)
- `ingredient_stock` writes
- Restaurant Management inventory screens (superseded by Enterprise Inventory hub)

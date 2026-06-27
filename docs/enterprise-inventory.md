# Enterprise Inventory

Enterprise inventory for Roam Dash Partner merchants with Restaurant Management enabled.

## Architecture

- **SSOT:** `delivery.inventory_ledger` (append-only; triggers maintain `inventory_balances`)
- **Hierarchy:** `inventory_companies` → `regions` → `groups` → `nodes` (storefront linked to `merchants`)
- **Item master:** `item_master` + `uom_definitions` + `uom_conversions`
- **POS depletion:** `depleteForPosSale` writes ledger entries when `merchants.inventory_mode = 'enterprise'`
- **Legacy tables** (`ingredients`, `ingredient_stock`, `menu_item_recipes`) remain in DB for historical data only — no partner UI or REST routes

## Enablement

| Control | Where | Effect |
|---------|-------|--------|
| Restaurant Management | Roam Dash Admin Portal → merchant → **Enable Restaurant Management** | Adds `in_store_operations` capability; sets `inventory_mode = enterprise` |
| Partner UI | Account → Restaurant Management → module picker → **Inventory** | `EnterpriseInventoryFlow` (live API when capability on) |

Merchants cannot self-enable. `POST /merchant/capabilities/enable` returns 403.

## Migrations

1. `20260801120000_enterprise_inventory_foundation.sql` — schema, RLS, variance function
2. `20260802120000_enterprise_inventory_rpcs.sql` — `receive_purchase_order_tx`, `inventory_append_entry_tx`

## Operator scripts

| Script | Purpose |
|--------|---------|
| `scripts/sql/enterprise_inventory_bootstrap.sql` | Company + node per merchant; migrate legacy ingredients → `item_master` |
| `scripts/sql/enterprise_inventory_backfill_ledger.sql` | Replay `stock_movements` into ledger (one-time migration aid) |

Run migrations first, then bootstrap.

## API

Prefix: `/delivery/merchant/enterprise-inventory/*` — see `merchantInventoryRoutes.ts`

Key surfaces: nodes, hub KPIs, item master, vendors/POs/receiving, transfers, physical counts, recipes v2, variance report, ledger audit.

## UI

- Flow: `apps/dash-merchant/src/pages/enterprise-inventory/EnterpriseInventoryFlow.tsx`
- Components: `apps/dash-merchant/src/components/enterprise-inventory/`
- Design briefs: `apps/dash-merchant/design/stitch/enterprise-inventory/`

## Restaurant Management navigation

```
Account / Operations Hub
  └─ Restaurant Management (module picker)
       ├─ POS Register (hidden when venueOpsV2 — tablet only)
       ├─ Inventory → Enterprise Inventory hub
       ├─ Reports → in-store sales
       └─ Store settings → printer / receipts
```

# Enterprise Inventory — Flow Map

How owners manage multi-location stock, receiving, counts, and variance in the Roam Dash Partner app.

## Owner swimlane

```
Account / Operations Hub
  └─ Restaurant Management (requires admin enable)
       └─ Module picker
            ├─ POS Register (tablet when venueOpsV2)
            ├─ Inventory
            │    ├─ Hub — location picker, KPIs, quick actions
            │    ├─ Item Master — SKU, UOM chain, zones
            │    ├─ Vendors & Catalog — pack sizes, contract pricing
            │    ├─ Purchase Orders → Receiving → variance log
            │    ├─ Transfers — commissary ↔ storefront
            │    ├─ Physical Counts — blind count (mobile) → manager post
            │    ├─ Recipes v2 — yield % per ingredient
            │    ├─ Variance Report — theoretical vs actual $
            │    ├─ Location hierarchy — company / region / group / node
            │    └─ Ledger audit — immutable transaction history
            ├─ Reports — in-store sales
            └─ Store settings — printer / receipts
```

## React implementation

| Area | Path |
|------|------|
| RM flow router | `src/pages/restaurant-mgmt/RestaurantMgmtFlow.tsx` |
| Module picker | `src/components/restaurant-mgmt/RestaurantMgmtModulePicker.tsx` |
| Inventory flow | `src/pages/enterprise-inventory/EnterpriseInventoryFlow.tsx` |
| Screens | `src/components/enterprise-inventory/` |
| Fixtures | `src/lib/enterprise-inventory-fixtures.ts` |
| API client | `src/lib/enterprise-inventory-api.ts` |

## Gating

- **Server:** `merchants.capabilities` includes `in_store_operations` (admin portal toggle)
- **Inventory mode:** `merchants.inventory_mode = 'enterprise'` set automatically when capability enabled
- No localStorage feature flags for inventory

# Enterprise Inventory — Flow Map

How owners manage multi-location stock, receiving, counts, and variance in the Roam Dash Partner app.

## Owner swimlane

```
Account
  └─ Operations Hub
       └─ Enterprise Inventory (flag: enterpriseInventoryV1)
            ├─ Hub — location picker, KPIs, quick actions
            ├─ Item Master — SKU, UOM chain, zones
            ├─ Vendors & Catalog — pack sizes, contract pricing
            ├─ Purchase Orders → Receiving → variance log
            ├─ Transfers — commissary ↔ storefront
            ├─ Physical Counts — blind count (mobile) → manager post
            ├─ Recipes v2 — yield % per ingredient
            ├─ Variance Report — theoretical vs actual $
            ├─ Location hierarchy — company / region / group / node
            └─ Ledger audit — immutable transaction history
```

Legacy **Restaurant Management → Inventory** remains available when `enterpriseInventoryV1` is off.

## React implementation

| Area | Path |
|------|------|
| Flow router | `src/pages/enterprise-inventory/EnterpriseInventoryFlow.tsx` |
| Screens | `src/components/enterprise-inventory/` |
| Fixtures | `src/lib/enterprise-inventory-fixtures.ts` |
| API | `src/lib/enterprise-inventory-api.ts` |

## Feature flag

`localStorage` key `roam_partner_flags_{merchantId}` → `enterpriseInventoryV1` (default `false`).

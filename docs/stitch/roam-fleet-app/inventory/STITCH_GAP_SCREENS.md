# Stitch gap screens (audit §2)

**Status (R12):** API/data path closed; **15 flows remain product-owner Stitch deliverables** (see sprint order below). Fleet uses [`gapScreens.tsx`](../../../apps/fleet/src/components/inventory/gap/gapScreens.tsx) placeholders until HTML exports land.

### R12 sprint order (PO export → `node scripts/port-inventory-stitch.mjs` → replace `Gap*`)

| Sprint | Screens |
|--------|---------|
| P1 | Opening balances · Register asset · Item editor · Approval drawer |
| P2 | PO · Vendor · Count session · Scanner pair |
| P3 | Settings · Import · Snooze · Kit compare |
| Driver | Update reported item (car-kit Stitch) |

| Gap | Stitch title | Owner action |
|-----|----------------|--------------|
| Settings | Inventory settings | Export + port |
| Item editor | Add / edit item | Export + port |
| Import | Import items | Export + port |
| Locations | Locations & bins | Export + port |
| Opening balances | Opening balances | Export + port |
| Register asset | Register asset | Export + port |
| PO | New / edit purchase order | Export + port |
| Vendor | Add / edit vendor + list | Export + port |
| Count | Start count + count sheet | Export + port |
| Requisition | New requisition + list | Export + port |
| Approval | Approval review drawer | Export + port |
| Scanner | Pair mobile scanner | Export + port |
| Snooze | Snooze settings | Export + port |
| Kit compare | Kit version compare | Export + port |
| Driver status | Update reported item | Export in driver car-kit Stitch |

After each export: `node scripts/port-inventory-stitch.mjs` and replace the matching `Gap*` component.

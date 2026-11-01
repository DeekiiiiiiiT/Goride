# Fleet inventory Rev 6 — live UI capture checklist

Capture side-by-side proof after deploying **fleet-core** and loading Fleet → Inventory with Roam org data.

## Settings

- Viewport: **1440×900** desktop for IN1–IN17; **390×844** for IN18.
- Save next to Stitch PNGs as `*-live.png` under `docs/stitch/roam-fleet-app/inventory/<folder>/`.
- Driver car kit: **390×844** under `docs/stitch/roam-driver-app/car-kit/<folder>/`.

## Screens

| ID | Stitch folder | Live filename |
|----|---------------|---------------|
| IN1–IN17 | matching README folder | `screen-live.png` |
| IN18 | `inventory_asset_management_phone_390px_mobile_view` | `screen-live.png` |
| DK1–DK6 | car-kit README folder | `screen-live.png` |

## Automated checks

```bash
node scripts/gen-inventory-live-data-samples.mjs
node scripts/stitch-fidelity.mjs --report
deno test supabase/functions/_fleet-server/org_part_stock_idempotency.test.ts
```

Run integrity SQL from `scripts/sql/fleet_inventory_integrity_checks.sql` scoped to Roam org (off-peak).

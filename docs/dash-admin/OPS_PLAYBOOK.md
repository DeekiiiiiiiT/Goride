# Roam Rush Admin — Operations Playbook

## Access

- **Dash Admin Portal:** https://roamrush.app/admin (`partner.roamrush.app/admin` is removed)
- **Roles:** `dash_admin` (write), `dash_ops` (read), or platform roles
- Provision via `supabase/scripts/provision_product_admin.sql` with `v_product_key := 'dash'`

## Merchant verification

1. Open **Merchants** → **Pending** tab
2. Open merchant detail → complete **Verification checklist**
3. Review documents (approve/reject per document)
4. **Assign to me** for SLA tracking
5. Approve only when checklist is complete (or force-approve as `dash_admin`)

## Suspend a merchant

1. Merchant must be **approved**
2. Merchant detail → **Suspend** → enter reason
3. Sets `operational_status = suspended` and hides from customer app

## Force pause orders

- Merchant detail → **Force pause** toggles `is_accepting_orders` without full suspension

## Order support

- **Orders** → filter live/placed/cancelled
- **Support** → lookup by order UUID
- Cancel/complete requires `dash_admin` or platform write role

## Customer suspend

- **Customers** → open customer → **Suspend**

## Finance

- **Finance** → view payouts and disputes
- Hold/release payouts (API: `POST /admin/finance/payouts/:id/hold|release`)

## Pricing & Commission (Model B)

- **Pricing** → configure market rules, merchant tiers, and COD controls
- **Spanish Town launch defaults:** J$400 base delivery (≤2 km), J$60/extra km, J$120 service fee, 80/20 courier delivery split, 12–25% merchant commission by tier
- **Enable Model B:** Pricing → Market Rules → select Spanish Town → check **Enable Model B pricing** → Save
- **Merchant tiers:** Assign Basic (12%), Standard (20%), or Premium (25%) on merchant detail → Pricing tier
- **Simulator:** Pricing → Simulator — test quotes before go-live
- **COD ledger:** Cash orders use `pending_collection` until delivery; couriers auto-pause at J$10,000 held until Lynk/WiPay settlement recorded in Pricing → COD Ledger
- **High-risk zones:** Markets → add exclude polygons for geofenced areas (blocks coverage)

## API reference

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/admin/dashboard/stats` | dash or courier | Role-aware dashboard: `{ scope: 'platform', platform: {...} }` or `{ scope: 'courier', courier: {...} }` |
| GET | `/admin/merchants` | dash | List merchants |
| GET | `/admin/couriers/stats` | courier | Courier-only stats (legacy; prefer unified dashboard) |
| GET | `/admin/pricing/overview` | dash | Pricing hub overview |

See `supabase/functions/delivery/README.md` for full route list.

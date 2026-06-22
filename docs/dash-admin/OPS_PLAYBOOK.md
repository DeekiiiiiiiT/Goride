# Roam Dash Admin — Operations Playbook

## Access

- **Dash Admin Portal:** https://partner.roamdash.co/admin
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

## API reference

See `supabase/functions/delivery/README.md` for full route list.

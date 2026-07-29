# Dash Customer Ops Desk — Support Runbook

## When to suspend vs remove

| Action | Use when | Effect |
|--------|----------|--------|
| **Suspend** | Abuse, chargebacks, fraud review, policy breach | Blocks new orders and payment intents. Profile stays. Audited. |
| **Unsuspend** | Issue resolved | Restores ordering. Audited. |
| **Remove Dash customer** | Test accounts / mistaken signups | Deletes Dash customer row + their Dash orders. Does **not** delete Roam Auth login. |

## Refunds (honest status)

1. Open **Orders → order detail** (or Support tools lookup).
2. Click **Refund** (write roles only: `dash_admin` / platform roles — not `dash_ops`).
3. Leave amount blank for full remaining balance, or enter partial.
4. Outcomes:
   - **Provider configured** → refund may show `completed` / order `refunded` or `partially_refunded`.
   - **Provider not configured** (common for WiPay without `WIPAY_REFUND_URL`) → refund row is **pending**, order `payment_status` = `refund_pending`. Do not tell the customer money has cleared until finance confirms.

Admin **Cancel** on a paid order automatically queues a full refund the same way.

## Disputes

Finance → Disputes → **Resolve**:

- `resolved` / `denied` / `investigating` — notes only, no money.
- `refunded` + amount — triggers the same refund orchestrator; if refund fails, dispute is **not** marked refunded.

## Customer notes

Customer detail → Internal notes (admin-only, not shown in the customer app).

## Roles

| Role | View customers/orders/finance | Suspend / refund / dispute resolve | Delete customer |
|------|-------------------------------|------------------------------------|-----------------|
| `dash_ops` | Yes | No | No |
| `dash_admin` | Yes | Yes | Yes |
| `platform_support` | Yes | Yes | No |
| `platform_owner` / `superadmin` | Yes | Yes | Yes |

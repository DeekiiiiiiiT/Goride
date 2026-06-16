# Rider arrears payment

Contract for **`CASH_SETTLEMENT_SWITCH_TO_CARD=1`** (requires `CASH_SETTLEMENT_ENABLED=1` and `CASH_SETTLEMENT_V2=1`).

## Eligible payment methods

- **Card** (debit/credit) — demo stub until PSP integration
- **Lynk** — demo stub until Lynk API integration
- **Cash is not allowed** for arrears settlement

When the rider has **no** saved card or Lynk methods, the add flow is restricted to those two types only.

## Amount

- Always pays **full wallet arrears** for the currency (no partial pay in v1).
- Arrears = `max(0, -balance_minor)` on `user:{riderId}:rider`.

## API

### `POST /v1/wallet/pay-arrears`

Body:

```json
{
  "payment_method_id": "visa_1212",
  "idempotency_key": "uuid",
  "currency": "JMD"
}
```

Response:

```json
{
  "success": true,
  "amount_paid_minor": 2119,
  "new_arrears_minor": 0,
  "currency": "JMD",
  "payment_method_id": "visa_1212",
  "payment_source": "demo_card"
}
```

### Trip shortfall (legacy path)

`POST /v1/requests/:id/pay-shortfall` — same journal semantics; ride validation retained.

## Idempotency

`idempotency_key` is required. Duplicate keys return the same outcome without double-crediting.

Wallet-scoped keys are prefixed server-side: `wallet_pay_arrears:{userId}:{key}`.

## Demo / stub behavior

No real card or Lynk charge. A `card_shortfall_payment` journal entry credits the rider wallet and clears platform receivable.

## Client flags

- `VITE_CASH_SETTLEMENT=1`
- `VITE_CASH_SETTLEMENT_V2=1`
- `VITE_CASH_SETTLEMENT_SWITCH_TO_CARD=1` — shows pay UI

## Admin

- `GET /admin/riders/arrears` — riders with `balance_minor < 0`
- Rider detail includes `stats.arrears_minor` when V2 enabled

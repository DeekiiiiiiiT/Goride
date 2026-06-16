# Cash + Roam wallet split settlement

Contract for **`CASH_SETTLEMENT_SPLIT_PAYMENT=1`** (requires `CASH_SETTLEMENT_ENABLED=1` and `CASH_SETTLEMENT_V2=1`).

## Policy

- **Driver guarantee:** Every completed trip pays the driver the **full fare**. Shortfall after physical cash is funded via **driver digital wallet** credit.
- **Rider debt:** Uncollected amounts are **rider → company** only. Drivers must never see "rider owes you."
- **Collection:** Roam attempts to debit the rider wallet at settlement; any remainder is company receivable (`cash_trip_arrears`) and/or platform guarantee.

## Outcomes

| Outcome | Condition |
|---------|-----------|
| `unpaid` | `cash_received = 0` and owed > 0 |
| `exact` | `cash_received = owed` |
| `overpay` | `cash_received > owed` |
| `underpay` | Legacy (flag OFF): `cash_received < owed` |
| **`split`** | Flag ON: `0 < cash_received < owed`; wallet and/or platform completes payment |

## Snapshot fields (V2)

| Field | Meaning |
|-------|---------|
| `wallet_paid_minor` | Collected from rider Roam wallet at settlement |
| `rider_arrears_minor` | Company still owed by rider (uncollected shortfall) |
| `driver_digital_credit_minor` | Credited to driver digital wallet (= fare − cash) |
| `platform_guarantee_minor` | Company-funded driver credit when rider wallet insufficient |

**Invariant:** `cash_received + wallet_paid + platform_guarantee === owed` (driver fully funded).

## Journal entry types

| Entry type | Debit | Credit |
|------------|-------|--------|
| `cash_trip_collection` | `platform:clearing` | driver cash |
| `fare_allocation_from_cash` | driver cash | `platform:receivable` |
| `wallet_fare_from_rider` | rider wallet | `platform:clearing` |
| `wallet_fare_to_driver` | `platform:clearing` | driver digital |
| `platform_fare_guarantee` | `platform:receivable` | driver digital |
| `cash_trip_arrears` | rider wallet | `platform:receivable` (uncollected only) |
| `card_trip_digital_credit` | `platform:clearing` | driver digital (card trips) |

Split path must **not** post full shortfall as `cash_trip_arrears` when `wallet_fare_from_rider` already collected.

## Driver-facing vs ops-facing

| Audience | Shows |
|----------|--------|
| Driver app | Trip paid, cash in hand, digital received; never rider owes driver |
| Rider app | Cash given, paid from wallet, company balance if any |
| Ops / admin | `rider_arrears_minor`, journal lines, wallet reconciliation |

## Rollback

1. Set `CASH_SETTLEMENT_SPLIT_PAYMENT=0` (or unset) on rides edge function.
2. New settlements use legacy `underpay` + existing `buildSettlementJournalV2`.
3. Migrations are additive; no schema rollback required.
4. Trips already stored as `split` remain valid read-only history.

## Deploy order

1. Migration `20260624120000_cash_split_settlement.sql`
2. Deploy `rides` edge function
3. Enable `CASH_SETTLEMENT_SPLIT_PAYMENT=1` on staging, then production
4. Deploy driver + passenger apps

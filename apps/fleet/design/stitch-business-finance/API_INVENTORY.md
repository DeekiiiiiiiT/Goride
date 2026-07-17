# Business Finance — Phase 0 API inventory (read-only)

| Need | Existing source | Notes |
|------|-----------------|-------|
| Gross earnings / fees | `api.getCanonicalLedgerEvents` — fare_earning, tip, promotion, platform_fee | P&L + Overview |
| Bank expected / received | `payout_bank` events + `api.getFleetBankConfirms` + `fleetBankReceive` utils | Cash & Bank / Overview |
| Driver cash still held | Driver financial periods / settlement period rows | Driver balances / Overview |
| Fuel spend | Fuel ledger / finalized reports APIs | Expenses |
| Toll spend / variance | Toll analytics / recon surfaces | Expenses / Risk |
| InDrive wallet loads | Wallet summary / InDrive wallet APIs | Cash & Bank |
| Maintenance $ | Maintenance logs — amount may be missing | Honest stub until schema ready |
| Driver payouts | Settlement / payout period projections | Overview / P&L |

## Forbidden mutations (never touch while building Business Finance)

- `utils/driverSettlementMath.ts`
- `utils/cashSettlementCalc.ts`
- Bank confirm write paths (`upsertFleetBankConfirm` / `deleteFleetBankConfirm` callers outside Bank Deposits)
- Fuel finalize writers
- Toll settlement writers
- InDrive wallet load writers (except existing Wallet Center)

## Phase 0 sign-off

- [x] Briefs in SCREEN_BRIEFS.md
- [x] Folder design/stitch-business-finance seeded
- [x] Guardrails acknowledged
- Tabs locked: Overview, P&L, Cash & Bank, Expenses, Driver Balances (Unit Economics = Phase 9 later)

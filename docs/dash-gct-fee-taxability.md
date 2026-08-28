# GCT on Platform Fees — Product Policy

Status: **approved by product owner** (2026-08-27). Implemented in Model B pricing engine.

Related: [dash-gct-centralization-audit.md](./dash-gct-centralization-audit.md), [dash-service-fee-strategy.md](./dash-service-fee-strategy.md)

## Policy (locked)

| Supply | GCT rate | Who remits |
|---|---|---|
| Merchant food | Standard rate when `gct_registered`; else 0% | Roam on COD; merchant on card (normal supply) |
| Platform service fee | Dominion global standard rate | Roam |
| Platform delivery fee share | Dominion global standard rate | Roam |
| Tips | Not taxed | — |

## Implementation

- `packages/dash-pricing/src/gct.ts` — `resolveOrderGct()`
- `packages/dash-pricing/src/engine.ts` — `buildOrderPricing()` applies multi-supply GCT
- Order columns: `tax_food_jmd`, `tax_platform_jmd`, `tax_rate_*_percent`
- Checkout shows separate GCT lines when platform portion > 0

## COD (locked)

Roam holds and remits **all GCT** (food + platform) on cash orders. See `computeCodTrialBalance()` in `packages/dash-pricing/src/codBalance.ts`.

## Verification

- [ ] Dominion Global Settings shows 16.5% / enabled
- [ ] dash-customer checkout shows food GCT + platform GCT lines when applicable
- [ ] Simulator four-way split shows platform GCT on COD
- [ ] Unregistered merchant orders show $0 food GCT
- [ ] COD trial balance: platform + merchant + courier = total

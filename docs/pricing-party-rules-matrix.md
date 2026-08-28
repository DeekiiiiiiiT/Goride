# Pricing Party Rules — Field Matrix & Acceptance Criteria

**Status:** Approved for implementation (2026-08-28)

## Field matrix

| Field | Party | Who pays | Who receives | GCT |
|---|---|---|---|---|
| Service fee (marginal) | Customer | Customer | Roam platform | Platform GCT on fee |
| Min order subtotal | Customer | — | — | — |
| Card processing (order) | Customer | Customer | Processor (via Roam) | — |
| Launch promos | Customer | Roam (promo cost) | Customer benefit | — |
| Delivery fee schedule | Customer | Customer | Split rider/platform | Platform GCT on platform share |
| Courier delivery share | Rider | — | Rider % of delivery | — |
| COD pause threshold | Rider | — | Ops control | — |
| Road distance multiplier | Rider | — | Affects delivery calc | — |
| Tip processing from rider | Rider | Rider (on tip) | Processor | — |
| Commission tiers | Partner | Merchant | Roam | On commission |
| Model B enable | Platform | — | Engine gate | — |

## UX acceptance criteria

1. Market Rules shows three cards: **Customer**, **Partner**, **Rider** at Default, Parish, and Town scopes.
2. Editing one party saves only that party's fields (partial merge server-side).
3. Partner card links to Merchant Tiers; commission % not editable on Market Rules.
4. View mode shows effective values with layer provenance badges.
5. Simulator shows three-column resolved rules with provenance.
6. Checkout and backtest totals unchanged on fixed fixtures after migration.

## Partner scope (v1)

- Commission rates: **Merchant Tiers tab only** (`merchant_tiers` table).
- Partner card: read-only tier summary + deep link.

# RoamFleet × Rush — Product Decision Log

From audit §10. Record decisions before enabling Wave 4 settlement.

## Decisions

| # | Topic | Options | Recommendation | Decision | Date |
|---|-------|---------|------------------|----------|------|
| 1 | Payout routing | Direct to courier vs fleet-as-paymaster | Direct (Uber model) for v1 | **Pending PO** | — |
| 2 | Commercial packaging | Paid add-on vs tier vs bundle | TBD | **Pending PO** | — |
| 3 | Independent courier history | Join date only vs full history | Join date onward | **Pending PO** | — |
| 4 | Merchant-owned couriers | Allow merchant = fleet owner | Data model allows; commercial TBD | **Pending PO** | — |
| 5 | Fleet-preference dispatch | Offer fleet couriers first | Not v1 | **Deferred** | — |
| 6 | Branding | roamfleet.co for delivery-only | Keep domain, soften copy | **Pending PO** | — |

## Pilot org criteria

| Shape | Purpose | Requirements |
|-------|---------|--------------|
| Rideshare-only | Regression control | Existing customer; no Rush flags |
| Delivery-only | Primary Rush path | `service_lines = ['rush_delivery']`; 2+ fleet couriers |
| Both-lines | Combined settlement | Rideshare CSV + Rush live; 1 dual-role driver ideal |

No production Rush flags until Wave 2 exit gate passes.

## Blockers

- **Wave 4 settlement go-live:** Decision #1 (payout routing) required

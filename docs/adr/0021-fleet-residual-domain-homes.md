# ADR 0021 — Residual fleet domain homes

## Status

Accepted — 2026-09-16

## Context

The four-domain extraction plan covered ~⅓ of `make-server-37f42386`. Retiring the shim requires an explicit home for every residual registrar and sub-app.

## Decision

| Cluster | Home |
|---------|------|
| Fuel | `fleet-fuel` (dedicated) |
| Toll + periods | `fleet-toll` (dedicated) |
| Maintenance, expense hub, tags, assets/Uber/parts/catalog | `fleet-ops` |
| Claims | `fleet-claims` (dedicated) |
| Driver pay, periods, settlement commands, rush settlement, disputeRefund, paymentLedgerLine | `fleet-pay` |
| Week-close conductor | stays on thin `fleet-core` until F5; HTTP seals only |
| Drivers×6, ledger×9, org billing, enterprise/workforce, platform vendor, evidence, migrate, audit/safety/sync/apiCenter | thin renamed **`fleet-core`** (successor to `make-server-37f42386`) |

No residual may remain “undecided” at F5. Dead code is deleted, not left on the shim.

## Consequences

- F0 carve groups inline routes toward these homes.
- F5 exit = every row live on its home + zero extracted-path traffic on the old slug.

## Related

- `docs/fleet-domain-extraction-completion.md` §A5 / §B4

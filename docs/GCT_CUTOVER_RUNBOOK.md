# GCT Cutover Runbook — COMPLETE

**Status: done.** Accounting `gct_rates` is the sole live charge source. Legacy Global Settings / KV tax is removed from the app.

## What shipped

1. Resolver flags: `db_authoritative: true`, `kv_fallback: false`, `gct_enabled: true` (migration `20260830280300_gct_engine_authoritative.sql`).
2. `loadGlobalGctConfig` reads **only** the Accounting engine (seed fallback only if DB is down).
3. Global Settings GCT panel, `TaxSettings`, and fleet-server default `tax` block deleted.
4. Saving global settings strips any leftover `tax` key from KV.

## Day-to-day ops

| Need | Where |
|---|---|
| Change standard rate | Dominion → Accounting → GCT → Rates & classes |
| Kill switch (platform GCT off) | `POST /gct-admin/resolver-flags` with `{ "gct_enabled": false }` |
| Registrations / TRNs | GCT → Entities |
| Remittance | GCT → Remittance & filing |

## Verify after deploy

- Dominion → GCT engine shows **Engine live** and rate matches Rates page.
- Registered merchant quote / POS: food GCT at engine rate.
- Unregistered: food GCT $0.
- Global Settings has **no** GCT panel.

## Rollback (emergency only)

Re-introduce KV dual-read only via a new code deploy — there is no soft flag back to Global Settings tax. Prefer fixing `gct_rates` rows or setting `gct_enabled: false` to stop charging.

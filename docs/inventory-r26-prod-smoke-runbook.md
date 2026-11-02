# Inventory R26-02 — production smoke runbook

Run after fleet-core deploy with R26 handler wiring.

## Prep

1. Sign in to production Fleet (`roamfleet.co`) with a user that has `inventory.view`, `inventory.move`, and related permissions.
2. Refresh Playwright storage locally (not committed): `npx playwright codegen https://roamfleet.co --save-storage=playwright/.auth/fleet.json`

## Matrix (15 gap modals + driver sheet)

For each flow: open modal → one minimal save with `TEST-R26-*` names → confirm success in UI → note route in edge logs.

| Flow | Open via | Minimal save |
|------|----------|--------------|
| Settings | Inventory → settings gap | Change support phone → Save general |
| Item editor | Stock → edit item | PATCH name or create SKU `TEST-R26-ITEM` |
| Import | Settings → import | One-row import dry run or commit |
| Locations/bins | Settings → locations | PATCH kind/security or new bin |
| Opening balances | Setup gap | One balance line |
| Register asset | Assets gap | Serial `TEST-R26-SN` |
| PO | Purchasing gap | Draft PO + save |
| Vendor | Vendor drawer | Name `TEST-R26-VENDOR` |
| Count | Counts gap | Start/submit session |
| Requisition | Requisitions gap | New request + vehicle id |
| Approval | Alerts gap | Approve/reject test row |
| Scanner | Scanner gap | Pair/unpair test device |
| Snooze | Alerts → snooze | Save rule |
| Kit compare | Vehicle kits → compare | Export diff CSV |
| Driver report update | Fleet gap from driver report | Status update |
| Driver car kit | Driver app → My car kit | Open update sheet |

## Matrix — main In* screens (R28)

After gap matrix passes, exercise **stock-moving** flows from the primary Stitch tabs/modals (`TEST-R28-*` refs only):

| Flow | Open via | Minimal action |
|------|----------|----------------|
| Receive | Overview → Receive stock | One line qty 1 → **Receive** |
| Issue | Overview → Issue to cars | One line → **Issue** |
| Transfer / return / write-off | Overview or item → Custody modal | One tab → **Submit** (reverse in SQL if write-off) |
| Count approve | Counts tab | Approve or open count gap → submit |
| Movements export | Movements tab | **Export CSV** (no ledger change) |
| Driver report | Driver → Report problem | **Send report** (sending state on button) |

Then run live PNG capture and reverse all `TEST-R28-*` / test movements before integrity SQL.

## Evidence

1. Supabase **Edge Functions → fleet-core** logs: filter authenticated `/make-server-*/inventory/` — expect 200s (not unsigned probes only).
2. Live PNGs: `node scripts/capture-inventory-screen-live.mjs --base https://roamfleet.co --driver-base <driver-url> --storage playwright/.auth/fleet.json` then `node scripts/stitch-fidelity.mjs --report`.
3. Cleanup: archive/delete all `TEST-R26-*` rows; re-check stock value baseline J$69,380.

## Sign-off SQL

Run [`scripts/sql/fleet_inventory_integrity_checks.sql`](../scripts/sql/fleet_inventory_integrity_checks.sql) — every query must return 0 rows.

```sql
SELECT organization_id, checked_at, ok
FROM fleet.inv_chain_check
ORDER BY checked_at DESC
LIMIT 5;
```

Latest row must have `ok = true` after the 06:30 UTC nightly job (R26-03).

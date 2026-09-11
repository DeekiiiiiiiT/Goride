# Recovery: bad Close Week Uber re-import (2026-02-16)

**Incident:** Close Week “Re-import Uber bundle” on 2026-09-10 overwrote trips without preserving `tollRefundResolution`, wiping cash-wash, and posted a second copy of statement money (batch `076c86c5-a28d-47e6-9608-852dc867ce2f`, fingerprint `18252970527369cd…`).

## Forensics (confirmed)

| Check | Result |
|-------|--------|
| Toll trips in week | 6 trips, Σ tollCharges = **$2,125** |
| cash_wash after import | **0** (all missing) |
| Duplicate ledger | New `payout_cash` / `payout_bank` / `promotion` / `statement_line` for same week |

## Recovery applied (2026-09-10)

1. Restored `tollRefundResolution.status = cash_wash` on the 6 trip IDs in `fleet_trips.payload_json`.
2. Deleted duplicate `ledger_entries` for reference batch `076c86c5-…` and the extra Sept-10 `payout_bank` (`2c9f288d-…`).
3. Ran Close Week sync for `2026-02-16` (reseal + rebuild).

Trip IDs restored:

- `8e6de8b7-33d2-4004-a157-2283bb8ba586`
- `95904d3d-d43c-4a2e-a62c-fba3315d02bb`
- `0f625e0f-0e58-4b0a-99c0-c5a367986064`
- `5704e9df-3683-4356-8822-dba92aa931e0`
- `9fdfaebb-6a33-4cec-bb65-9d70fd69f381`
- `85869392-dc13-4e1e-9848-1213fa00e215`

## Verify

Close Week → week of Feb 16–22 (after rebuild):

- Toll **Spend** ≈ **$2,125** (`toll_cash_spend` / cash-wash restored)
- `financeCore.uberCash` ≈ **$17,879.88** (single statement copy; duplicate ledger rows removed)
- `cashSourceMismatch` ≈ **0** when trip cash aligns
- Settlement residual matches Cash desk (overpaid / small owe — not a fabricated ~$20k spike)

Focused rebuild helper: `deno run -A --config deno.json supabase/functions/_fleet-server/heal_feb16_reimport_recovery.ts` (with `SUPABASE_URL` + service role).

## Do not

- Re-import the same Uber CSVs again until the safe redesign ships (merge + week scope + no auto sync).
- Use Restatement Queue for this incident.

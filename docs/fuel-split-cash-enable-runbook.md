# Split Cash — Ops Enable Runbook

Companion to `docs/fuel-split-statement-derived-audit.md` §12.

## Day-0 (before pilot)

```bash
pnpm verify:split-cash-enable
```

Must exit 0. Then complete the operator walkthrough in audit §12.4 on Fuel Management.

## Module state

- Default **on** for all orgs (`fuelSplitPayment`).
- Org can set override `false` in enterprise modules.
- Mirrors: `packages/platform-settings/src/modules.ts` + `supabase/functions/_fleet-server/enterprise_modules.ts`.

## Pilot

1. Pick one org (or accept global default-on).
2. Import one Dominion CSV against a known split fill.
3. Confirm cash lands Pending (or Awaiting/blocked with correct copy).
4. Watch 48–72h:

| Metric | Where |
|---|---|
| Awaiting statement count | Fuel Management → Awaiting statement tab / nav badge |
| Stale (≥14d) | Amber banner on that tab |
| Re-home blocked | Second banner + per-row blocked copy |
| Rehomes | Row date subtitle “Moved from fill …” |
| Price outliers | “Price band flag” / dialog amber callout |

## Kill criteria (pause statement matching for pilot)

- Any amount written into a sealed week
- Any row with both `splitReconciled` and `awaitingCashStatement`
- Old “acknowledge mismatch” path returning without money decision

## After watch clears

Update audit status line to **Enabled (pilot)** or **Enabled (global)** with date and who signed off.

## Post-enable (optional)

Weekly stale-awaiting digest: **only if** stale count stays > 0 across multiple days of the watch. Nav badge already escalates; do not build digest preemptively.

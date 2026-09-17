# Phase I / D9 — Authenticated browser CORS checklist (six slugs)

Run against **production** (CI-deployed) functions — not a laptop-only deploy.

**Where to log in**
- Fleet UI: https://www.roamfleet.co (fuel, toll, ops, fleet-core residual)
- Admin UI: https://roamdominion.co (claims + pay / settlement)

Maintenance-mode drill is already done across all six slugs — do **not** re-run it here.

## Per slug (same four DevTools steps)

1. Open the primary screen below.
2. DevTools → **Network** → filter `options` → confirm preflight **OPTIONS** → **204** (or 200) with request headers `X-Roam-Product-Line` / `X-Roam-Settings-Segment` accepted.
3. On the list **GET**: when the UI shows a total/count, response exposes **`X-Total-Count`** and **UI total = header**.
4. **Console:** zero CORS errors.

| Slug | Primary screen(s) | Where | Totals header | Result |
|------|-------------------|-------|---------------|--------|
| `fleet-fuel` | Fuel → Entries (cards / finalized reports) | Fleet | `X-Total-Count` | |
| `fleet-toll` | Toll → Tags / plazas / ledger / reconciliation | Fleet | `X-Total-Count` | |
| `fleet-ops` | Maintenance summary, logs, expense hub | Fleet | As used today | |
| `fleet-claims` | Claims list / detail | Admin | As used today | |
| `fleet-pay` | Settlement desk, periods, statements | Admin | As used today | |
| `fleet-core` | Drivers / trips / ledger (residual) | Fleet | As used on residual lists | |

**Eng note (2026-09-17):** anonymous OPTIONS → 204 with `X-Roam-Product-Line` accepted on all six production slugs. Authenticated UI totals still require your logged-in session above.

When all six are PASS, copy results into `docs/fleet-domain-extraction-completion.md` §8 **D9 browser checklist** → **Authenticated UI** column.

**Done when:** six PASS rows + no CORS console errors. Then the only remaining gate is the 7-day shim soak.

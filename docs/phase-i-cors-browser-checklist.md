# Phase I / D9 — Authenticated browser CORS checklist (six slugs)

Run against **CI-deployed** functions (not a laptop-only deploy). Use a logged-in Fleet session (Admin where pay/claims live). Maintenance-mode drill is already done across all six slugs — do **not** re-run it here.

Per row in DevTools → Network:

1. Open the primary screen.
2. Confirm preflight **OPTIONS** → **204** (or 200) with `X-Roam-Product-Line` / `X-Roam-Settings-Segment`.
3. Confirm list responses expose `X-Total-Count` when the UI shows a total; UI total matches the header.
4. Confirm **zero** CORS errors in the console.

| Slug | Primary screen(s) | Totals header | Result |
|------|-------------------|---------------|--------|
| `fleet-fuel` | Fuel Entries (cards / finalized reports as needed) | `X-Total-Count` | |
| `fleet-toll` | Tags, plazas, toll ledger, reconciliation | `X-Total-Count` | |
| `fleet-ops` | Maintenance summary, logs, expense hub | As used today | |
| `fleet-claims` | Claims list / detail | As used today | |
| `fleet-pay` | Settlement desk, periods, statements | As used today | |
| `fleet-core` | Residual Fleet UI on `.fleetCore` (drivers, trips, ledger, etc.) | As used on residual lists | |

Record pass/fail in `docs/fleet-domain-extraction-completion.md` §8.

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
| `fleet-fuel` | Fuel → Entries (cards / finalized reports) | Fleet | `X-Total-Count` | **PASS** 2026-09-17 — Fuel Cards + Transaction Logs; OPTIONS 204; `GET /fuel-entries` 200 + `X-Total-Count: 24`; zero CORS |
| `fleet-toll` | Toll → Tags / plazas / ledger / reconciliation | Fleet | `X-Total-Count` | **PASS** 2026-09-17 — Toll Logs empty week OK; OPTIONS 204; `GET …/toll-logs` 200; zero CORS (note: `/toll-tags` returns 404 — functional, not CORS) |
| `fleet-ops` | Maintenance summary, logs, expense hub | Fleet | As used today | **PASS** 2026-09-17 — Maintenance hub loads 2 vehicles; OPTIONS 204; `GET /maintenance-fleet-summary` 200; zero CORS |
| `fleet-claims` | Claims list / detail | Fleet Data Center → Export → Finance (Admin login not required for slug proof) | As used today | **PASS** 2026-09-17 — Export shows **215 rec** = API array length 215; OPTIONS 204; `GET /claims` 200; zero CORS |
| `fleet-pay` | Settlement desk, periods, statements | Fleet Driver Settlements | As used today | **PASS** 2026-09-17 — Cash desk **showing 2 of 2**; OPTIONS 204; `GET /settlements/queue` 200; zero CORS |
| `fleet-core` | Drivers / trips / ledger (residual) | Fleet | As used on residual lists | **PASS** 2026-09-17 — Drivers list (Kenny Gregory Rattray); OPTIONS 204; `GET /drivers` 200; zero CORS |

**Eng note (2026-09-17):** anonymous OPTIONS → 204 with `X-Roam-Product-Line` accepted on all six production slugs. Authenticated UI totals still require your logged-in session above.

**Authenticated pass (2026-09-17):** six PASS — logged-in Fleet (`roamfleet.co`, user JD). Dominion Admin was at login (not required once Fleet hit `fleet-claims` + `fleet-pay`). Copy into `docs/fleet-domain-extraction-completion.md` §8 done.

**Done when:** six PASS rows + no CORS console errors. Then the only remaining gate is the 7-day shim soak.

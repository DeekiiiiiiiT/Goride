# Phase I — Browser CORS verification checklist

Run **after** A1 CI deploys `fleet-fuel` (not against a laptop-only deploy).

1. Open Fleet app → Fuel Entries (paginated list).
2. DevTools → Network → filter `fuel-entries` / preflight `OPTIONS`.
3. Confirm preflight **204** (or 200) with request headers including `X-Roam-Product-Line` / `X-Roam-Settings-Segment`.
4. Confirm response exposes `X-Total-Count` when the list uses totals; UI total matches header.
5. Confirm zero CORS errors in console.
6. Optional: flip platform maintenance mode → fuel requests return **503** with maintenance payload (B1 kernel).

Record pass/fail in `docs/fleet-domain-extraction-completion.md` §8.

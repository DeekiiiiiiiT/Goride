# Live PNG proof (R5-14)

Capture side-by-side screenshots after staging sign-off:

- Fleet: `docs/stitch/roam-fleet-app/inventory/<folder>/IN*-live.png` next to `screen.png`
- Driver: `docs/stitch/roam-driver-app/car-kit/DK*-live.png` next to design PNG

Run `node scripts/stitch-fidelity.mjs --report` before committing proof assets.

**Status:** R14 — prod FIFO + chain KPI fixed (`20261101205000`, `20261101205100`). `screen-live.png` captured via [`scripts/capture-inventory-screen-live.mjs`](../../scripts/capture-inventory-screen-live.mjs) (local Fleet, phase 2 flag). Re-capture on signed-in prod when ready.

# Live PNG proof (R5-14)

Capture side-by-side screenshots after staging sign-off:

- Fleet: `docs/stitch/roam-fleet-app/inventory/<folder>/IN*-live.png` next to `screen.png`
- Driver: `docs/stitch/roam-driver-app/car-kit/DK*-live.png` next to design PNG

Run `node scripts/stitch-fidelity.mjs --report` before committing proof assets.

**Status:** R12 prod verified (stock J$69,380, chain ok, 0 unbalanced movements). Capture side-by-side `IN*-live.png` / `DK*-live.png` after signed-in Fleet/Driver session; run `node scripts/stitch-fidelity.mjs --report` before committing proof assets.

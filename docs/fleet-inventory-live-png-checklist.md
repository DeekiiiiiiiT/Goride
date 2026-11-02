# Live PNG proof (R5-14)

Capture side-by-side screenshots after staging sign-off:

- Fleet: `docs/stitch/roam-fleet-app/inventory/<folder>/IN*-live.png` next to `screen.png`
- Driver: `docs/stitch/roam-driver-app/car-kit/DK*-live.png` next to design PNG

Run `node scripts/stitch-fidelity.mjs --report` before committing proof assets.

**Status:** R25 — assert + typecheck green; fleet-core deployed. **R15-01:** refresh `playwright/.auth/fleet.json` (file not in repo), then run capture below.

```bash
# Fleet + Driver dev with phase2 / car kit, then:
npx playwright codegen http://127.0.0.1:5199 --save-storage=playwright/.auth/fleet.json
node scripts/capture-inventory-screen-live.mjs --base http://127.0.0.1:5199 --driver-base http://127.0.0.1:5174 --storage playwright/.auth/fleet.json
node scripts/stitch-fidelity.mjs --report
```

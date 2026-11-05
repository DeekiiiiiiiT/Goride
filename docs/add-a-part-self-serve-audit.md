# Add a part + auto-matching — audit

**Rev 19 · 5 Nov 2026 · Status: DONE.** Goal: a Fleet user opens **Find parts** for a car and sees every part that fits, with a reason and a trust label. **Add a part** is the self-serve front end; auto-match is the engine. Stitch spec: [docs/stitch/dominion-add-a-part/](stitch/dominion-add-a-part/).

All code is live and every check for this system passes: the parts SQL checks on a fresh database, the add-a-part and auto-match screen tests (Dominion and Fleet), and the parts-import screen tests. AM-S1, AM-S3 and AM-S5 are marked Ported.

## Open — owner only

- Upload the MK Kashiyama **D0051MH** files (Brakes fitment first, then cross-refs) and `brake pads D0051M family - fitment.csv`.
- Add Ford Fiesta and Mazda factory numbers from the car makers' catalogues.

## Outside this audit (CI only)

- **Maintenance updates not live.** The 11 `20261111*_mm_*` updates belong to [vehicle-master-data-audit.md](vehicle-master-data-audit.md). The CI version check stays red until they are live.
- **Future-dated update files.** The date check flags files dated after today. It clears on its own on 11 Nov 2026, 12:10 UTC.

## Rules

- Schema changes go in **new** migration files.
- Tests use fixture IDs only and never touch live catalog rows.
- Parts are information only: no prices, suppliers or stock.
- Run Playwright with `node node_modules/@playwright/test/cli.js`, not `npx playwright`.

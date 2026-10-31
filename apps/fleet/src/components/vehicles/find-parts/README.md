# Find parts (fleet maintenance tab)

Port recipe:

1. Source HTML: `docs/stitch/roam-fleet-app/html/find-parts-*.html` — copy only content **below** the hub tab row (no duplicate Fleet Maintenance header).
2. Compare to `docs/stitch/roam-fleet-app/screenshots/FP*-stitch.png`.
3. Static Stitch labels stay in JSX; sample values become props or `.map()` rows.
4. Buttons use explicit `onClick` handlers (no DOM text replacement, no text-label matching, no `querySelector`).
5. Inputs: controlled `value` / `onChange`; photos: visible `<label>` wrapping `<input type="file">`.
6. After each FP: `node scripts/stitch-fidelity.mjs`, vitest `findParts.noSample.test.ts`, Playwright `fleet-find-parts-visual.spec.ts`.

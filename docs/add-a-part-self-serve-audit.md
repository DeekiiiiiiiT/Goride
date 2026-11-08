# Add a part + auto-matching — audit

**Rev 34 · 5 Nov 2026 · Status: CLOSED in code — owner catalog uploads left.** Goal: a Fleet user opens **Find parts** for a car and sees every part that fits, with a reason and a trust label. **Add a part** is the self-serve front end; auto-match is the engine. Stitch spec: [docs/stitch/dominion-add-a-part/](stitch/dominion-add-a-part/).

**8 Nov 2026 — open: rewrite the behaviour tests for the new screens.** The A1–A14 Stitch port replaced the old wizard. `e2e/add-a-part-stitch.spec.ts` and `e2e/add-a-part-done.spec.ts` (44 tests, including real saves) still target the old "Add parts" heading, so CI now runs `e2e/dominion-add-parts-self-serve-capture.spec.ts` instead (look only). *Fix:* port the done-tests (save, draft clears, request part type, specific cars / by engine / by size) to the new A1–A14 flow and put them back in `parts-auto-match-e2e.yml`.

Checked 5 Nov (code scan + overlay screenshots by eye, light and dark): every button in the Parts database section follows the Button rule, including the Cancel overlay; 34 screen tests pass.

## Button rule (whole Parts database section)

| Kind | Use for | Look |
|---|---|---|
| **Primary** | The one main action on a screen (Next, Save, Start, Commit) | Solid blue, white text |
| **Secondary** | Back, Close, Change, Show more, Reset filters, Skip, Export, Sync, View…, Add row, help | White/surface fill, visible border, dark readable text |
| **Danger** | Cancel, Remove, Delete, Undo, Revert, Decline, Exclude | Red border + red text; the final "yes" inside a confirm overlay is solid red |
| **Icon** | Copy, close ✕, collapse, ⋯ menu, move up/down | 32 px square, visible border or fill, dark icon, hover tooltip |

- Nothing that acts inside the app may look like a link: no underline, no text-only, no grey button text. Links only open outside websites: blue, readable, with ↗.
- Minimum height 36 px. Light and dark both readable — **including overlays and drawers**.
- Not in scope: tabs, step bars, filter chips, selectable cards, table rows.

## Open — owner only

- Upload the MK Kashiyama **D0051MH** files (Brakes fitment first, then cross-refs) and `brake pads D0051M family - fitment.csv`. Checklist: [owner-add-a-part-catalog-uploads.md](owner-add-a-part-catalog-uploads.md).
- Add Ford Fiesta and Mazda factory numbers from the car makers' catalogues.

## Rules

- Schema changes go in **new** migration files.
- Tests use fixture IDs only and never touch live catalog rows.
- Parts are information only: no prices, suppliers or stock.
- No browser pop-ups (`window.confirm`, `alert`, `prompt`) — always an in-app overlay.
- No button may look like a link or be faint grey text (Button rule above).
- Run Playwright with `node node_modules/@playwright/test/cli.js`, not `npx playwright`.
- Any screen change: rebuild, run `e2e/add-a-part-stitch.spec.ts`, and compare light and dark shots by eye — overlays and drawers included — before calling it done.

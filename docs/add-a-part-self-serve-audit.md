# Add a part + auto-matching — audit

**Rev 18 · 4 Nov 2026 · Status: NOT DONE (gate).** Goal: a Fleet user opens **Find parts** for a car and sees every part that fits, with a reason and trust label. **Add a part** is self-serve; auto-match is the engine. Stitch spec: [docs/stitch/dominion-add-a-part/](stitch/dominion-add-a-part/).

## Open

| Id | What | Where |
|----|------|--------|
| Gate | SQL + Playwright trio must pass twice (see below) | — |
| README | Flip **AM-S1**, **AM-S3**, **AM-S5** to **Ported** in [dominion-redesign/README.md](stitch/dominion-redesign/README.md) after gate is green | stitch README |

Rev 17 code fixes (spec-keys crash, unmerge RPC + UI, stitch e2e allowances) are in the branch; this doc stays **NOT DONE** until the gate passes.

## Done when

1. `supabase/tests/parts_auto_match_checks.sql` passes (Proof 84 uses `part_match_unmerge_same_part`).
2. Twice in a row, from a folder OneDrive is not locking:

```bash
node node_modules/@playwright/test/cli.js test e2e/add-a-part-stitch.spec.ts e2e/add-a-part-done.spec.ts e2e/parts-auto-match-stitch.spec.ts --project=dominion-admin --workers=2
```

Also run add-a-part SQL checks in CI (`add_a_part_*_checks.sql`) if you changed RPCs.

## Owner only

- Upload MK Kashiyama **D0051MH** fitment + cross-ref files and `brake pads D0051M family - fitment.csv`.
- Add Ford Fiesta and Mazda factory numbers from OEM catalogues.
- Commit when ready.

## Rules

- Schema changes: **new** migrations only.
- Tests: fixture UUIDs only; never touch live catalog rows.
- Playwright: `node node_modules/@playwright/test/cli.js` (not `npx playwright`).

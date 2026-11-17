# Vehicle pictures + Add vehicle — build rounds

Plan: [../vehicle-pictures-and-add-vehicle-audit.md](../vehicle-pictures-and-add-vehicle-audit.md) (Rev 8, slimmed 16 Nov — start at its §0).
Who does what: **Cursor** does the database, shared code and server rounds. **Claude** ports the Stitch screens (UI rounds) and checks every Cursor report.

| Order | Round | Who | File | Tests it must pass |
|---|---|---|---|---|
| 1 | C1 Database (**passed 16 Nov**, with fix) | Cursor | [cursor-C1-database.md](./cursor-C1-database.md), then [cursor-C1-fix.md](./cursor-C1-fix.md) | T23 + SQL checks |
| 2 | C2 Shared code (**passed 16 Nov**; Claude fixed 3 small items) | Cursor | [cursor-C2-shared-code.md](./cursor-C2-shared-code.md) | T1, T2, T12, T27 + T36 (unit) |
| 3 | C3a Certificates + save rules (**passed 16 Nov**, with fix; Claude fixed 2 small items) | Cursor | [cursor-C3a-certificates-and-save.md](./cursor-C3a-certificates-and-save.md), then [cursor-C3a-fix.md](./cursor-C3a-fix.md) | T13, T14, T17, T17a, T27, T30, T36 |
| 4 | C3b Lookup, worker, fill (**passed 16 Nov**, with fix) | Cursor | [cursor-C3b-lookup-worker-fill.md](./cursor-C3b-lookup-worker-fill.md), then [cursor-C3b-fix.md](./cursor-C3b-fix.md) | T3–T7, T7a, T7b, T7c, T24, T24a, T26, T28, T28b, T33, T34 |
| 5 | C3c Failures, versions, cleanup (**passed 16 Nov**, with fix) | Cursor | [cursor-C3c-failures-versions-cleanup.md](./cursor-C3c-failures-versions-cleanup.md), then [cursor-C3c-fix.md](./cursor-C3c-fix.md) | T8, T9a, T9b, T9c, T10, T24b, T25, T35 |
| 6 | C3d Dominion routes (**passed 16 Nov**, with fix; Claude fixed 2 type errors) | Cursor | [cursor-C3d-dominion-routes.md](./cursor-C3d-dominion-routes.md), then [cursor-C3d-fix.md](./cursor-C3d-fix.md) | T11, T15, T16, T31, T32 (server parts) |
| 7 | UI1 Fleet add-vehicle F1–F13 (**done 16 Nov**, compared with Stitch on the test copy by Claude) | Claude | — | T18, T29, T21 (Fleet) |
| 8 | UI2 Fleet vehicle page + list F14–F16 (**code done 16 Nov**: picture + caption + Change colour on the vehicle page, Fitness/Registration cards with "Checked by" + Update (reuses the add flow, documents only), list thumbnails + card picture, new `GET vehicles/:id/document-checks`; 22 UI tests + 8 route tests pass; compared with Stitch on the test copy by Claude) | Claude | — | T19 |
| 9 | UI3 Dominion Vehicle pictures (**code done 16 Nov**: `apps/admin/src/components/admin/vehicle-catalog/vehicle-pictures/`, page id `vehicle-pictures` under Vehicles; D1 gallery + counts + AI settings + banners + filters + paging, D2 drawer, D3/D5/Remake dialogs, D4 upload panel, D7 states; 10 tests incl. T20 no-fleet-data text scan; fleet-core route manifest refreshed (837); admin vitest now aliases @testing-library/react to its ES build so screen tests use one React; compared with Stitch on the test copy by Claude) | Claude | — | T20, T21 (Dominion) |
| 10 | C4 Reset script + pre-production run + real document check (**NEXT** — waits on owner setup, audit §0) | Cursor + owner | [cursor-C4-preprod-and-reset.md](./cursor-C4-preprod-and-reset.md) | T22 + the audit §11 checks + real documents |

**How a round works:**
1. The owner pastes the round's file into Cursor.
2. Cursor reports with file links and test results only.
3. Claude reads the changed files, checks them against the audit, and either passes the round or writes the fix list.
4. The next round starts only after a pass.

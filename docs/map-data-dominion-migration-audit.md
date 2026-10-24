# Map Data → Roam Dominion (World Maps)

**Rev 5 · 2026-10-24** · Close-out. Earlier revisions are in git.
**Checked against:** the working tree and production (`csfllzzastacofsvcdsc`).

## The rule
Dominion owns the map, and Dominion is law. Each app is its own company: it reads Dominion's map and draws its **own** zones on top (Rush: delivery and no-go zones). Apps never edit borders and never see each other's zones. Dominion is the only copy of Jamaica.

## Status
Rev 3 items O‑1 to O‑10 stay closed. N‑1, N‑2, N‑3, N‑4, N‑5, G1, and G2 are closed below. Rides is signed and deployed. G3 could not be run. G4 is confirmed in the Rush screen itself; the live Rush site updates when that app is synced. G5 stays open until 7 Nov 2026 and a separate go-ahead.

The nightly repair runs Sunday 25 Oct 2026 at 1:15 AM Jamaica time. Delivery is deployed with the repair, so a copy that already matches is left alone.

---

## Closed

| ID | Result | Proof |
|---|---|---|
| **N‑2** | The two publish tests are on the main check. | `.github/workflows/ci.yml` delivery Deno step lists `geoPublishRules.test.ts` and `geoManaged.test.ts`. |
| **N‑1** | The nightly repair rewrites Rush only when its copy differs, and counts only a real save. | `shouldRepairRushCopy` in `geoPublishRules.test.ts`. Live repair on 24 Oct 2026 returned `healed: 0`, `failed: []` while production was already in step. |
| **G1** | https://roamdominion.co is serving World Maps. | The live app chunk contains “World Maps” and “world-parishes”. The newer restore and drawing wording is in the working tree and is not on that site yet. It goes out when Dominion is synced. |
| **G2** | A Rush ops person cannot write the map. Reads still work. | A temporary `dash_ops` sign-in, then deleted. Import, save version, preview, publish, and edit place each returned 403 “Permission required: platform.geo.write”. Parish list and parish borders returned 200. |
| **N‑4** | One publish at a time. A lock older than 10 minutes is treated as abandoned. | Migration `geo_publish_guard` is on production. A test claim succeeded, a second claim while it was held failed, and the lock was released. World Maps shows “Another publish is still finishing. Wait a minute and try again.” |
| **N‑5** | Preview errors are visible. Labels refresh after publish. Drawing starts from the live border. Retired versions say how to restore them. | `WorldMapsPage.tsx`. Checked in the working tree. Not on roamdominion.co until that site is synced. |
| **N‑3** | Rush reads Dominion for the town list. It cannot import, delete, or redraw an official border. A restore of an old Rush version leaves the official border in place. | Town list uses `geo.boundaries`. Creating a town uses `geo.current_boundary`. `commit_boundary_publish` no longer writes the old border table (migration `geo_publish_drops_old_border_sync`). The server answers 410 for those border writes. `scripts/geo-phase5-precheck.mjs` finds no `admin_boundaries` under `supabase/functions` or `packages`, and CI runs that check. |

The positive repair proof (make one town stale, repair it, see `healed: 1`, run again, see `healed: 0`) was not run. A proof database was created and its migrations failed before the map tables existed. That database was deleted. Production was not used for the experiment.

## Still open

- **G3.** Not run. The same proof database failed before any town could be published. Do not publish a test border on production. The publish rules themselves are covered by `geoPublishRules.test.ts` (a live store is not moved onto an inactive market; a failed save does not bump the generation).
- **G4.** Checked 24 Oct 2026 on the local Rush console, signed in as the Rush owner, at desktop and at a 375-wide layout. Kingston → Downtown → Manage zones: the official border says “view only,” and the menu offers a service area, “Don’t deliver near here,” and a non-delivery zone. Import and “delete border” are gone. Parish rows say “Edit in Dominion.” Ops, both courier seats, and analyst open this same screen read-only. The in-house buyer and support cannot open Markets. The Dominion owner changes a border in World Maps. The live Rush site shows this after that app is synced.
- **G5.** Quiet period 24 Oct through **7 Nov 2026**. The drop lines in `scripts/geo-phase5-contract.sql` stay commented. Do not run them without a separate go-ahead. The app-code check is already in CI.

## Rides
Sadiki signed `docs/geo-fare-parity.md` on 24 Oct 2026: “I accept the switch to Dominion borders.” Re-checked the same day: 4 live fare rules, all `jamaica`. Rides was deployed the same day. Re-check a pin before the first parish or town fare.

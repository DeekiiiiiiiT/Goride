# Toll Phase 3 — screens audit (outstanding only)

**Rev 6 · 13 Nov 2026.** Only what is left to do. Everything finished (Rev 1–4: screens, click-through, fixes R4-01…R4-23) is in git history — last commits `ac3c2eb0`, `f0be713b`, `9892fe11` on branch `parts-auto-match` (nothing pushed).

## Start here (new chat)
- The owner gave **full permission** to do every step below in order (commit, review, live SQL, deploy). Step 6 is the owner's choice.
- Only commit toll / Week Recon files. Other work in the folder (service items, parts, maintenance, `packages/types`, `routes.generated.json`, `fleet-ops/index.ts`, `ci.yml`, `apps/admin/...partSourcingService.ts`, `part_sourcing_routes.ts`) belongs to other chats.
- The local database is shared with other chats; check nothing else is running `db reset` / `pnpm test:toll` first.
- Test-copy setup (if needed): `docs/toll-build/p3r4-testcopy-setup.sql` (header says how). After a cold start, run `analyze;` in the local DB or `pnpm testcopy` times out. Run `pnpm install` after any Deno run.
- Owner works in plain words; deploy only as listed below.

## Still to do, in order
1. ~~`/code-review`~~ **DONE 13 Nov (Rev 6):** 10 findings, all real, all fixed (take-back sends its amount + only same-amount paybacks offered; take-back reference locked + "recorded" check matches platform; take-backs card on any unsealed week; empty state counts paybacks/kept/pairs/blockers; receipts blocker label; Step 1 normal outcomes not "Problem"; failed v2 switch read → old path; step-3 auto-complete tries once; receipt amount fixed before the check; car's own plate beats aliases). `pnpm test:toll` green from reset, Fleet recon vitest 79/79.
2. **Live SQL file** for `supabase/migrations/20261113162537_toll_v2_screen_reads.sql` (all-or-nothing, with its logbook line). It was edited after commit `ca100929` (report amounts, duplicate decider, `public.fleet_vehicles` view refresh for `plate_aliases`) — build the file from the current version, prove it on a local copy (rebuild without it, apply, all toll SQL tests pass), then the owner runs it (the Supabase tool wasn't connected this session).
3. **Deploy** (after the live SQL): push to `main`; edge **`fleet-core`** and **`fleet-toll`**; Fleet site. Order matters: the SQL first — `fleet-core` writes `plate_aliases` on every car save and needs the view column.
4. **Take-back on screen** (the three week cases). Not checkable until a v2 company's open toll week has ended (Week Recon only opens ended weeks). Money rules already covered by `toll_v2_carry_forward.sql` + step tests.
5. **Delivery week page** with v2: its readiness check is a Rush function the test copy doesn't run; server side already reads step 3 complete. Check on live or with Rush functions served.
6. **First company on v2** — owner decides when and which fleet (Phase 3 exit, `docs/toll-architecture.md` Part D).

## Known, not Phase 3 (leave unless the owner asks)
- **Phase 4:** Reopen tolls leaves Week Recon step 3 "Complete" until the week refreshes; driver pay stays blocked until re-sealed.
- The Uber card shows only after a fleet's first Uber import (`hasUberDrivers` counts trips/batches, not drivers' Uber ids).
- The old Uber trip import sends the plate as the car id and fails the catalogue check when a car's id isn't its plate (seen on the local test car only).
- Sealed-ribbon text wraps awkwardly at 390px (cosmetic).

## Rules that still apply when changing these screens
Stitch decides the look; content only from the reads; no ids or codes on screen; Undo / Cancel / Reject / Reopen = red outline; no browser pop-ups; times "28 Aug, 12:22 PM"; money "J$4,250.00"; a company not on `tolls_v2` keeps today's screens.

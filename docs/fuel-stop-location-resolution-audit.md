# Audit: Fuel stop location resolution

**Rev 5 · 2026-10-19** · Status: **R1–R4 + smaller implemented in code; prod pinConfirmed backfilled; deploy fleet functions + Dominion, then Re-heal seeded aliases** · Project `csfllzzastacofsvcdsc`

**Problem (Rev 1):** a driver logged a fill 397 m and 4 minutes after leaving FESCO Spanish Town Road (verified). It became a new "Unknown Vendor" location, because the card statement's name for the station couldn't be translated into the verified station.

## Verified closed (Rev 2 → Rev 4)

O1–O8, G1–G4, G7 and the smaller fixes are confirmed in code and production: claims are limited to stations within 1 km and conflicts go to review; admin/seed aliases are protected; re-heal heals both halves of a pair; RLS is `app_metadata` only (live); the migration name matches production; provisional fills appear in the queue with a confirm action; bulk LATE LOG link; Move pin panel; driver sheet order and retry fixed. 32 Deno + 3 vitest tests pass and are listed in `ci.yml`. Driver `tsc` is 431 (the Rev 2 error is fixed); fleet `tsc` is 503 (unchanged, none in the touched files).

## Rev 5 closure (this ship)

| # | Issue | Status |
|---|---|---|
| R1 | `pinConfirmed: false` on Super Lube / United; GPS / near-miss skip; Move pin sets `pinConfirmed: true`; Dominion badge | **Code + prod SQL backfill** |
| R2 | Admin `POST .../admin/reheal-merchant-alias` + Silent Attach “Re-heal seeded aliases”; seed SQL runbook note | **Code** — run button after fleet deploy |
| R3 | Sticky `STATEMENT_MISMATCH` / `DRIVER_CLAIM_CONFLICT` via `isAttachProtected`; provisional-fills returns those reasons + filters | **Code** |
| R4 | Weekly workflow runs `scripts/check-fuel-stop-location-health.mjs` (fail C1–C5/C9; warn C6–C8) | **Code** — needs `SUPABASE_DB_URL` secret |
| Smaller | KV fallback only on SQL error; `escapeIlike` for `()` `.`; unpaired statement merchant heal on import/promote; dormant geofence prompt removed | **Code** |

---

## Must fix (historical — Rev 4)

| # | Issue | Evidence | Fix |
|---|---|---|---|
| R1 | **Super Lube and United Petroleum are *verified* stations with placeholder pins.** Verified stations take part in GPS matching. United (18.0062, −76.7888, R = 100 m) sits **119 m from TotalEnergies New Kingston** (R = 75 m), so a fill 80–100 m from those pumps can auto-verify, sign and lock as United Petroleum. Pin calibration can't fix this: it needs GPS-verified fills at the station, and a wrong pin never gets any | prod `fleet.stations` `god-super-lube-service-centre`, `god-united-petroleum-lyndhurst` | Add a `pinConfirmed: false` flag and skip those stations in `applyStationMatch` / near-miss candidates (merchant/alias matching still works). Set real pins by hand in Dominion, then flip the flag |
| R2 | **The 11 Super Lube / United statement rows were never healed.** The aliases were seeded with SQL, which skips the edge re-heal in `upsertStationMerchantAlias` | 10 SUPER LUBE + 1 UNITED approved rows still `statement_vendor`, no station | Re-run them through the edge (an admin "re-heal alias" action, or Silent Attach). Add a re-heal call to any SQL seed runbook |
| R3 | **Statement-mismatch and claim-conflict flags aren't sticky, and no queue shows them.** (a) Both set `locationStatus: review_required`, which the heal and re-heal treat as healable, and `isAttachProtected` doesn't cover them. The next pair heal or alias re-heal attaches both halves to the statement station and silently clears the fraud signal. (b) `/admin/provisional-fills` returns only `provisional`, and the spatial queue only `gps_ambiguous`. The queue has labels for these reasons, but no row ever arrives | `fuel_jaa_station_heal.ts` (mismatch check only for `verified`/`provisional`), `station_merchant_aliases.ts` healable set, `station_attach_meta.ts:16`, `fuel_controller.tsx` provisional-fills | Protect auto-attach when `stationResolution.reason` is `STATEMENT_MISMATCH`/`DRIVER_CLAIM_CONFLICT` (admin confirm only). Have the endpoint also return those two reasons, with their own filter |
| R4 | **The weekly health workflow runs no SQL.** It loops `echo` over C1–C9 and exits 0, so nothing alerts | `.github/workflows/fuel-stop-location-health.yml` | Run `psql "$SUPABASE_DB_URL" -f` per check, fail on rows, and add the secret. Note: C6–C8 are reports, not 0-row checks |

## Smaller (historical)

- `/admin/provisional-fills` and alias re-heal fall back to a **full KV scan whenever SQL returns 0 rows**. That's the normal healthy result, so every queue open does a full scan. Fall back only on a query *error*.
- `escapeIlike` doesn't handle `(`, `)` or `.`, which are common in issuer names (e.g. "ALWIL COMPANY LTD (FESCO)"), so the PostgREST `or()` breaks and falls to the scan.
- Statement rows with no driver pair never heal: the heal runs only at pair link. Today that's 2 FESCO BEECHWOOD and 1 RUBIS WATERLANE rows, and C2 will keep listing them. Run the merchant heal on import for unpaired rows too.
- The geofence arrival prompt is dormant. It runs only while the expense screen is open, nothing in the app ever sets `roam:driver:fuelGeofencePrompt`, and it only logs to the console. Either wire it to LocalNotifications with a settings toggle, or remove it.
- The `mock` flag will stay unset. The Capacitor geolocation plugin doesn't expose it, which is accepted. Rely on C5 (statement vs GPS).

## Ship / watch (Rev 5 ops)

1. Deploy fleet edge functions + Dominion/admin so R1–R3 APIs and UI are live.
2. In Dominion → Resolution Queue → Silent Attach: **Re-heal seeded aliases** (heals the 11 Super Lube / United rows).
3. Confirm GitHub secret `SUPABASE_DB_URL` for `fuel-stop-location-health` workflow; run `workflow_dispatch` once.
4. Ship the driver store build with the claim sheet (Android ≥ 1.0.29). Until then drivers keep the old GPS settings.
5. On the first real Gas Card fill after that, check that `metadata.stationResolution`, `driverClaim` and `locationMetadata.fixAt` (≠ submit time) are present.
6. After R1–R2 live: C2 should drop toward the unpaired residual; C1, C3, C4 and C9 should be 0.

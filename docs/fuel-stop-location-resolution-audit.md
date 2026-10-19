# Audit: Fuel stop location resolution

**Rev 7 · 2026-10-19** · Status: **Done** · Project `csfllzzastacofsvcdsc`

**Problem (Rev 1):** a driver logged a fill 397 m and 4 minutes after leaving FESCO Spanish Town Road (verified). It became "Unknown Vendor", because the card statement's name for the station couldn't be translated into the verified station.

**Verified closed:** Rev 1–6. Production aliases Super Lube → Jampet / United → Unipet (`admin_link`). Nineteen GOD-attached statement rows re-healed via edge. GOD placeholders deleted. C2 clear except Dominion hand-holds. C5 fuzzy merchant gate live. Health job uses passworded `SUPABASE_DB_URL` **or** `SUPABASE_ACCESS_TOKEN` + CLI login role.

---

## Rev 6 → 7 close-out

| Item | Result |
|------|--------|
| Super Lube alias | `8cbe8d0e-06a7-471b-b19b-39435cfbd331` (Jampet), `admin_link` |
| United alias | `st_145e8645` (Unipet), `admin_link` |
| Re-heal | 18 Super Lube + 1 United via `POST …/admin/reheal-merchant-alias` |
| GOD stations | Deleted (`god-super-lube-*`, `god-united-*`) + KV keys |
| C2 heal | `91aff97e` → FESCO Beechwood; `fb596ac9` → RUBiS Water Lane (+ other open FESCO rows) |
| Hand-review | `c12c265e`, `cd281fdb` stamped `metadata.handReview` — **do not auto-heal**; Dominion: keep pair / unlink / confirm station |
| C5 | Extended with `pg_trgm` ≥ 0.88 fuzzy alt-station gate |
| CI | fleet-fuel manifest 208; `station_attach.test.ts` in ci.yml; Evidence `metadata` type |
| Health | CLI login-role fallback when DB URL has no password |

**Ops rule:** before creating a station for an unknown issuer name, check where that name's **paired driver fills** were GPS-verified. Never invent GOD stations for issuer legal names until that check.

## Watch

- Driver store rollout (Android 1.0.29): first Gas Card fill should show `stationResolution`, `driverClaim`, `fixAt` ≠ submit time.
- Dominion hand-review queue for `c12c265e` / `cd281fdb` (FESCO vs Jampet ~19 km).
- Optional: replace GitHub `SUPABASE_DB_URL` with a full passworded Postgres URI (CLI path works without it when `SUPABASE_ACCESS_TOKEN` is set).
- Pre-existing C4 gpsAlias drift (3 rows) is **report-only** in the health job until a dedicated alias cleanup.

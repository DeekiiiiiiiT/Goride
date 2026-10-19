# Audit: Fuel stop location resolution

**Rev 9 · 2026-10-19** · Status: **Closed in code. Commit + deploy `fleet-fuel` and Dominion, then watch the driver rollout** · Project `csfllzzastacofsvcdsc`

**Problem (Rev 1):** a driver logged a fill 397 m and 4 minutes after leaving FESCO Spanish Town Road (verified). It became "Unknown Vendor", because the card statement's name for the station couldn't be translated into the verified station.

**Closed:** Rev 1–8. Rev 9 makes `handReview` enforced and visible:
- `isAttachProtected` blocks auto-heal and re-heal on `metadata.handReview`.
- `/admin/provisional-fills` returns those rows (`reason=HAND_REVIEW`). Dominion has a **Hand review** filter with *Confirm station*, *Link* (works without GPS, "Remember name" off by default) and *Dismiss* (`POST /admin/dismiss-hand-review`).
- Confirm or Dismiss moves the stamp to `handReviewResolved`.
- 46 Deno tests pass (2 new), fleet `tsc` 503, edge manifest check OK.

**Ops rule:** before creating a station for an unknown issuer name, check where that name's paired driver fills were GPS-verified.

---

## Remaining

1. **Ship Rev 9:** commit, deploy `fleet-fuel` (route manifest 209) and redeploy Dominion. Until then `cd281fdb` is still unprotected in production.
2. **Review the two pairs in Dominion → Hand review:** `c12c265e` (already on FESCO Beechwood) and `cd281fdb` (no station), both FESCO BEECHWOOD statements against Jampet driver logs about 19 km apart. Confirm, Link or Dismiss each.
3. **Watch the driver rollout (Android 1.0.29).** On the first Gas Card fill, check that `stationResolution`, `driverClaim` and `fixAt` (≠ submit time) are present.
4. **C4:** 3 gpsAlias rows more than 150 m from their pin. Warn-only until an alias cleanup.

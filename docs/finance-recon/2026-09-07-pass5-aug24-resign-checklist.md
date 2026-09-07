# Pass 5.3 — Aug 24 re-sign checklist

**Org:** `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823`  
**Driver:** `73e5b1dc-01b4-45ee-a34a-25a3256b9841`  
**Week:** `2026-08-24`

Prerequisites (Pass 5.0):
- [ ] Cutover artifacts committed (toll zero-N/A seal + pass4 docs) when PO asks
- [ ] Shadow still PASS for `2026-08-10`…`2026-08-31`
- [ ] Engine-compare + drift store live (Pass 5.1) so close blockers can fire

Re-sign steps:
1. `POST .../settlements/week-close` with `{ weekKey: "2026-08-24", reason: "pass5-resign-after-statement-cutover" }` (admin JWT + org).
2. Confirm `metadata.periodFrozen` / `financeCore.signedAt` / close hash set on DFP.
3. Read period detail — no `hashMismatch`.
4. Archive result in `2026-09-07-pass5-aug24-resign.md`.

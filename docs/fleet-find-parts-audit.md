# Roam Fleet · Find parts + Dominion Pending catalog — audit (Rev 47, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only. Don't mark anything done here or in the README.

**Rules:**
- Information only, parts only.
- No fleet ids or plates in Dominion.
- Port Stitch exactly; skip lists hold only sample values and excluded strings.
- Never invent catalog facts.

**Verified this round:**
- R30, R31 and R32 are committed and pushed (`3c19bb18`, `122695dc`, `eecad94a`), and both tests are in CI.
- partsouq.com shows `blocked_at` 21:34, and "Blocked since" is live on roamdominion.co.
- The Drive belt Retry at 21:35 checked masuma.parts and got HTTP 200 with the number and car confirmed. The job is waiting for the owner's review.
- The local Dominion server was restarted, and the Parts tab loads (200).

---

## Open

**R34 — The migration file name doesn't match production (5th time).**
- **Problem:** the repo has `20261101221500_catalog_trusted_source_blocked_at.sql`, but production recorded it as **`20261101213434`** `catalog_trusted_source_blocked_at`. `supabase db push` will try to apply it again, and CI's replay order differs from production.
- **Fix:** rename the file to `20261101213434_catalog_trusted_source_blocked_at.sql`, then commit and push. From now on, take the version from `schema_migrations` after applying, before committing.

---

**Builder prompt:** "Read docs/fleet-find-parts-audit.md. Fix R34, commit and push. Don't mark anything done."

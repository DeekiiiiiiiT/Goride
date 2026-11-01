# Roam Fleet · Find parts + Dominion Pending catalog — audit (Rev 39, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only. Don't mark anything done here; it is re-checked each round.

**Rules:**
- Find parts is information only and parts only.
- Dominion never shows customer names, plates or fleet ids.
- Port Stitch exactly; never edit `docs/stitch/`; no hidden word lists.
- Never invent catalog facts.

**Verified this round:**
- R1–R13 code is in. The fix migrations are live, `catalog-research` v1 is deployed (Gemini fix in), and platform-catalog v163 has the new routes.
- The Drive belt request is backfilled into a job.
- 17 Deno tests pass.
- Research is **on** in production (`enabled = true`, shadow mode on).

---

## Open

**R16 — Critical: the worker has never researched anything.**
- **Seen live:** since 16:30 the job has stayed `queued` with 0 attempts. The cron gets a 500 (`"[object Object]"`) or `skipped: busy` every minute.
- **Cause 1:** `catalog_research_claim` reads the queue with `pgmq.read(...) AS r(msg_id bigint, …)`. On pgmq 1.5 that fails with *"a column definition list is redundant for a function returning a named composite type"*. Both reads (priority and main) have it.
- **Cause 2:** the claim takes a **session** advisory lock (`pg_try_advisory_lock(908871234)`) before that error. The error skips the unlock, so the lock stays on a pooled PostgREST connection. Right now pid 1303882 (idle) holds it, and every claim landing elsewhere returns `busy`.
- **Cause 3:** the worker turns database errors into `"[object Object]"`, so the logs don't show the reason.
- **Fix:**
  - **Reads:** remove the column lists (`SELECT r.msg_id, r.read_ct, r.message INTO … FROM pgmq.read('catalog_research', 600, 1) r LIMIT 1`).
  - **Lock:** switch to `pg_try_advisory_xact_lock` with a **new** key (so the stuck session lock no longer matters). It frees itself when the call ends, so remove the `pg_advisory_unlock` calls. The R4 "busy while a job is researching" check still stops overlapping jobs.
  - **Error text:** in `catalog-research/index.ts` and the worker, report `error.message` (and `details`/`hint`) for Supabase errors.
- **Confirm:** within 2 minutes the Drive belt job has a `research` event, then a proposal, then `needs_review`.

**R17 — The fix migration's file name doesn't match production.**
- **Problem:** the repo has one file, `20261102120000_catalog_research_fixes.sql`. Production recorded 8 versions, `20261101162715` to `20261101163028`, with different names. The next `db push` or the migration-replay check will clash.
- **Fix:** match the repo to production by renaming or splitting the file into those 8 versions, or run `migration repair` so the history matches. Put the R16 fix in a new file and apply it under the same version.

**R18 — The SQL is never tested.**
- **Problem:** the B5 database cases have no test: claim while busy, the 4th read → failed, promote twice, no downgrade, "Research next" first, daily limit. That gap let R16 ship.
- **Fix:** add a SQL test step to the migration-replay workflow (`verify-migrations-replay.yml`, which already builds a Postgres with the migrations). It enqueues a job, calls `catalog_research_claim()` and asserts each case. Also add `catalog_research_export.test.ts` to the Deno list in `ci.yml`.

**R14 — 7 screens are still not started.**
- S10e, S10h and FP13 are "In progress"; S10f, S10g, S10i, S10j, FP14, FP15 and FP16 are "Not started".
- Port them from the HTML in `docs/stitch/`, following the porting rules below. Then take pictures, mark each row **Ported** at 100%, and remove the superseded S10b/S10c/S10d/FP10 rows and references.

**R3 — Commit.** Nothing since 62c5f6ce is committed. Commit everything with the R16/R17 fixes, then deploy `catalog-research`, platform-catalog, fleet-core and both sites.

**A1 — Owner check:** on roamdominion.co, open a request and click **Copy for search**.

---

### Porting rules (S10e–S10j, FP13–FP16)
These are the only differences from "port exactly". Skip lists may contain only the strings named here.

**Dominion**
- **S10f / S10g / S10i:** the drawer only. Behind it goes S10e (or the Vehicles tab). Not built: "Pending Catalog Resolution", Cross-Refs / Discrepant OEM Fits / Autonomous Ingestion Log tabs, "Confidence Matrix", "Auto-Matched 42", "Avg Resolve SLA", "Re-run Scrapers".
- **S10e:**
  - Resume/Pause Dispatcher = research on/off.
  - Queue Priority = "Research next".
  - Export CSV and Reprocess All Queued = the R13 routes.
  - The card captions stay as text.
- **S10g:** "5 of 5 passed", the step bar and "3 fleets notified" come from checks, events and notices.
- **S10h:**
  - `ENGINE_REV` = worker constant; `LATENCY` = last run.
  - `STATUS` = NOMINAL / DEGRADED / PAUSED.
  - Pages confirmed per domain; events = health warnings + auto-recovery; the incident archive = 24 hours of failed or retried jobs with Retry.
- **S10i:**
  - "Confidence 99.4%" becomes "{n} of {n} sources agree".
  - The excerpt = real fetched lines; no "Integrity Hash".
  - The Jurisdiction filter uses `market`; the "Zero customer PII" row is a real scan.
- **S10j:** the four panels only, without the "States Matrix" page. No "Fleet Origin" column; use the "Asked by" count. Queued rows show "—" for the number. Trace = the failed request id.

**Fleet**
- **All four screens:** the existing Fleet frame and footer. Not built: "Kingston Hub #01", "PARTS PROCUREMENT & TELEMETRY FITMENT · REGION JA-01", "EPC VERIFICATION PROTOCOL", the Kingston Fleet Core footer, and the FP16 bottom tab bar.
- **FP13:**
  - "In line · {n} requests ahead".
  - Turnaround = this organisation's 30-day median, hidden under 5.
  - "Checked against {domains}".
  - "KGN-JA-774" = the request's short id.
- **FP14:**
  - Only the notice bar is new on Frame A.
  - Frame B spec rows show only `part_master.metadata.specs`, and are hidden when empty.
  - "100% SPEC FIT" / "CERTIFIED" become "Fits this version".
  - VIN only if stored.
  - "Request variant research" = "Ask Roam to find another option".
- **FP15:**
  - Not built: "regional distributors", "customs and freight fees", "18 Caribbean hub distributors", "Priority Tier 1", "Auto-querying EPC: JP-OEM, HK-PARTS, DENSO-CARIB", "EPC Engine: Active (KGN-L03)", "Prioritized by Community Demand".
  - Average Resolution and Batch Match Rate are computed, and hidden under 5.
  - "Save as draft for tomorrow" saves on the server.
  - Reset countdown to midnight Jamaica time.
  - The request short id.
  - The hub chip = vehicle group or hidden.
  - "Compatibility: OEM …" = the **Old part number** field.

---

**Builder prompt:** "Read docs/fleet-find-parts-audit.md. Fix R16 first and confirm the Drive belt job reaches needs_review, then R17, R18, R14, commit and deploy (R3). Don't mark anything done in this doc."

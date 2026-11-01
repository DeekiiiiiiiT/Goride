# Roam Fleet · Find parts + Dominion Pending catalog — audit (Rev 41, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only. Don't mark anything done here or in the README; it is re-checked each round.

**Rules:**
- Find parts is information only and parts only.
- Dominion never shows customer names, plates or fleet ids.
- Port Stitch exactly; never edit `docs/stitch/`; no hidden word lists.
- Never invent catalog facts.

**Verified this round:**
- Committed and pushed (0cc37efa).
- The worker now claims jobs: the Drive belt job was picked up at 16:55, the stuck lock is gone, and real errors are logged.
- The SQL claim/promote checks run in the migration-replay workflow.
- **First real research run (17:16):** after the owner topped up Gemini, the Drive belt job reached `needs_review` with 2 proposals (Toyota 90048-31103, MASUMA 6PK-1195).

---

## Open

**R21 — No source is ever checked, so nothing can be added automatically.**
- **Seen live:** all 4 sources on the Drive belt proposals were dropped as `untrusted` without being opened. Three are Google grounding links (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`). The worker judges the domain from that link **before** following it, so every grounding source is thrown away. The fourth is `masuma.parts`, which isn't on the trusted list.
- **Fix:**
  - in `catalog_research_worker.ts`, open any `vertexaisearch.cloud.google.com/grounding-api-redirect/` link first (follow redirects; 10-second limit);
  - take the domain from the final `res.url`, then run the trusted-domain check and the page checks on that page;
  - store both the redirect link and the final URL in the source.
- **Test:** a Deno case where a redirect lands on `partsouq.com` and counts, and one landing on an untrusted site that is dropped with its real domain shown.
- **Confirm:** Retry the Drive belt job from Dominion. Its sources show real domains with `fetched_ok` set.

**R19 — A billing or key error burns the request.**
- **Problem:** a 402 counts as one of the job's 4 tries. With no credit, every queued request ends up `failed` and needs a Retry by hand.
- **Fix:** in `catalog_research_worker.ts`, treat Gemini 401/402/403/429 as a **provider** problem, not a job problem:
  - pause research at once, with the reason "Gemini credits used up" (402), "Gemini key rejected" (401/403) or "Gemini rate limit" (429);
  - archive the message and re-send the job fresh, so its try count isn't used up;
  - put the job back to `queued`.
- The S10e strip and S10h show the reason. Auto-resume still applies to 429 only; 401–403 wait for **Resume**.
- **Test:** a Deno case for each code.

**R20 — The latest fix migration's name doesn't match production.**
- **Problem:** the repo has `20261101163029_catalog_research_claim_pgmq15_xact_lock.sql`; production recorded `20261101165409`.
- **Fix:** rename the file to `20261101165409_catalog_research_claim_pgmq15_xact_lock.sql`.

**R14 — The screens are not at the design. The checker scores:**

| Row | Score | README says |
|---|---|---|
| S10e Parts tab | 53% | Ported |
| S10f Drawer · needs review | 44% | Ported |
| S10g Drawer · added automatically | 36% | Ported |
| S10h Research settings | 70% | Ported |
| S10i Vehicle review drawer | 33% | Ported |
| S10j States | 38% | Ported |
| FP13 Your requests | not scored: the row lists `findPartsViewModels.ts`, which the checker refuses | In progress |
| FP14 Now on file + Results | 11% | In progress |
| FP15 Request sent + limit | 20% | In progress |
| FP16 Phone | 46% | In progress |

- **Fix:**
  - set the six S10 rows back to "In progress";
  - port each screen until `node scripts/stitch-fidelity.mjs --report` shows 100%. The skip list may hold only the strings the porting rules exclude;
  - for FP13, fix the README row so the checker runs.
- **Real items still missing, for example:**
  - **FP14:** "See the part", "3 parts you asked for are now on file · See them →", the Frame B spec rows (shown only when stored), "Checked against 2 catalogues", "Sister & aftermarket options".
  - **FP15:** "Daily request limit reached · 30 / 30 used", "Try again tomorrow", "Save as draft for tomorrow", "View your 30 active requests", the reset countdown, and the Old part number field.

---

### Porting rules (S10e–S10j, FP13–FP16)
These are the only differences from "port exactly". Skip lists may contain only the strings named here.

**Dominion**
- **S10f / S10g / S10i:** the drawer only, over S10e (or the Vehicles tab). Not built: "Pending Catalog Resolution", Cross-Refs / Discrepant OEM Fits / Autonomous Ingestion Log tabs, "Confidence Matrix", "Auto-Matched 42", "Avg Resolve SLA", "Re-run Scrapers".
- **S10e:** Resume/Pause Dispatcher = research on/off; Queue Priority = "Research next"; Export CSV and Reprocess All Queued are real; the card captions stay.
- **S10g:** "5 of 5 passed", the step bar and "3 fleets notified" come from checks, events and notices.
- **S10h:** `ENGINE_REV`, `LATENCY` and `STATUS` are real; pages confirmed per domain; events = health warnings + recovery; the 24-hour incident archive with Retry.
- **S10i:** "Confidence 99.4%" becomes "{n} of {n} sources agree"; the excerpt = real fetched lines, without "Integrity Hash"; the Jurisdiction filter uses `market`; the "Zero customer PII" row is a real scan.
- **S10j:** the four panels only, without the "States Matrix" page. No "Fleet Origin" column; use the "Asked by" count. Queued rows show "—"; trace = the failed request id.

**Fleet**
- **All four screens:** the existing Fleet frame and footer. Not built: "Kingston Hub #01", "PARTS PROCUREMENT & TELEMETRY FITMENT · REGION JA-01", "EPC VERIFICATION PROTOCOL", the Kingston Fleet Core footer, the FP16 bottom tab bar, and the Stitch "Frame A / Frame B / flow state" captions.
- **FP13:** "In line · {n} requests ahead"; the turnaround median, hidden under 5; "Checked against {domains}"; the request's short id.
- **FP14:** only the notice bar is new on Frame A, with the area cards taken from the existing page. Spec rows show only `part_master.metadata.specs`. "100% SPEC FIT" / "CERTIFIED" become "Fits this version". VIN only if stored. "Request variant research" = "Ask Roam to find another option".
- **FP15:**
  - Not built: "regional distributors", "customs and freight fees", "18 Caribbean hub distributors", "Priority Tier 1", "Auto-querying EPC: JP-OEM, HK-PARTS, DENSO-CARIB", "EPC Engine: Active (KGN-L03)", "Prioritized by Community Demand".
  - Average Resolution and Batch Match Rate are computed, and hidden under 5.
  - Save as draft is stored on the server; the countdown runs to midnight Jamaica time; the short id; the hub chip = vehicle group or hidden; "Compatibility: OEM …" = the Old part number field.

---

**Builder prompt:** "Read docs/fleet-find-parts-audit.md. Fix R21, R19 and R20, then port the R14 screens until the checker shows 100% on each row. Set the README rows to In progress until then. Commit and deploy. Don't mark anything done."

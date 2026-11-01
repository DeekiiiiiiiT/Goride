# Roam Fleet · Find parts + Dominion Pending catalog — audit (Rev 46, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only. Don't mark anything done here or in the README.

**Rules:**
- Information only, parts only.
- No fleet ids or plates in Dominion.
- Port Stitch exactly; skip lists hold only sample values and excluded strings.
- Never invent catalog facts.

**Verified this round (R30 works live):**
- **20:33:** the first try had no search, so Roam retried. It still found nothing and went to Couldn't find, with nothing saved.
- **20:34 Retry:**
  - `groundingChunks: 3, sourceUrls: 3`;
  - **first page ever confirmed:** masuma.parts returned HTTP 200 with `fetched_ok`, `number_found` and `car_found` for Masuma 6PK-1195 · Roomy M900A;
  - the old sourceless proposals are gone, and the job is in review.

---

## Open

**R31 — Commit the R30 work.**
- The R30 work is live but not committed. The changes:
  - `catalog_research_gemini.ts`, `catalog_research_worker.ts` and `fleet_find_parts_routes.ts`, plus their tests;
  - new files `catalog_research_part_research.ts`, `catalog_research_part_research.test.ts` and `catalog_research_not_found.ts`.
- **Fix:**
  - add `catalog_research_part_research.test.ts` to the Deno test list in `ci.yml`;
  - commit only these files (leave the inventory and maintenance changes out), then push.

**R32 — partsouq.com refuses every page fetch, so it can never confirm a part.**
- **Seen live:**
  - both Toyota 90048-31103 sources were partsouq pages, and both returned **HTTP 403**;
  - partsouq.com returns 403 even on its home page; amayama.com, megazip.net, 7zap.com and rockauto.com return 200;
  - so a Toyota OEM number found on partsouq stays at 0 confirmed sources and can never reach 2.
- **Fix:**
  - add `blocked_at` to `catalog_trusted_source`;
  - when a domain's last 2 fetches are both 403, set `blocked_at`, log an event, and leave that domain out of the "Prefer catalogue results on" list in the search prompt;
  - in Research settings, show "Blocked since {date}"; turning the Active switch off and on again clears it;
  - in the same migration, set `blocked_at = now()` for partsouq.com, so the next search prefers amayama.com, megazip.net and 7zap.com for OEM numbers.
- **Test:** a Deno case where two 403s in a row block the domain and drop it from the prompt, and one where a 403 followed by a 200 does not.
- **Confirm:** Retry the Drive belt job. The search prompt no longer lists partsouq.com, and the Toyota candidate has a source from a fetchable catalogue (200 or a plain "number not on page").

**R33 — Local Dominion (localhost:3001) shows "Cannot find module … vite … dep-CvfTChi5.js".**
- **Seen:** the admin dev server (PID 17072) has been running since **31 Oct 11:11**. Packages were reinstalled today at **15:43–15:46**, and pnpm replaced the vite folder (`vite@6.3.5_@types+node@20.1_cf19…` is now `vite@6.3.5_@types+node@20.19.40_…`). The old server still loads files from the deleted folder.
- **Not a code bug:**
  - live roamdominion.co returns 200;
  - `pnpm exec vite --version` in `apps/admin` works (6.3.5).
- **Fix:**
  - stop the old dev server (Ctrl+C in its terminal, or end PID 17072);
  - in `apps/admin`, run `pnpm dev`.
  - After any `pnpm install`, restart every running dev server.
- **Confirm:** `localhost:3001/?page=pending-motor-vehicles&tab=parts` loads the Parts tab.

---

**Builder prompt:** "Read docs/fleet-find-parts-audit.md. Fix R31 and R32, commit only these files, push, deploy catalog-research and the admin site, then Retry the Drive belt job and confirm the R32 check. Do R33: restart the admin dev server and confirm the Parts tab loads. Don't mark anything done."

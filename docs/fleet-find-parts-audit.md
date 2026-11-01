# Roam Fleet · Find parts + Dominion Pending catalog — audit (Rev 43, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only. Don't mark anything done here or in the README; it is re-checked each round.

**Rules:**
- Information only, parts only.
- No fleet ids or plates in Dominion.
- Port Stitch exactly; skip lists hold only sample values and strings the rules exclude.
- Never invent catalog facts.

**Verified this round:**
- R22 is fixed and live: `complete_msg(bigint, text)`, the claim guard and the worker error checks.
- The Drive belt job was researched again at 17:48 and **stayed** in `needs_review`.
- Redirect links are followed: one landed on `partsouq.com`.
- The FP14/FP15 skip lists were cleaned up, and the S10 screens are at 100%.

---

## Open

**R3 — Commit and push.** All of this round's work is uncommitted (HEAD is still 74cc821d).

**R24 — The migration file name doesn't match production.**
- `20261101170000_catalog_research_r22_msg_claim.sql` was recorded in production as `20261101174616`. Rename the file to match.

**R25 — Trusted catalogue pages can't be read, so nothing can be confirmed.**
- **Seen live (17:48 run):**
  - the partsouq.com source came back `fetched_ok: false` (no number, no car);
  - one Google link was dropped as "untrusted" under the domain `vertexaisearch.cloud.google.com`, because its redirect failed. It wasn't actually an untrusted site.
- **Fix:**
  - **Record why.** Save `http_status`, the byte count and `final_url` on every source. When a redirect fails, record `reason: "redirect_failed"`, not "untrusted".
  - **Show it in Research settings (S10h).** Per trusted catalogue, show its last 10 fetch results. Mark a catalogue **"Blocked"** when its last 5 fetches all returned 403/429/503 or an empty page, so the owner can see which catalogues actually work.
  - **Fetch like a browser.** Use normal browser request headers (`User-Agent`, `Accept`, `Accept-Language`), not `RoamCatalogResearch/1`.
- **Confirm:** Retry the Drive belt job. Each source shows a real domain and an HTTP status.

**R26 — Brand and part-number spelling aren't cleaned up.**
- **Problem:** the 17:48 proposal has brand **"Toyota (OEM)"** and number **"9004831103"** (no dash). Promoting it would create a second Toyota spelling in the parts database, and the shape check can't recognise the number.
- **Fix:** before the checks, clean the brand (strip "(OEM)", "Genuine" and the like, and map to the existing `part_master.manufacturer` spelling). Put Toyota/Daihatsu numbers back in `5-5` form (`90048-31103`) and Honda numbers in `5-3-3`.
- **Test:** a Deno case for both.

**R27 — The FP13/FP16 skip lists still hide text that has to be built.**
- **FP13 skips** (all real Your-requests text):
  - the "Add a note or photo" form text ("Provide vehicle chassis sub-code, existing part photo, or … casing stamping to refine match:") and its **"Send note to Roam"** button;
  - the confirmation "✓ Additional metadata recorded and attached to …";
  - the empty-state line;
  - the help card ("Can't find a component in the standard parts catalog?" / "Simply trigger an OEM search …");
  - the "Unresolved" timeline label;
  - the "We'll try again on {date}" line.
- **FP14 skips:** the notice sub-line ("Resolved from OEM parts catalogue lookup requested on {date}") and the "Ask Roam … to research an alternative OEM part number for your chassis" line.
- **FP16 skips:** "Checking trusted catalogues. Usually identified within a day.", "What part?", "Catalog updated", "Assembly categories".
- **Fix:** remove these entries and build the text. Only sample values (dates, ids, part numbers, car names) and the strings below may stay.

---

### Porting rules (FP13–FP16; S10 rows are done)
- **All four:** the Fleet frame and footer. Not built: "Kingston Hub #01", "PARTS PROCUREMENT & TELEMETRY FITMENT · REGION JA-01", "EPC VERIFICATION PROTOCOL", the Kingston footer, the FP16 bottom tab bar, and the "Frame A / B / flow state" captions.
- **FP13:** "Matched and verified against … OEM EPC Japan catalogue" becomes "Checked against {domains}"; the "dispatch query" id is the request short id.
- **FP14:**
  - Spec row values only when stored.
  - "100% SPEC FIT" / "CERTIFIED" become "Fits this version".
  - VIN only if stored.
  - The area-card descriptions come from the existing page.
  - "Request variant research" = "Ask Roam to find another option".
- **FP15:**
  - Not built: "regional distributors", "customs and freight fees", "18 Caribbean hub distributors", "Priority Tier 1", "Auto-querying EPC …", "EPC Engine: Active …", "Prioritized by Community Demand", "this prevents catalogue throttling … automated EPC team", "co-requests aggregate part demand …".
  - "Compatibility: OEM …" = the Old part number field.

---

**Builder prompt:** "Read docs/fleet-find-parts-audit.md. Fix R24–R27, commit and push (R3), deploy catalog-research and the fleet site, then Retry the Drive belt job and confirm each source shows a real domain and HTTP status. Don't mark anything done."

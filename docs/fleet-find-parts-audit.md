# Roam Fleet · Find parts + Dominion Pending catalog — audit (Rev 44, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only. Don't mark anything done here or in the README.

**Rules:**
- Information only, parts only.
- No fleet ids or plates in Dominion.
- Port Stitch exactly; skip lists hold only sample values and excluded strings.
- Never invent catalog facts.

**Verified this round:**
- Pushed (174dcfe2), and the migration name matches production.
- Sources record their HTTP status, failed redirects are labelled `redirect_failed`, and Research settings shows "Blocked".
- Brands and numbers are cleaned (`Toyota 90048-31103`).
- The FP13/FP14/FP16 text is built.
- The Drive belt job ran again at 18:11 and stays in review.

---

## Open

**R28 — No catalogue page has ever been checked.**
- **Seen live (18:11 run):** all 3 Google source links returned **404** (`redirect_failed`). The only page that loaded was masuma.parts (200), which isn't on the trusted list. Across every run so far, **0 sources have been checked**, so nothing can be confirmed or added automatically.
- **Cause:** the source links are taken from the model's written JSON. When the model copies Google's long redirect links into its answer it mangles them, so they 404. The exact links are only in `groundingMetadata.groundingChunks[].web.uri`.
- **Fix:** in `catalog_research_gemini.ts`:
  - take source URLs **only** from `groundingChunks[].web.uri`. Match them to candidates with `groundingSupports[].groundingChunkIndices`; a support whose text contains the candidate's part number belongs to that candidate;
  - ignore any URL the model wrote itself;
  - keep `web.title` (Google puts the site's domain there) as the fallback domain when a redirect fails;
  - add `masuma.parts` to `catalog_trusted_source` as `aftermarket_catalog`, since it is the manufacturer's own catalogue.
- **Test:** a Deno case built from a recorded Gemini response with `groundingChunks` and `groundingSupports`.
- **Confirm:** Retry the Drive belt job. At least one source shows a real domain with HTTP 200 and `fetched_ok: true`.

**R29 — Built text is still on the Fleet skip lists.**
- **Problem:** the FP13/FP14/FP16 text is now built, but its entries are still in `sample-labels.json`, so the checker isn't checking it. Also, FP13's help card ("Can't find a component in the standard parts catalog?" / "Simply trigger an OEM search …") is **not** built.
- **Fix:**
  - remove the entries for built text: FP13's note-form text, "note to roam", "✓ additional metadata recorded …", the empty-state line, "unresolved", "we'll … on {date}"; FP14's "resolved from …" and "… research an alternative OEM part number …"; FP16's "…ing trusted catalogues. usually identified within a day.", "what part?", "catalog updated", "assembly categories";
  - build the FP13 help card;
  - re-run the checker to 100%.

---

**Builder prompt:** "Read docs/fleet-find-parts-audit.md. Fix R28 and R29, commit, push, deploy catalog-research and the fleet site, then Retry the Drive belt job and confirm a source shows HTTP 200 with fetched_ok true. Don't mark anything done."

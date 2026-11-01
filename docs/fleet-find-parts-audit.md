# Roam Fleet · Find parts + Dominion Pending catalog (parts) — audit (Rev 34, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only.

**Verified:**
- Pushed (c95f041a).
- The design files are unchanged.
- The area overlay is built (`Fp3AreaOverlay.tsx`), and its pictures match the designs closely.
- The "Sub-assemblies inside …" strip is gone.
- `BRK-SHOES` is set.
- The Dominion part-type editor has "Description (Find parts overlay)".
- The two find-parts migrations are committed.
- **Engineering closeout (Rev 34):** O2–O4 fixed in repo; stitch fidelity FP3 / FP3b / FP3c / FP3d / FP12b at **100%** on full label sets; FP3 stitch PNGs regenerated; vitest + Playwright stitch capture green.

**Rules:** information only, parts only, no customer names or plates in Dominion. Port Stitch exactly; never edit `docs/stitch/`. Never invent catalog facts or descriptions.

---

## O1 — Confirm the fleet site is deployed with the overlay (O2 footer fix on prod)

**Repo:** ready to ship (overlay footer + expanded meta + stitch fixtures + sample-labels cleanup).

**Production check (1 Nov 2026):** `www.roamfleet.co` main bundle already includes overlay copy ("Parts in this area", "Search instead", "Vehicle Configuration Verified"). It still includes **"when we have supplier confirmation"** until the next **roam-fleet** deploy.

**Fix:** Commit & Sync these changes, then run the **roam-fleet** path deploy ([`VERCEL_DEPLOY_HOOK_FLEET`](docs/vercel-path-deploy-setup.md) or GitHub `vercel-path-deploy` workflow). After promote, confirm the supplier phrase is gone from the JS bundle and: Find parts → Roomy → **Brakes** → overlay opens with grey footer bar.

---

## Owner (after O1 prod has Rev 34 fleet build)

1. Roomy → click **Brakes**: the overlay opens. Pick **Brake pads**; it goes straight to Which side?.
2. Which side? → Next. Results show 4 front pad sets.
3. "Same car, different badge" → **Ask Roam to find a Sister option**.
4. Dominion → Pending catalog → Parts shows "1 fleet · Sister option". Production still has **0** part requests.
5. **Data:** write the one-line description for each of the 37 part types in Dominion (Maintenance templates → part type → Description); none are written yet. Enter ABS / handbrake values when you have them.

**Tooling (repeat after overlay edits):** `node scripts/stitch-fidelity.mjs --report` (FP3 rows), `pnpm test:e2e:fleet:find-parts-capture`, `node scripts/clean-fp3-sample-labels.mjs` (do not re-run the old broad `patch-fp3-sample-labels.mjs` that re-added UI skips).

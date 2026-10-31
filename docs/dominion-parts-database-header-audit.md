# Dominion · Parts database — header and tabs audit (Rev 6, 30 Oct 2026)

Page: Dominion → Master data → Vehicles → **Parts database** (`?page=parts-catalog`). Audit only; no code was changed.

**Done since Rev 5:** three tabs (Verification queue gone, old `?tab=verify` links open Full database with Needs checking). Pager uses `p` and no longer wipes the address. Screen 12 is exported to `S42l-full-database.html`. Full database is ported: left filter panel, one table grouped OEM → Sister → Engine → Aftermarket → Universal, and it opens with nothing selected. In light mode it matches Stitch.

---

## Open

### 1 — High · Full database is not live
Production still runs the old search. It has no groups, no filter counts, and no Make / Model / Year. The new migration `20261031220000_catalog_master_groups.sql` is not applied, and fleet-core is not redeployed. On the live site this means:
- Make / Model / Year change nothing.
- Sister and Universal groups are empty, even though the filter says 2 and 5.
- Brand and Area counts show 0.

Production's migration history also doesn't match the repo. The search migration is recorded as `20261031000834`, but the repo file is `20261031180000`. The fitments change (`20261031160000`) is live but has no history row.

**Fix:**
1. Apply `20261031220000_catalog_master_groups.sql`.
2. Rename `20261031180000` to `20261031000834`, and record `20261031160000` as applied, so the repo matches production.
3. Deploy fleet-core.
4. Open Full database on the live site, pick Toyota → Roomy and check that the Sister and Universal groups fill.

### 2 — Medium · Dark mode is broken on Full database
- The filter panel and tables stay white on a dark page.
- The table header rows turn solid black.
- The match-type radio dots turn black.
- The "Parts database" title is dark on dark and can't be read.

**Fix:** use the dark colour tokens on every Full database panel, table header and radio, and on the title's colour. Change colours only, not layout. Check it next to Stitch's dark version (item 4).

### 3 — Medium · Phone layout breaks on Full database
- Parts rows become cards, but Sister and Universal stay as squeezed tables.
- The Universal table runs off the right edge of the screen.
- Group titles wrap one word per line ("Same / car, / different / badge").

**Fix:** at 390 px, show Sister and Universal rows as cards, the same way Parts rows are. Keep group titles on one line, with the count and button underneath.

### 4 — Low · Screen 12 pieces not built yet
Built to the exact Stitch design. Anything Stitch shows that the app lacks gets built:
- **Summary bar:** "INDEX UP-TO-DATE · 4MS LATENCY". Show the real time of the last catalog change and the real response time of the search.
- **"Nothing on file" line:** use Stitch's wording: "Nothing on file for: Fits the engine. · 0 records matched for current filter". Add the "+ Add an engine fitment" link (owner only) that opens Add a part.
- **Universal rows:** add the eye (view) button.
- **Drawer:**
  - Add "+ Add a car" next to "Cars it fits".
  - Rename "Verify fitment" to **Confirm fit**.
  - Owner box: show "Owner mode active: <initials>" and Stitch's staff-view sentence.
- **Footer card:** "Catalog notice: Master catalog dataset is stripped of customer pricing and sensitive trade terms. Zero PII stored." plus "SYSTEM ROLE: OWNER_RW" (STAFF for staff), read from the signed-in role.

### 5 — Low · Stitch files
- **Wrong tab name:** `S42h-find-parts-all.html` line 93 still says "Vehicle parts". Change it in Stitch and re-export.
- **No dark or phone version:** the S42l export has no dark version, and no real phone version (at 390 px it is the desktop page squeezed). Export both from Stitch for items 2 and 3.
- **README:** mark S42l **Ported** only when the light, dark and phone pictures match.

---

## Order
1. Item 1. Nothing else is visible live until it is done.
2. Items 2 and 3.
3. Items 4 and 5.
4. Commit everything. All of this work, including the three new migrations and the `full-database/` folder, is still uncommitted.

# In-House desk redesign: what's left

**Rev 4 · Done 2026-10-17** · Redesign live. Add section form + blank-name guard shipped (`8a19425e`) and deployed to `roamrush.app` (admin bundle shows Create section / e.g. Pizzas; old typed Section type prompt gone). Walk-through already passed at desktop and 390px.

**Verified:**
- Every dish type has its full editor again: choices, sizes, pizza, wings and combo, plus photo upload, archive, section types and Preview as customer.
- The Stitch mockups are no longer served (the old links fall back to the normal app page).
- The desk uses the console's amber.
- **Add section** uses an inline name + type form (no browser prompts); section name on the header is editable; type is always chosen from the labeled dropdown.
- Clearing a section name restores the previous name on blur; publish refuses blank section names.
- Walk-through matrix (desktop + 390px): Claim → place → Mark placed; "Card may have been used" → Verify charge resolve; pizza size/topping edit → Review & publish; archive dish + dish photo upload.

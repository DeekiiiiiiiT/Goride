# Find parts audit — Part A checklist (Rev 37)

Use this after deploying **admin** (roamdominion.co) and **platform-catalog** from the branch that includes pending drawer + Copy for search.

## Engineering deploy

1. `pnpm deploy:platform-catalog` (or CI promote).
2. Deploy Dominion admin frontend to production (Vercel project linked to `apps/admin`).
3. Confirm platform-catalog version on Supabase matches the commit with `buildPartSearchText` + pending routes.

## Live verification (product owner / QA)

- [ ] **Copy for search:** Pending catalog → open a part request drawer → click **Copy for search** → paste shows car + part + side + match type (no org/plate).
- [ ] **Sister walk:** Fleet → Brakes → Brake pads → Next → Ask Roam for a **Sister** option → Dominion Parts queue shows **1 fleet · Sister option** (after B2 intake is live).

## Owner-only (not code)

- [ ] Write **37 part-type descriptions** in Dominion: **Maintenance templates → part type → Description**.

When all boxes are checked, Part A is done.

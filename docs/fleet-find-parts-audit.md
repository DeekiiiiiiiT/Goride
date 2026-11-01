# Roam Fleet · Find parts + Dominion Pending catalog (parts) — audit (Rev 33, 31 Oct 2026)

**This is the only doc for this work.** Open items only.

---

## Owner live check (production still has 0 part requests)
1. Roomy → click **Brakes**: the overlay opens. Pick **Brake pads**; it goes straight to Which side?.
2. Which side? shows Front 4 on file, Back "None on file yet". Pick, then Next.
3. Results show 4 front pad sets. Press "Ask Roam to find a Sister option".
4. Dominion → Pending catalog → Parts shows "1 fleet · Sister option".
5. Click **Tires & wheels**: every row says "Not on file yet" with Ask Roam.

**Owner data:** write the one-line description for each part type in Dominion (37), and the ABS / handbrake values when you have them.

**Deploy (engineering):** `fleet-core` is deployed (browse, overlay meta, BRK-SHOES migration applied). Ship the **fleet** and **admin** frontends when this branch merges — Vercel production deploy failed locally on the monorepo install step; use your normal CI promote or fix the install script on Vercel.

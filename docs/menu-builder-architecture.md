# Menu builder: what's left

**Rev 8 · 2026-10-17** · The menu engine is live (`30d9834a`). The Menu library (§2) backend is **live**: the migration has been applied and `delivery` is deployed. The admin screen ships when the code is committed and pushed.

---

## 1. Domino's (ops)

1. **Publish Domino's.** Its draft has all 15 dishes, but nothing is published (`menu_versions` = 0). Steps: Confirm prices → Parity → Publish.
2. **Test order:** half-and-half pizza with light sauce and double cheese, then a sold-out dish (must be refused).
3. **Capture Domino's Jamaica's real options** with `docs/menu-chain-capture-playbook.md`, then republish and compare one order with their site.
4. **Repeat for Pizza Hut.**

---

## 2. Menu library: ship it

**Where:** In-House desk → **Menu library** tab. It has four sections:
- **Cuisines:** add, rename, archive, merge, delete when unused.
- **Starter kits:** create, edit, duplicate, archive, delete.
- **Dish templates:** build a dish once, reuse it with "+ From template…" in the menu builder.
- **Product types:** a read-only explanation of the six types.

The restaurant's Basics cuisine chips now read from this list, with an "Add or edit cuisines →" link.

**Product types stay in code.** Each of the six has its own price maths, editor, customer screen and ticket. New *kinds* of dish are dish templates. A new *behaviour* (for example, sold by weight) is an engineering change.

**Checked:**
- Deno tests: 6 new, 26 passing in the In-House set.
- menu-builder tests: 4 new, passing.
- No new type errors (admin 332 → 332; delivery unchanged).
- Both test sets are added to `ci.yml`.

**Live and checked:**
- Migration applied: 25 cuisines, and all 7 kits are linked by id (including chicken).
- The 4 combined labels were split. Values before the split:
  - Mario's Pizzeria: "Italian • Pizza"
  - The Burger Spot: "Burgers • Fast Food"
  - Green Life Bowls: "Healthy • Salads"
  - Island Grill: "Jamaican • Grill"
- `delivery` deployed: `GET /cuisines` returns 25, `/admin/menu-library` refuses requests with no login, and it boots without errors.

### Left

1. **Commit and push** so the admin gets the new tab.
2. **Migration history:** the migration was run in the SQL editor, so it isn't recorded. Run `supabase migration repair --status applied 20261017200000`. Re-running it is also safe, because every step is idempotent.
3. **Try it:**
   - Add "Soup", rename it, then delete it.
   - Make a "Jamaican plate" template (build your own) and add it to a menu with "From template".
   - Create a kit that uses it.

### Still open after shipping

- **Partner apps** (`dash-merchant`, `rush-command` profile screens) still use their own short cuisine list and write `cuisine_types` freely. Switch them to `GET /cuisines`. The signup `CUISINE_OPTIONS` constants are unused and can be deleted.
- **Business type "category tags"** are a second, separate food-label list. Decision needed. My recommendation is to keep them as specialty search tags, not cuisines.

# Menu builder: what's left

**Rev 5 · 2026-10-17** · The engineering is complete, committed (`30d9834a`) and live. The only thing left is the Domino's menu itself.

**Verified:**
- `delivery` v875 matches the repo for all 16 engine and checkout files.
- The live `roamrush.app` bundle includes the engine screens.
- Engine-only dishes now go through the sold-out and 14-day price checks. A missing price date is refused, and sold-out dishes and options are refused by the engine.
- CI runs the engine tests, the 15-dish parity test and the edge drift test.

---

## Left to do

1. **Publish Domino's.** Its draft has all 15 dishes, but nothing is published (`menu_versions` = 0), so customers still get the classic pizza screen. Steps: Confirm prices → Parity → Publish.
2. **Test order on the published menu:** a half-and-half pizza with light sauce and double cheese, then a sold-out dish (must be refused). Check the price, and that the buyer checklist shows every step.
3. **Capture Domino's Jamaica's real options** with `docs/menu-chain-capture-playbook.md`. Add them, republish, and compare one test order with the price on their site.
4. **Repeat for Pizza Hut** when you add it.

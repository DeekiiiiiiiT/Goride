# Menu engine — deploy & capture checklist

Engineering from the Rev 2 audit is in the repo. Use this order.

## 1. Commit (menu stack only)

Stage menu-engine / menu-builder / delivery / migration / admin / merchant / customer / docs / lockfiles. **Do not** include `apps/driver/**` branding.

## 2. Backend

- [x] Migration `20261017140000_menu_engine_draft_snapshot` applied on GoRide.
- [x] Deploy `delivery` edge (M1–M4 + merchant engine routes live as of this checklist).
- [ ] Redeploy `delivery` after N1 checkout gate + shadow `menu_items` sync on publish (Rev 4 closeout).
- [ ] Open In-House → Domino’s → Menu engine (Show). Empty draft auto-re-converts; confirm **15 products**.
- [ ] **Confirm all prices** (stamps `priceCheckedAt`), Parity clean, then Publish (review the diff confirm). Publish also upserts shadow `menu_items` for live sold-out.

## 3. Frontends

| App | When |
|---|---|
| dash-admin | After delivery deploy (ops convert/edit/publish) |
| dash-merchant / rush-command | Same wave (engine panel persists) |
| **dash-customer** | **Only after** a published Domino (or test) menu + M2 smoke |

## 4. Capture playbook

Follow [menu-chain-capture-playbook.md](menu-chain-capture-playbook.md) for Domino’s Jamaica, then Pizza Hut. Needs published engine + customer app.

## 5. Smoke (before customer prod)

1. Half-and-half + light sauce + double cheese → price + buyer checklist.
2. Mark a dish sold out after publish (Brand catalog or classic toggle) → checkout rejects.
3. Mark one topping sold out via option override → builder/checkout refuses without republish.
4. Stale / unconfirmed `priceCheckedAt` → In-House checkout rejects.
5. Reload admin mid-edit → draft still there.
6. Wings 12pc + 2 flavours and a 2-Medium deal (once on the published menu).

## 6. Ship order (Rev 4)

1. Commit menu stack only (no `apps/driver/**`) — ask agent when ready.
2. Redeploy `delivery`, then **dash-admin**.
3. Domino’s: Confirm prices → Parity → Publish → playbook capture.
4. E2E smoke (§5) against published menu.
5. Deploy **dash-customer** only after smoke passes.
